/**
 * Property-Based Tests: OrdersService Correctness Properties
 *
 * Tests three properties of OrdersService:
 *
 * 1. **Customer isolation** — for any two distinct customers, `getOrdersByCustomer` results
 *    are disjoint by order id
 * 2. **Idempotent refund reflection** — processing `RefundIssued(orderItemId, amount)` N times
 *    produces the same `refundStatus` as processing it once
 * 3. **Graceful unknown-order handling** — processing `RefundIssued` for a non-existent
 *    `orderItemId` does not throw and does not alter any other item's `refundStatus`
 *
 * **Validates: Requirements 7 (correctness property), 10 (correctness properties)**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { OrdersService } from './OrdersService.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { RefundStatus } from '../../domain/ordering/RefundStatus.js';
import type { IReturnsFacade } from '../returns/index.js';
import type { IEventBus, EventHandler, DomainEvent } from '../../domain/shared/events.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const NONE_REFUND: RefundStatus = {
  code: 'none',
  amount: null,
  currency: null,
  issuedAt: null,
};

/** Generates a safe alphanumeric ID. */
const idArb = fc.stringMatching(/^[a-z0-9]{4,12}$/);

/** Generates a positive integer suitable for amounts (1–9999). */
const amountArb = fc.integer({ min: 1, max: 9999 });

/** Generates a repeat count for idempotence testing (2–5). */
const repeatCountArb = fc.integer({ min: 2, max: 5 });

/**
 * Builds an OrderItem with the given IDs.
 */
function buildOrderItem(itemId: string, orderId: string, customerId: string): OrderItem {
  return {
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
    refundStatus: NONE_REFUND,
  };
}

/**
 * Builds an Order containing given items.
 */
function buildOrder(orderId: string, customerId: string, items: OrderItem[]): Order {
  return {
    id: orderId,
    customerId,
    placedDate: new Date('2024-05-01'),
    status: 'delivered',
    paymentType: 'prepaid',
    items,
  };
}

/**
 * Creates a minimal mock IReturnsFacade (not exercised in these tests).
 */
function makeMockReturnsFacade(): IReturnsFacade {
  return {
    checkEligibility: vi.fn().mockResolvedValue({ eligible: false }),
    initiateReturn: vi.fn(),
    submitReason: vi.fn(),
    submitMedia: vi.fn(),
    completeMediaCapture: vi.fn(),
    getReturnById: vi.fn(),
  } as unknown as IReturnsFacade;
}

/**
 * Creates a mock IEventBus that captures subscribers so we can fire events directly.
 */
function makeMockEventBus(): {
  eventBus: IEventBus;
  fireRefundIssued: (orderItemId: string, amount: number, currency?: string) => Promise<void>;
} {
  const subscribers = new Map<string, EventHandler>();

  const eventBus: IEventBus = {
    publish: vi.fn(),
    subscribe: vi.fn((eventType: string, handler: EventHandler) => {
      subscribers.set(eventType, handler);
    }),
    unsubscribe: vi.fn(),
  };

  async function fireRefundIssued(
    orderItemId: string,
    amount: number,
    currency = 'INR',
  ): Promise<void> {
    const handler = subscribers.get('RefundIssued');
    if (!handler) throw new Error('No subscriber registered for "RefundIssued"');
    const event: DomainEvent = {
      eventId: `evt-${Date.now()}`,
      eventType: 'RefundIssued',
      timestamp: new Date(),
      payload: {
        orderItemId,
        returnRequestId: 'rr-test',
        amount,
        currency,
        issuedAt: new Date().toISOString(),
      },
    };
    await handler(event);
  }

  return { eventBus, fireRefundIssued };
}

// ─── Property B: Customer Isolation ───────────────────────────────────────────
//
// FOR ALL customers C1 ≠ C2, the order IDs returned by getOrdersByCustomer(C1.id) and
// getOrdersByCustomer(C2.id) are completely disjoint.
//
// Validates: Requirements 7 (Customer isolation invariant)

