/**
 * Property-Based Tests: IAuthService Correctness Properties
 *
 * Tests three properties of IdentityService as an IAuthService implementation:
 *
 * 1. **Ownership correctness** — verifyOwnership(c, i) === (getOrderItem(i)?.customerId === c)
 * 2. **Customer isolation** — getOrderItemsByCustomer(C1.id) ∩ getOrderItemsByCustomer(C2.id) = ∅
 * 3. **Round-trip authentication** — authenticate(session.token) returns customer with session.customerId
 *
 * **Validates: Requirements 2 (correctness properties), 11 (correctness properties)**
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { expect } from 'vitest';
import { IdentityService } from './IdentityService.js';
import { InMemoryCustomerRepository } from '../../infrastructure/persistence/InMemoryCustomerRepository.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';
import { InMemoryOtpStore } from '../../infrastructure/persistence/InMemoryOtpStore.js';
import { defaultAllEnabled } from '../../domain/account/NotificationPreferences.js';
import { DEFAULT_CONFIG } from '../../infrastructure/config/index.js';
import type { Customer } from '../../domain/account/Customer.js';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a non-empty alphanumeric ID string (safe for use as map keys).
 */
const idArb = fc.stringMatching(/^[a-z0-9]{4,12}$/);

/**
 * Generates a Customer object with the given id.
 */
