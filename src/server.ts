/**
 * Unified Express Server — Second Life Commerce
 *
 * Single entry point that wires all modules via the composition root,
 * loads the unified seed data, then mounts all module routes under one
 * Express application.
 *
 * Exports:
 *  - createUnifiedApp() — builds the app synchronously (seed not yet loaded)
 *  - startServer(options?) — full async startup: compose → seed → listen
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 14.1, 14.3
 */

import http from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';

import { createCompositionRoot, type CompositionResult } from './composition/root.js';
import { loadUnifiedSeed } from './composition/seed.js';

import { createCatalogRouter } from './presentation/api/catalogRoutes.js';
import { createAccountRouter } from './presentation/api/accountRoutes.js';
import { createOrdersRouter } from './presentation/api/ordersRoutes.js';
import { createReturnsRouter } from './presentation/api/returnsRoutes.js';
import { createCartRouter } from './presentation/api/cartRoutes.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServerOptions {
  port?: number;
}

// ─── createUnifiedApp ────────────────────────────────────────────────────────

/**
 * Creates the unified Express application and composition root.
 *
 * This function is synchronous:
 *  1. Calls createCompositionRoot() to wire all modules
 *  2. Configures Express middleware
 *  3. Mounts all module routes
 *
 * The seed has NOT been loaded at this point — call loadUnifiedSeed()
 * separately before accepting requests.
 */
export function createUnifiedApp(): { app: express.Express; composition: CompositionResult } {
  // 1. Compose all modules
  const composition = createCompositionRoot();

  // 2. Create Express app
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────

  app.use(express.json({ limit: '1mb' }));

  const allowedOrigins = process.env['ZTR_CORS_ORIGINS']?.split(',') ?? ['*'];
  app.use(cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // ── Health Check ───────────────────────────────────────────────────────────

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      modules: ['catalog', 'returns', 'accounts', 'orders', 'cart'],
    });
  });

  // ── Module Routes ──────────────────────────────────────────────────────────

  // Catalog at /api/catalog
  app.use(
    '/api/catalog',
    createCatalogRouter(composition.catalogModule.catalogService),
  );

  // Accounts at /api/accounts
  app.use(
    '/api/accounts',
    createAccountRouter(
      composition.accountsModule.identityService,
      composition.accountsModule.accountService,
    ),
  );

  // Orders at /api/orders
  app.use(
    '/api/orders',
    createOrdersRouter(
      composition.accountsModule.ordersService,
      composition.accountsModule.identityService,
    ),
  );

  // Returns at /api/returns
  app.use(
    '/api/returns',
    createReturnsRouter(composition.returnsModule.returnsFacade as any),
  );

  // Cart at /api/cart
  app.use(
    '/api/cart',
    createCartRouter(
      composition.cartModule.cartService,
      composition.cartModule.checkoutService,
    ),
  );

  // ── 404 Handler ────────────────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // ── Global Error Handler ───────────────────────────────────────────────────

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[UnifiedServer] Unhandled error:', err);
    res.status(500).json({ error: 'An internal error occurred. Please try again.' });
  });

  return { app, composition };
}

// ─── startServer ─────────────────────────────────────────────────────────────

/**
 * Full async startup sequence:
 *  1. createCompositionRoot() (via createUnifiedApp)
 *  2. loadUnifiedSeed(composition.repos)
 *  3. app.listen(port)
 *
 * If composition or seed throws, logs the error and exits with code 1.
 */
export async function startServer(options?: ServerOptions): Promise<http.Server> {
  const port = options?.port ?? parseInt(process.env['PORT'] ?? '3001', 10);

  let composition: CompositionResult | undefined;

  try {
    // 1. Create composition root + Express app
    const unified = createUnifiedApp();
    composition = unified.composition;

    // 2. Load seed data (must complete before accepting connections)
    await loadUnifiedSeed(composition.repos);

    // 3. Start listening
    const server = unified.app.listen(port, () => {
      console.log(`[Second Life Commerce] Server running on http://localhost:${port}`);
      console.log(`[Second Life Commerce] Health: http://localhost:${port}/api/health`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('[Second Life Commerce] Shutting down...');
      server.close(() => {
        composition?.dispose();
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return server;
  } catch (error) {
    console.error('[Second Life Commerce] Failed to start server:', error);
    process.exit(1);
  }
}