describe('OrdersService — Property B: Customer Isolation', () => {
  /**
   * **Validates: Requirements 7**
   *
   * For any two distinct customers with arbitrary orders, the sets of order IDs
   * returned by getOrdersByCustomer are disjoint — no order from customer A ever
   * appears in customer B's results.
   */
  it('getOrdersByCustomer(C1) and getOrdersByCustomer(C2) produce disjoint order id sets', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Two distinct customer IDs
        fc.uniqueArray(idArb, { minLength: 2, maxLength: 2 }),
        // 1–4 order IDs for each customer (globally unique)
        fc.uniqueArray(idArb, { minLength: 2, maxLength: 8 }),
        async (customerIds, allOrderIds) => {
          const [custA, custB] = customerIds;

          // Split order IDs between the two customers
          const half = Math.floor(allOrderIds.length / 2);
          if (half === 0) return; // need at least one per customer

          const orderIdsA = allOrderIds.slice(0, half);
          const orderIdsB = allOrderIds.slice(half);
          if (orderIdsA.length === 0 || orderIdsB.length === 0) return;

          // Build orders for customer A
          const ordersA: Order[] = orderIdsA.map((orderId, idx) => {
            const item = buildOrderItem(`item-a-${idx}`, orderId, custA);
            return buildOrder(orderId, custA, [item]);
          });

          // Build orders for customer B
          const ordersB: Order[] = orderIdsB.map((orderId, idx) => {
            const item = buildOrderItem(`item-b-${idx}`, orderId, custB);
            return buildOrder(orderId, custB, [item]);
          });

          const repo = new InMemoryOrderRepository([...ordersA, ...ordersB]);
          const { eventBus } = makeMockEventBus();
          const service = new OrdersService(repo, makeMockReturnsFacade(), eventBus);

          const resultsA = await service.getOrdersByCustomer(custA);
          const resultsB = await service.getOrdersByCustomer(custB);

          const idsA = new Set(resultsA.map((o) => o.id));
          const idsB = new Set(resultsB.map((o) => o.id));

          // Disjointness: no overlap
          for (const id of idsA) {
            expect(idsB.has(id)).toBe(false);
          }
          for (const id of idsB) {
            expect(idsA.has(id)).toBe(false);
          }

          // Correctness: each order belongs to the expected customer
          for (const order of resultsA) {
            expect(order.customerId).toBe(custA);
          }
          for (const order of resultsB) {
            expect(order.customerId).toBe(custB);
          }

          // Completeness: all seeded orders appear in the correct result
          for (const orderId of orderIdsA) {
            expect(idsA.has(orderId)).toBe(true);
          }
          for (const orderId of orderIdsB) {
            expect(idsB.has(orderId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property C: Idempotent Refund Reflection ─────────────────────────────────
//
// FOR ALL RefundIssued events E with the same orderItemId and amount, processing E
// once and processing E N times shall produce the same refundStatus.
//
// Validates: Requirements 10 (Idempotent refund reflection)

describe('OrdersService — Property C: Idempotent Refund Reflection', () => {
  /**
   * **Validates: Requirements 10**
   *
   * Processing the same RefundIssued event N times (N >= 2) produces the exact same
   * refundStatus as processing it once — no double-recording or accumulation.
   */
  it('processing RefundIssued N times yields the same refundStatus as processing it once', async () => {
    await fc.assert(
      fc.asyncProperty(
        idArb,           // orderItemId
        idArb,           // orderId
        idArb,           // customerId
        amountArb,       // refund amount
        repeatCountArb,  // N (number of times to fire the event)
        async (itemId, orderId, customerId, amount, repeatCount) => {
          // Build a single order with one item
          const item = buildOrderItem(itemId, orderId, customerId);
          const order = buildOrder(orderId, customerId, [item]);

          // Process once
          const repoOnce = new InMemoryOrderRepository([
            JSON.parse(JSON.stringify(order)),
          ].map(o => ({ ...o, placedDate: new Date(o.placedDate), items: o.items.map((i: OrderItem) => ({ ...i, deliveryDate: new Date(i.deliveryDate), refundStatus: { ...i.refundStatus, issuedAt: i.refundStatus.issuedAt ? new Date(i.refundStatus.issuedAt) : null } })) })));
          const { eventBus: ebOnce, fireRefundIssued: fireOnce } = makeMockEventBus();
          new OrdersService(repoOnce, makeMockReturnsFacade(), ebOnce);

          await fireOnce(itemId, amount);

          const orderAfterOnce = await repoOnce.findById(orderId);
          const statusAfterOnce = orderAfterOnce!.items[0].refundStatus;

          // Process N times
          const repoN = new InMemoryOrderRepository([
            JSON.parse(JSON.stringify(order)),
          ].map(o => ({ ...o, placedDate: new Date(o.placedDate), items: o.items.map((i: OrderItem) => ({ ...i, deliveryDate: new Date(i.deliveryDate), refundStatus: { ...i.refundStatus, issuedAt: i.refundStatus.issuedAt ? new Date(i.refundStatus.issuedAt) : null } })) })));
          const { eventBus: ebN, fireRefundIssued: fireN } = makeMockEventBus();
          new OrdersService(repoN, makeMockReturnsFacade(), ebN);

          for (let i = 0; i < repeatCount; i++) {
            await fireN(itemId, amount);
          }

          const orderAfterN = await repoN.findById(orderId);
          const statusAfterN = orderAfterN!.items[0].refundStatus;

          // The status must be identical regardless of repetition count
          expect(statusAfterN.code).toBe(statusAfterOnce.code);
          expect(statusAfterN.amount).toBe(statusAfterOnce.amount);
          expect(statusAfterN.currency).toBe(statusAfterOnce.currency);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property: Graceful Unknown-Order Handling ────────────────────────────────
//
// FOR ALL RefundIssued events E whose orderItemId does not match any item in the repo,
// processing E does not throw and does not alter any existing item's refundStatus.
//
// Validates: Requirements 10 (Graceful unknown-order handling)

describe('OrdersService — Property: Graceful Unknown-Order Handling', () => {
  /**
   * **Validates: Requirements 10**
   *
   * Firing a RefundIssued event for a non-existent orderItemId must not throw
   * and must not change the refundStatus of any other item in the repository.
   */
  it('RefundIssued for non-existent orderItemId does not throw and preserves all other items', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Existing items: 1–4 items with unique IDs
        fc.uniqueArray(idArb, { minLength: 1, maxLength: 4 }),
        // A "ghost" orderItemId that is NOT in the existing set
        idArb,
        amountArb,
        async (existingItemIds, ghostItemId, amount) => {
          // Ensure ghost is not in the existing set
          if (existingItemIds.includes(ghostItemId)) return;

          const customerId = 'cust-test';
          const orderId = 'order-test';

          // Build items with 'none' refund status
          const items: OrderItem[] = existingItemIds.map((itemId) =>
            buildOrderItem(itemId, orderId, customerId),
          );
          const order = buildOrder(orderId, customerId, items);

          const repo = new InMemoryOrderRepository([order]);
          const { eventBus, fireRefundIssued } = makeMockEventBus();
          new OrdersService(repo, makeMockReturnsFacade(), eventBus);

          // Capture the refund status of all existing items BEFORE the event
          const beforeStatuses = new Map<string, RefundStatus>();
          const orderBefore = await repo.findById(orderId);
          for (const item of orderBefore!.items) {
            beforeStatuses.set(item.id, { ...item.refundStatus });
          }

          // Fire RefundIssued for the ghost item — must NOT throw
          await expect(fireRefundIssued(ghostItemId, amount)).resolves.toBeUndefined();

          // Verify all existing items' refund statuses are unchanged
          const orderAfter = await repo.findById(orderId);
          for (const item of orderAfter!.items) {
            const before = beforeStatuses.get(item.id)!;
            expect(item.refundStatus.code).toBe(before.code);
            expect(item.refundStatus.amount).toBe(before.amount);
            expect(item.refundStatus.currency).toBe(before.currency);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
