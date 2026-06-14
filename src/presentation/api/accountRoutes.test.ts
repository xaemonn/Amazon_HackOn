/**
 * Unit tests for Account Routes
 *
 * Verifies the HTTP API layer for account management:
 * - Auth middleware returns 401 on missing/invalid tokens
 * - Profile routes (GET/PUT)
 * - Address routes (GET/POST/PUT/DELETE/default)
 * - Payment method routes (GET/POST/DELETE)
 * - Notification preference routes (GET/PUT)
 * - Proper error mapping (400, 404, 409)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAccountRouter } from './accountRoutes.js';
import { AccountService } from '../../application/account/AccountService.js';
import { InMemoryCustomerRepository } from '../../infrastructure/persistence/InMemoryCustomerRepository.js';
import { InMemoryOtpStore } from '../../infrastructure/persistence/InMemoryOtpStore.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';
import { IdentityService } from '../../application/identity/IdentityService.js';
import { getConfig } from '../../infrastructure/config/index.js';
import { demoCustomer, DEMO_SESSION_TOKEN, DEMO_CUSTOMER_ID } from '../../infrastructure/seed/index.js';
import type { Customer } from '../../domain/account/Customer.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const customerRepo = new InMemoryCustomerRepository([demoCustomer]);
  const orderRepo = new InMemoryOrderRepository([]);
  const otpStore = new InMemoryOtpStore();

  // Pre-seed demo session
  void otpStore.saveSession({
    token: DEMO_SESSION_TOKEN,
    customerId: DEMO_CUSTOMER_ID,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });

  const config = getConfig();
  const identityService = new IdentityService(customerRepo, orderRepo, otpStore, config);
  const accountService = new AccountService(customerRepo);

  const app = express();
  app.use(express.json());
  app.use('/api/account', createAccountRouter(identityService, accountService));

  return { app, customerRepo, accountService };
}

const AUTH_HEADER = { Authorization: `Bearer ${DEMO_SESSION_TOKEN}` };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Account Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  // ── Auth Middleware ──────────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app).get('/api/account/profile');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('returns 401 when Authorization header has no Bearer prefix', async () => {
      const res = await request(app)
        .get('/api/account/profile')
        .set('Authorization', 'Basic abc123');
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is invalid', async () => {
      const res = await request(app)
        .get('/api/account/profile')
        .set('Authorization', 'Bearer invalid-token-xyz');
      expect(res.status).toBe(401);
    });

    it('returns 200 when a valid token is provided', async () => {
      const res = await request(app)
        .get('/api/account/profile')
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ── Profile ─────────────────────────────────────────────────────────────────

  describe('GET /account/profile', () => {
    it('returns the authenticated customer profile', async () => {
      const res = await request(app)
        .get('/api/account/profile')
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(DEMO_CUSTOMER_ID);
      expect(res.body.name).toBe(demoCustomer.name);
      expect(res.body.email).toBe(demoCustomer.email);
    });
  });

  describe('PUT /account/profile', () => {
    it('updates the customer name successfully', async () => {
      const res = await request(app)
        .put('/api/account/profile')
        .set(AUTH_HEADER)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('returns 400 when name is empty', async () => {
      const res = await request(app)
        .put('/api/account/profile')
        .set(AUTH_HEADER)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Name is required');
    });

    it('returns 400 when name field is missing', async () => {
      const res = await request(app)
        .put('/api/account/profile')
        .set(AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name field is required');
    });
  });

  // ── Addresses ───────────────────────────────────────────────────────────────

  describe('GET /account/addresses', () => {
    it('returns addresses sorted default-first', async () => {
      const res = await request(app)
        .get('/api/account/addresses')
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Demo customer has one default address
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].isDefault).toBe(true);
    });
  });

  describe('POST /account/addresses', () => {
    it('adds a new address successfully', async () => {
      const newAddress = {
        recipientName: 'Test User',
        streetLine1: '123 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      };

      const res = await request(app)
        .post('/api/account/addresses')
        .set(AUTH_HEADER)
        .send(newAddress);

      expect(res.status).toBe(201);
      expect(res.body.addresses.length).toBe(2); // one existing + one new
    });

    it('returns 400 on invalid address fields', async () => {
      const badAddress = {
        recipientName: '',
        streetLine1: '',
        city: '',
        state: '',
        pincode: 'abc',
        country: '',
      };

      const res = await request(app)
        .post('/api/account/addresses')
        .set(AUTH_HEADER)
        .send(badAddress);

      expect(res.status).toBe(400);
      expect(res.body.invalidFields).toBeDefined();
      expect(res.body.invalidFields.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /account/addresses/:id', () => {
    it('updates an existing address', async () => {
      // Get existing address ID
      const listRes = await request(app)
        .get('/api/account/addresses')
        .set(AUTH_HEADER);
      const addressId = listRes.body[0].id;

      const res = await request(app)
        .put(`/api/account/addresses/${addressId}`)
        .set(AUTH_HEADER)
        .send({ city: 'Chennai' });

      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent address', async () => {
      const res = await request(app)
        .put('/api/account/addresses/non-existent-id')
        .set(AUTH_HEADER)
        .send({ city: 'Chennai' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /account/addresses/:id', () => {
    it('removes an existing address', async () => {
      // Get existing address ID
      const listRes = await request(app)
        .get('/api/account/addresses')
        .set(AUTH_HEADER);
      const addressId = listRes.body[0].id;

      const res = await request(app)
        .delete(`/api/account/addresses/${addressId}`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.addresses.length).toBe(0);
    });

    it('returns 404 for non-existent address', async () => {
      const res = await request(app)
        .delete('/api/account/addresses/non-existent-id')
        .set(AUTH_HEADER);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /account/addresses/:id/default', () => {
    it('sets an address as default', async () => {
      // First add a second address
      await request(app)
        .post('/api/account/addresses')
        .set(AUTH_HEADER)
        .send({
          recipientName: 'Second',
          streetLine1: '456 Other St',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
        });

      // Get list and set new address as default
      const listRes = await request(app)
        .get('/api/account/addresses')
        .set(AUTH_HEADER);
      const nonDefaultAddr = listRes.body.find((a: { isDefault: boolean }) => !a.isDefault);

      const res = await request(app)
        .put(`/api/account/addresses/${nonDefaultAddr.id}/default`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const newDefault = res.body.addresses.find(
        (a: { id: string }) => a.id === nonDefaultAddr.id,
      );
      expect(newDefault.isDefault).toBe(true);
    });

    it('returns 404 for non-existent address', async () => {
      const res = await request(app)
        .put('/api/account/addresses/non-existent-id/default')
        .set(AUTH_HEADER);

      expect(res.status).toBe(404);
    });
  });

  // ── Payment Methods ─────────────────────────────────────────────────────────

  describe('GET /account/payment-methods', () => {
    it('returns payment methods', async () => {
      const res = await request(app)
        .get('/api/account/payment-methods')
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Demo customer has UPI + COD
      expect(res.body.length).toBe(2);
    });
  });

  describe('POST /account/payment-methods', () => {
    it('adds a UPI payment method', async () => {
      const res = await request(app)
        .post('/api/account/payment-methods')
        .set(AUTH_HEADER)
        .send({ type: 'upi', upiId: 'newuser@ybl' });

      expect(res.status).toBe(201);
    });

    it('returns 409 on duplicate UPI ID', async () => {
      const res = await request(app)
        .post('/api/account/payment-methods')
        .set(AUTH_HEADER)
        .send({ type: 'upi', upiId: 'priya@okaxis' }); // existing UPI

      expect(res.status).toBe(409);
    });

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/api/account/payment-methods')
        .set(AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type is required');
    });

    it('returns 400 when cap is exceeded', async () => {
      // Add 8 more methods to reach cap of 10 (already have 2)
      for (let i = 0; i < 8; i++) {
        await request(app)
          .post('/api/account/payment-methods')
          .set(AUTH_HEADER)
          .send({ type: 'upi', upiId: `user${i}@bank` });
      }

      // The 11th should fail
      const res = await request(app)
        .post('/api/account/payment-methods')
        .set(AUTH_HEADER)
        .send({ type: 'cod' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot add more than');
    });
  });

  describe('DELETE /account/payment-methods/:id', () => {
    it('removes a payment method', async () => {
      // Get list first
      const listRes = await request(app)
        .get('/api/account/payment-methods')
        .set(AUTH_HEADER);
      const methodId = listRes.body[0].id;

      const res = await request(app)
        .delete(`/api/account/payment-methods/${methodId}`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent method', async () => {
      const res = await request(app)
        .delete('/api/account/payment-methods/non-existent-id')
        .set(AUTH_HEADER);

      expect(res.status).toBe(404);
    });
  });

  // ── Notification Preferences ────────────────────────────────────────────────

  describe('GET /account/notifications', () => {
    it('returns notification preferences', async () => {
      const res = await request(app)
        .get('/api/account/notifications')
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      // All enabled by default
      expect(res.body.order_placed).toBeDefined();
      expect(res.body.order_placed.email).toBe(true);
      expect(res.body.order_placed.sms).toBe(true);
    });
  });

  describe('PUT /account/notifications', () => {
    it('updates notification preferences (partial)', async () => {
      const res = await request(app)
        .put('/api/account/notifications')
        .set(AUTH_HEADER)
        .send({
          order_placed: { email: false },
        });

      expect(res.status).toBe(200);
      expect(res.body.order_placed.email).toBe(false);
      // Other channels untouched
      expect(res.body.order_placed.sms).toBe(true);
      expect(res.body.order_placed.push).toBe(true);
    });
  });
});
