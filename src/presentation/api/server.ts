/**
 * Express API Server — Zero-Touch Returns
 *
 * Entry point for the HTTP API. Creates an Express app with:
 *  - JSON body parsing
 *  - CORS support (configurable origin)
 *  - Returns routes mounted at /api/returns
 *  - Health check at /api/health
 *  - Error handling middleware
 *
 * Wires routes to ReturnsFacade via the DI composition root.
 *
 * Port: configurable via ZTR_API_PORT env var (default 3001).
 *
 * Requirements: 1.5, 8.1, 8.4, 12.3
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import mongoose from 'mongoose';
import { createContainer } from '../../infrastructure/config/container.js';
import { initializeHeroPathWiring } from '../../application/hero-path-wiring.js';
import { createReturnsRouter } from './returnsRoutes.js';
import { createCatalogRouter } from './catalogRoutes.js';
import { createAuthRouter } from './authRoutes.js';
import { createOrdersRouter } from './ordersRoutes.js';
import { createResaleRouter } from './resaleRoutes.js';
import { createJudgeRouter } from './judgeRoutes.js';
import { createProductsRouter } from './productsRoutes.js';
import { createReviewRouter } from './reviewRoutes.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';
import { demoPrepaidOrder, demoCodOrder } from '../../infrastructure/seed/index.js';
import { seedDemoUsersAndOrders, seedOrderForCustomer, DEMO_USERS } from '../../infrastructure/seed/demoUsers.js';
import type { MockAuthService } from '../../infrastructure/auth/MockAuthService.js';

// ─── App Factory ─────────────────────────────────────────────────────────────

/**
 * Create and configure the Express application.
 * Exported so tests can create an app without starting the server.
 */
export function createApp() {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────

  // Parse JSON request bodies. Limit is generous because the judge test
  // harness submits product images as base64 data URLs.
  app.use(express.json({ limit: '25mb' }));

  // Enable CORS (configurable origin, defaults to all origins for dev/demo)
  const allowedOrigins = process.env['ZTR_CORS_ORIGINS']?.split(',') ?? ['*'];
  app.use(cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // ── DI Bootstrap ───────────────────────────────────────────────────────────

  const container = createContainer();
  const returnsFacade = container.getRequired('returnsFacade');

  // Initialize hero-path event wiring (ItemGraded → Graded with assessment,
  // DispositionAssigned → final state with decision attached to entity).
  // MUST be called BEFORE dispositionOrchestrator.initialize() so that
  // GradingCompleteHandler transitions Grading → Graded before DispositionOrchestrator
  // processes the same ItemGraded event.
  initializeHeroPathWiring({
    eventBus: container.getRequired('eventBus'),
    returnRequestRepository: container.getRequired('returnRequestRepository'),
    conditionAssessmentRepository: container.getRequired('conditionAssessmentRepository'),
    dispositionDecisionRepository: container.getRequired('dispositionDecisionRepository'),
  });

  // Now initialize DispositionOrchestrator's ItemGraded subscription AFTER
  // GradingCompleteHandler is subscribed (ensures correct ordering).
  const dispositionOrchestrator = container.getRequired('dispositionOrchestrator') as {
    initialize(): void;
  };
  dispositionOrchestrator.initialize();

  // ── Shell services (order repo, auth) ──────────────────────────────────────

  const orderRepo = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);

  // ── Routes ─────────────────────────────────────────────────────────────────

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'zero-touch-returns-api',
    });
  });

  app.use('/api/products', createProductsRouter());
  app.use('/api/catalog', createCatalogRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api/orders', createOrdersRouter(orderRepo, container.getRequired('authService') as MockAuthService));
  app.use('/api/returns', createReturnsRouter(returnsFacade));
  // Judge test harness — add a product + images, then test the return flow.
  app.use('/api/judge', createJudgeRouter(orderRepo, container.getRequired('authService') as MockAuthService));

  // Resale marketplace (relisting / circular commerce)
  const resaleService = container.getRequired('resaleService');
  app.use('/api/resale', createResaleRouter(resaleService));
  app.use('/api/reviews', createReviewRouter());

  // Background sweeper: resolve lapsed local-buyer windows
  // (Grade A → warehouse, Grade C → keep-offer). Runs every 60s.
  const resaleSweeper = setInterval(() => {
    void resaleService.expireDue().then((r) => {
      if (r.returnedToWarehouse > 0 || r.keepOffersExtended > 0) {
        console.log('[ResaleSweeper] resolved windows', r);
      }
    }).catch((err: unknown) => {
      console.error('[ResaleSweeper] error', err);
    });
  }, 60_000);
  // Don't keep the event loop alive solely for the sweeper.
  if (typeof resaleSweeper.unref === 'function') resaleSweeper.unref();

  // ── Media upload: PUT /api/media/:returnId/:filename ───────────────────────
  // Accepts raw image/video bytes and saves them to ./uploads/{returnId}/{filename}
  // so BedrockConditionGrader can read the actual bytes during grading.
  app.put(
    '/api/media/:returnId/:filename',
    express.raw({ type: ['image/*', 'video/*'], limit: '50mb' }),
    async (req: Request, res: Response) => {
      const { returnId, filename } = req.params as { returnId: string; filename: string };

      if (!/^[\w-]+$/.test(returnId) || !/^[\w.-]+$/.test(filename)) {
        res.status(400).json({ error: 'Invalid returnId or filename.' });
        return;
      }

      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Empty body. Send raw image/video bytes.' });
        return;
      }

      const dir = path.resolve('./uploads', returnId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, filename), body);

      res.status(200).json({ storageKey: `${returnId}/${filename}` });
    },
  );

  // ── Media download: GET /api/media/:returnId/:filename ────────────────────
  // Serves the customer's uploaded return photos so marketplace listings can
  // display actual return images instead of catalog imagery.
  app.get(
    '/api/media/:returnId/:filename',
    async (req: Request, res: Response) => {
      const { returnId, filename } = req.params as { returnId: string; filename: string };

      if (!/^[\w-]+$/.test(returnId) || !/^[\w.-]+$/.test(filename)) {
        res.status(400).json({ error: 'Invalid path.' });
        return;
      }

      const filePath = path.resolve('./uploads', returnId, filename);
      try {
        await fs.access(filePath);
        const ext = path.extname(filename).toLowerCase().slice(1);
        const mime =
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
          ext === 'png'  ? 'image/png'  :
          ext === 'webp' ? 'image/webp' :
          'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(filePath);
      } catch {
        res.status(404).json({ error: 'Media not found.' });
      }
    },
  );

  // ── 404 Handler ────────────────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // ── Global Error Handler ───────────────────────────────────────────────────

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: 'An internal error occurred. Please try again.' });
  });

  const authService = container.getRequired('authService') as MockAuthService;
  return { app, container, orderRepo, authService };
}

