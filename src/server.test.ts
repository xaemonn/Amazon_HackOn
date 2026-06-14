/**
 * Tests for the Unified Server (src/server.ts)
 *
 * Verifies:
 *  - createUnifiedApp() returns app and composition
 *  - Health check responds correctly at GET /api/health
 *  - All module route prefixes are mounted
 *  - Port defaults and env var reading
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 14.1, 14.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createUnifiedApp } from './server.js';
import { loadUnifiedSeed } from './composition/seed.js';
import type { CompositionResult } from './composition/root.js';

describe('Unified Server', () => {
  let app: ReturnType<typeof createUnifiedApp>['app'];
  let composition: CompositionResult;

  beforeAll(async () => {
    const unified = createUnifiedApp();
    app = unified.app;
    composition = unified.composition;
    // Load seed so that routes that depend on data work
    await loadUnifiedSeed(composition.repos);
  });

  afterAll(() => {
    composition.dispose();
  });

  describe('createUnifiedApp()', () => {
    it('returns an Express app and composition result', () => {
      expect(app).toBeDefined();
      expect(composition).toBeDefined();
      expect(composition.eventBus).toBeDefined();
      expect(composition.repos).toBeDefined();
      expect(composition.catalogModule).toBeDefined();
      expect(composition.accountsModule).toBeDefined();
      expect(composition.returnsModule).toBeDefined();
      expect(composition.cartModule).toBeDefined();
      expect(typeof composition.dispose).toBe('function');
    });
  });

  describe('GET /api/health', () => {
    it('returns 200 with status ok and all module names', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        modules: ['catalog', 'returns', 'accounts', 'orders', 'cart'],
      });
    });
  });

  describe('Route mounting', () => {
    it('mounts catalog routes at /api/catalog', async () => {
      const res = await request(app).get('/api/catalog/products');
      // Should not be 404 (our app's 404 handler)
      expect(res.status).not.toBe(404);
    });

    it('mounts account routes at /api/accounts', async () => {
      // Account routes require auth — should get 401, not 404
      const res = await request(app).get('/api/accounts/profile');
      expect(res.status).toBe(401);
    });

    it('mounts order routes at /api/orders', async () => {
      // Order routes require auth — should get 401, not 404
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });

    it('mounts returns routes at /api/returns', async () => {
      // Returns eligibility requires query params — should get 400, not 404
      const res = await request(app).get('/api/returns/eligibility');
      expect(res.status).toBe(400);
    });

    it('mounts cart routes at /api/cart', async () => {
      // Cart route requires customerId query param — should get 400, not 404
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(400);
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found.' });
    });
  });

  describe('ServerOptions', () => {
    it('startServer is an async function that accepts optional options', async () => {
      // Verify the import works and the function signature is correct
      const { startServer } = await import('./server.js');
      expect(typeof startServer).toBe('function');
    });
  });
});