const customerArb = (id: string): Customer => ({
  id,
  name: 'Test User',
  email: `${id}@test.example.com`,
  addresses: [],
  paymentMethods: [],
  notificationPreferences: defaultAllEnabled(),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

/**
 * Generates an OrderItem for a given customerId and itemId.
 */
const orderItemArb = (itemId: string, orderId: string, customerId: string): OrderItem => ({
  id: itemId,
  orderId,
  customerId,
  productId: `prod-${itemId}`,
  variantId: `var-${itemId}`,
  productName: `Product ${itemId}`,
  productImage: `https://example.com/${itemId}.jpg`,
  unitPrice: 999,
  quantity: 1,
  deliveryDate: new Date('2024-06-01'),
  deliveryStatus: 'delivered',
  refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
});

/**
 * Generates an Order containing a single item.
 */
const orderArb = (orderId: string, customerId: string, item: OrderItem): Order => ({
  id: orderId,
  customerId,
  placedDate: new Date('2024-05-01'),
  status: 'delivered',
  paymentType: 'prepaid',
  items: [item],
});

// ─── Property 1: Ownership Correctness ────────────────────────────────────────
//
// FOR ALL (customerId, orderItemId) pairs present in the repo,
// verifyOwnership(customerId, orderItemId) === (getOrderItem(orderItemId)?.customerId === customerId)
//
// Validates: Requirements 11 (Ownership correctness)

describe('IdentityService — Property 1: Ownership Correctness', () => {
  /**
   * **Validates: Requirements 2, 11**
   *
   * verifyOwnership(c, i) must agree with getOrderItem(i)?.customerId === c
   * for every (customer, item) combination we can query — including cross-customer lookups,
   * unknown customers, and unknown items.
   */
  it('verifyOwnership(c, i) === (getOrderItem(i)?.customerId === c) for all (c, i) pairs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two distinct customer IDs
        fc.uniqueArray(idArb, { minLength: 2, maxLength: 2 }),
        // Generate 1–3 item IDs per customer
        fc.array(idArb, { minLength: 1, maxLength: 3 }),
        fc.array(idArb, { minLength: 1, maxLength: 3 }),
        async (customerIds, itemIdsA, itemIdsB) => {
          const [custA, custB] = customerIds;

          // Ensure item IDs are unique across both customers to avoid collisions
          const uniqueItemIdsA = [...new Set(itemIdsA)];
          const uniqueItemIdsB = [...new Set(itemIdsB)].filter((id) => !uniqueItemIdsA.includes(id));
          if (uniqueItemIdsB.length === 0) return; // skip degenerate case

          // Build orders: one order per item for simplicity
          const ordersA: Order[] = uniqueItemIdsA.map((itemId, idx) => {
            const orderId = `ord-${custA}-${idx}`;
            const item = orderItemArb(itemId, orderId, custA);
            return orderArb(orderId, custA, item);
          });

          const ordersB: Order[] = uniqueItemIdsB.map((itemId, idx) => {
            const orderId = `ord-${custB}-${idx}`;
            const item = orderItemArb(itemId, orderId, custB);
            return orderArb(orderId, custB, item);
          });

          const orderRepo = new InMemoryOrderRepository([...ordersA, ...ordersB]);
          const customerRepo = new InMemoryCustomerRepository([
            customerArb(custA),
            customerArb(custB),
          ]);
          const otpStore = new InMemoryOtpStore();
          const service = new IdentityService(customerRepo, orderRepo, otpStore, DEFAULT_CONFIG);

          // Test all (customer, item) cross products — including cross-customer and unknown lookups
          const allCustomers = [custA, custB, 'unknown-cust'];
          const allItems = [...uniqueItemIdsA, ...uniqueItemIdsB, 'unknown-item'];

          for (const customerId of allCustomers) {
            for (const itemId of allItems) {
              const ownershipResult = await service.verifyOwnership(customerId, itemId);
              const orderItem = await service.getOrderItem(itemId);
              const expected = orderItem?.customerId === customerId;

              expect(ownershipResult).toBe(expected);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: Customer Isolation ───────────────────────────────────────────
//
// FOR ALL customers C1 ≠ C2, the item IDs in getOrderItemsByCustomer(C1.id) and
// getOrderItemsByCustomer(C2.id) are completely disjoint.
//
// Validates: Requirements 11 (Customer isolation in getOrderItemsByCustomer)

describe('IdentityService — Property 2: Customer Isolation', () => {
  /**
   * **Validates: Requirements 2, 11**
   *
   * No item seeded under customer C1 ever appears in customer C2's results,
   * and vice versa. The intersection of both result sets must always be empty.
   */
  it('getOrderItemsByCustomer(C1) and getOrderItemsByCustomer(C2) are disjoint by id', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Two distinct customer IDs
        fc.uniqueArray(idArb, { minLength: 2, maxLength: 2 }),
        // 1–4 item IDs for each customer (unique overall)
        fc.uniqueArray(idArb, { minLength: 2, maxLength: 8 }),
        async (customerIds, allItemIds) => {
          const [custA, custB] = customerIds;

          // Split item pool evenly between the two customers
          const half = Math.floor(allItemIds.length / 2);
          if (half === 0) return; // need at least one item per customer

          const itemIdsA = allItemIds.slice(0, half);
          const itemIdsB = allItemIds.slice(half);

          if (itemIdsA.length === 0 || itemIdsB.length === 0) return;

          const ordersA: Order[] = itemIdsA.map((itemId, idx) => {
            const orderId = `ord-${custA}-${idx}`;
            const item = orderItemArb(itemId, orderId, custA);
            return orderArb(orderId, custA, item);
          });

          const ordersB: Order[] = itemIdsB.map((itemId, idx) => {
            const orderId = `ord-${custB}-${idx}`;
            const item = orderItemArb(itemId, orderId, custB);
            return orderArb(orderId, custB, item);
          });

          const orderRepo = new InMemoryOrderRepository([...ordersA, ...ordersB]);
          const customerRepo = new InMemoryCustomerRepository([
            customerArb(custA),
            customerArb(custB),
          ]);
          const otpStore = new InMemoryOtpStore();
          const service = new IdentityService(customerRepo, orderRepo, otpStore, DEFAULT_CONFIG);

          const resultsA = await service.getOrderItemsByCustomer(custA);
          const resultsB = await service.getOrderItemsByCustomer(custB);

          const idsA = new Set(resultsA.map((i) => i.id));
          const idsB = new Set(resultsB.map((i) => i.id));

          // Disjointness: no id from A appears in B
          for (const id of idsA) {
            expect(idsB.has(id)).toBe(false);
          }

          // Disjointness: no id from B appears in A
          for (const id of idsB) {
            expect(idsA.has(id)).toBe(false);
          }

          // Correctness: all returned items for A actually belong to A
          for (const item of resultsA) {
            expect(item.customerId).toBe(custA);
          }

          // Correctness: all returned items for B actually belong to B
          for (const item of resultsB) {
            expect(item.customerId).toBe(custB);
          }

          // Completeness: all seeded items for A appear in A's results
          for (const itemId of itemIdsA) {
            expect(idsA.has(itemId)).toBe(true);
          }

          // Completeness: all seeded items for B appear in B's results
          for (const itemId of itemIdsB) {
            expect(idsB.has(itemId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Round-Trip Authentication ─────────────────────────────────────
//
// FOR ALL Sessions saved via otpStore.saveSession(session),
// authenticate(session.token) returns a Customer with id === session.customerId
// (provided the session is not expired and the customer exists in the repo).
//
// Validates: Requirements 2 (Round-trip authentication)

describe('IdentityService — Property 3: Round-Trip Authentication', () => {
  /**
   * **Validates: Requirements 2, 11**
   *
   * Any session saved directly into the store must be round-trippable:
   * authenticate(token) returns the customer matching session.customerId.
   */
  it('authenticate(session.token) returns customer with id === session.customerId', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 independent (customerId, token) pairs
        fc.array(
          fc.record({
            customerId: idArb,
            token: fc.stringMatching(/^[a-z0-9]{8,16}$/),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (sessions) => {
          // De-duplicate by customerId and token to avoid collisions
          const seenCustomers = new Set<string>();
          const seenTokens = new Set<string>();
          const uniqueSessions = sessions.filter((s) => {
            if (seenCustomers.has(s.customerId) || seenTokens.has(s.token)) return false;
            seenCustomers.add(s.customerId);
            seenTokens.add(s.token);
            return true;
          });
          if (uniqueSessions.length === 0) return;

          // Build repos: one customer per session
          const customers: Customer[] = uniqueSessions.map((s) => customerArb(s.customerId));
          const customerRepo = new InMemoryCustomerRepository(customers);
          const orderRepo = new InMemoryOrderRepository([]);
          const otpStore = new InMemoryOtpStore();
          const service = new IdentityService(customerRepo, orderRepo, otpStore, DEFAULT_CONFIG);

          // Save each session with a far-future expiry (valid, not expired)
          for (const s of uniqueSessions) {
            await otpStore.saveSession({
              token: s.token,
              customerId: s.customerId,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
          }

          // Verify each token round-trips to the correct customer
          for (const s of uniqueSessions) {
            const result = await service.authenticate(s.token);
            expect(result).not.toBeNull();
            expect(result!.id).toBe(s.customerId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2, 11**
   *
   * Expired sessions must not authenticate — authenticate(token) returns null
   * when the session's expiresAt is in the past.
   */
  it('authenticate returns null for expired sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,
        fc.stringMatching(/^[a-z0-9]{8,16}$/),
        async (customerId, token) => {
          const customerRepo = new InMemoryCustomerRepository([customerArb(customerId)]);
          const orderRepo = new InMemoryOrderRepository([]);
          const otpStore = new InMemoryOtpStore();
          const service = new IdentityService(customerRepo, orderRepo, otpStore, DEFAULT_CONFIG);

          // Save session with expiry 1 second in the past
          await otpStore.saveSession({
            token,
            customerId,
            expiresAt: new Date(Date.now() - 1000),
          });

          const result = await service.authenticate(token);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 2, 11**
   *
   * Tokens that were never saved must return null.
   */
  it('authenticate returns null for unknown tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z0-9]{8,16}$/),
        async (token) => {
          const customerRepo = new InMemoryCustomerRepository([]);
          const orderRepo = new InMemoryOrderRepository([]);
          const otpStore = new InMemoryOtpStore();
          const service = new IdentityService(customerRepo, orderRepo, otpStore, DEFAULT_CONFIG);

          const result = await service.authenticate(token);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});