// ─── Server Start ────────────────────────────────────────────────────────────

/**
 * Start the Express server on the configured port.
 * Only runs when this file is the entry point (not when imported for testing).
 */
export async function startServer() {
  const port = parseInt(process.env['ZTR_API_PORT'] ?? '3001', 10);
  const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/amazon2';

  // Connect to MongoDB before starting HTTP server.
  // Fast-fail (5s) so a missing/unreachable DB doesn't block startup for ~30s.
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5_000 });
    console.log(`[MongoDB] Connected to ${mongoUri}`);
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err instanceof Error ? err.message : err);
    console.error('[MongoDB] Auth features will not work. Set MONGODB_URI in .env');
  }

  const { app, orderRepo, authService } = createApp();

  // Always seed in-memory orders for named demo accounts under their stable IDs.
  // This guarantees prince@gmail.com / priya@gmail.com can use the return flow
  // even when MongoDB is unreachable (login falls back to in-memory credentials).
  const STABLE_IDS = ['seed-prince', 'seed-priya'];
  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i]!;
    const stableId = STABLE_IDS[i]!;
    await seedOrderForCustomer(orderRepo, authService as MockAuthService, stableId, u.name.toLowerCase(), u.items);
  }

  // Also seed into MongoDB (upserts the real Mongo-ID records for full auth).
  try {
    await seedDemoUsersAndOrders({ orderRepo, authService });
  } catch (err) {
    console.error('[Seed] Demo user seeding failed:', err instanceof Error ? err.message : err);
  }

  const server = app.listen(port, () => {
    console.log(`[Zero-Touch Returns API] Server running on http://localhost:${port}`);
    console.log(`[Zero-Touch Returns API] Health: http://localhost:${port}/api/health`);
    console.log(`[Zero-Touch Returns API] Returns: http://localhost:${port}/api/returns`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Zero-Touch Returns API] SIGTERM received, shutting down...');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('[Zero-Touch Returns API] SIGINT received, shutting down...');
    server.close(() => process.exit(0));
  });

  return server;
}

// Auto-start when run directly
const isMainModule = process.argv[1]?.endsWith('server.ts') ||
  process.argv[1]?.endsWith('server.js');

if (isMainModule) {
  startServer();
}
