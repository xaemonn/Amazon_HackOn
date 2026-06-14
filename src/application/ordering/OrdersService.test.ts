/**
 * OrdersService unit tests.
 *
 * Covers:
 * - getOrdersByCustomer: returns only orders with matching customerId; sorted most-recent-first;
 *   empty array when none
 * - getOrderDetail: returns order for owner; returns null for wrong customer; returns null for
 *   unknown orderId
 * - updateRefundStatus: updates item correctly; no-op + no throw for unknown orderItemId; when
 *   called twice with different amounts, the second call's amount wins (overwrite, not accumulate)
 * - checkReturnEligibility: eligible item returns eligible:true; out-of-window item returns
 *   eligible:false; IReturnsFacade error returns eligible:false (no rethrow)
 * - RefundIssued event: fires subscriber; verifies refundStatus updated to refund_issued with
 *   correct amount; second identical event produces same state (idempotent); second event with
 *   different amount is discarded — first refund wins (Req 8.4 idempotent)
 *
 * Requirements: 7, 8, 9.5, 10
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrdersService } from './OrdersService.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { RefundStatus } from '../../domain/ordering/RefundStatus.js';
import type { IReturnsFacade, EligibilityResult } from '../../application/returns/index.js';
import type { IEventBus, EventHandler, DomainEvent } from '../../domain/shared/events.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

const NONE_REFUND: RefundStatus = {
  code: 'none',
  amount: null,
  currency: null,
  issuedAt: null,
};

function makeOrderItem(overrides?: Partial<OrderItem>): OrderItem {
  return {
    id: 'item-001',
    orderId: 'order-001',
    customerId: 'customer-001',
    productId: 'prod-001',
    variantId: 'var-001',
    productName: 'Test Product',
    productImage: 'https://example.com/img.jpg',
    unitPrice: 999,
    quantity: 1,
    deliveryDate: new Date('2024-06-01'),
    deliveryStatus: 'delivered',
    refundStatus: NONE_REFUND,
    ...overrides,
  };
}

function makeOrder(overrides?: Partial<Order>): Order {
  return {
    id: 'order-001',
    customerId: 'customer-001',
    placedDate: new Date('2024-05-01'),
    status: 'delivered',
    paymentType: 'prepaid',
    items: [makeOrderItem()],
    ...overrides,
  };
}

/**
 * Creates a mock IReturnsFacade.
 * By default checkEligibility resolves to eligible:true.
 */
function makeMockReturnsFacade(
  overrides?: Partial<IReturnsFacade>,
): IReturnsFacade {
  return {
    checkEligibility: vi.fn().mockResolvedValue({
      eligible: true,
      daysRemaining: 20,
      policyExpirationDate: new Date('2024-07-01'),
      productName: 'Test Product',
      productImage: 'https://example.com/img.jpg',
      orderDate: new Date('2024-06-01'),
      errorMessage: null,
    } satisfies EligibilityResult),
    initiateReturn: vi.fn(),
    submitReason: vi.fn(),
    submitMedia: vi.fn(),
    completeMediaCapture: vi.fn(),
    getReturnById: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock IEventBus that captures the subscriber callbacks so tests
 * can invoke them directly.
 */
function makeMockEventBus(): {
  eventBus: IEventBus;
  /** Invoke the subscriber registered for the given eventType. */
  fireEvent: (eventType: string, payload: Record<string, unknown>) => Promise<void>;
} {
  const subscribers = new Map<string, EventHandler>();

  const eventBus: IEventBus = {
    publish: vi.fn(),
    subscribe: vi.fn((eventType: string, handler: EventHandler) => {
      subscribers.set(eventType, handler);
    }),
    unsubscribe: vi.fn(),
  };

  async function fireEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const handler = subscribers.get(eventType);
    if (!handler) throw new Error(`No subscriber registered for "${eventType}"`);
    const event: DomainEvent = {
      eventId: 'evt-test',
      eventType,
      timestamp: new Date(),
      payload,
    };
    await handler(event);
  }

  return { eventBus, fireEvent };
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let repo: InMemoryOrderRepository;
  let returnsFacade: IReturnsFacade;
  let eventBus: IEventBus;
  let fireEvent: (eventType: string, payload: Record<string, unknown>) => Promise<void>;
  let service: OrdersService;

  beforeEach(() => {
    repo = new InMemoryOrderRepository();
    returnsFacade = makeMockReturnsFacade();
    ({ eventBus, fireEvent } = makeMockEventBus());
    service = new OrdersService(repo, returnsFacade, eventBus);
  });

  // ── getOrdersByCustomer ────────────────────────────────────────────────────

  describe('getOrdersByCustomer', () => {
    it('returns only orders belonging to the requested customer', async () => {
      const orderA = makeOrder({ id: 'order-a', customerId: 'customer-001' });
      const orderB = makeOrder({ id: 'order-b', customerId: 'customer-002' });
      await repo.save(orderA);
      await repo.save(orderB);

      const result = await service.getOrdersByCustomer('customer-001');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('order-a');
    });

    it('returns an empty array when the customer has no orders', async () => {
      const result = await service.getOrdersByCustomer('customer-nobody');
      expect(result).toEqual([]);
    });

    it('sorts orders most-recent-first by placedDate', async () => {
      const older = makeOrder({
        id: 'order-older',
        customerId: 'customer-001',
        placedDate: new Date('2024-01-01'),
      });
      const newest = makeOrder({
        id: 'order-newest',
        customerId: 'customer-001',
        placedDate: new Date('2024-06-01'),
      });
      const middle = makeOrder({
        id: 'order-middle',
        customerId: 'customer-001',
        placedDate: new Date('2024-03-01'),
      });

      await repo.save(older);
      await repo.save(newest);
      await repo.save(middle);

      const result = await service.getOrdersByCustomer('customer-001');

      expect(result.map((o) => o.id)).toEqual(['order-newest', 'order-middle', 'order-older']);
    });

    it('does not include orders from other customers even when multiple customers exist', async () => {
      for (let i = 0; i < 3; i++) {
        await repo.save(
          makeOrder({
            id: `order-c1-${i}`,
            customerId: 'customer-001',
            placedDate: new Date(2024, i, 1),
          }),
        );
        await repo.save(
          makeOrder({
            id: `order-c2-${i}`,
            customerId: 'customer-002',
            placedDate: new Date(2024, i, 1),
          }),
        );
      }

      const c1Orders = await service.getOrdersByCustomer('customer-001');
      const c2Orders = await service.getOrdersByCustomer('customer-002');

      // Customer isolation: no overlap
      const c1Ids = new Set(c1Orders.map((o) => o.id));
      const c2Ids = new Set(c2Orders.map((o) => o.id));
      for (const id of c2Ids) {
        expect(c1Ids.has(id)).toBe(false);
      }
    });
  });

  // ── getOrderDetail ─────────────────────────────────────────────────────────

  describe('getOrderDetail', () => {
    it('returns the order when the customerId matches', async () => {
      const order = makeOrder({ id: 'order-001', customerId: 'customer-001' });
      await repo.save(order);

      const result = await service.getOrderDetail('customer-001', 'order-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('order-001');
    });

    it('returns null when the customerId does not match the order owner', async () => {
      const order = makeOrder({ id: 'order-001', customerId: 'customer-001' });
      await repo.save(order);

      const result = await service.getOrderDetail('customer-002', 'order-001');

      expect(result).toBeNull();
    });

    it('returns null for an unknown orderId', async () => {
      const result = await service.getOrderDetail('customer-001', 'order-ghost');

      expect(result).toBeNull();
    });

    it('does not leak order data when customer mismatch occurs', async () => {
      // Ensure no throw — only null is returned (no exception-based data leak)
      const order = makeOrder({ id: 'order-secret', customerId: 'customer-001' });
      await repo.save(order);

      await expect(
        service.getOrderDetail('attacker-id', 'order-secret'),
      ).resolves.toBeNull();
    });
  });

  // ── updateRefundStatus ─────────────────────────────────────────────────────

  describe('updateRefundStatus', () => {
    it('updates the refund status on the target order item', async () => {
      const item = makeOrderItem({ id: 'item-001', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      const newStatus: RefundStatus = {
        code: 'refund_issued',
        amount: 499,
        currency: 'INR',
        issuedAt: new Date('2024-07-01'),
      };

      await service.updateRefundStatus('item-001', newStatus);

      const updated = await repo.findById('order-001');
      expect(updated!.items[0].refundStatus.code).toBe('refund_issued');
      expect(updated!.items[0].refundStatus.amount).toBe(499);
    });

    it('does not throw when the orderItemId is unknown (no-op)', async () => {
      await expect(
        service.updateRefundStatus('nonexistent-item', {
          code: 'refund_issued',
          amount: 100,
          currency: 'INR',
          issuedAt: new Date(),
        }),
      ).resolves.toBeUndefined();
    });

    it('does not alter any existing items when called with an unknown orderItemId', async () => {
      const item = makeOrderItem({ id: 'item-real', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      await service.updateRefundStatus('item-ghost', {
        code: 'refund_issued',
        amount: 999,
        currency: 'INR',
        issuedAt: new Date(),
      });

      const order = await repo.findById('order-001');
      expect(order!.items[0].refundStatus.code).toBe('none');
    });

    it('second call with a different amount overwrites — last-write-wins', async () => {
      const item = makeOrderItem({ id: 'item-001', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      await service.updateRefundStatus('item-001', {
        code: 'refund_issued',
        amount: 200,
        currency: 'INR',
        issuedAt: new Date('2024-07-01'),
      });

      await service.updateRefundStatus('item-001', {
        code: 'refund_issued',
        amount: 350,
        currency: 'INR',
        issuedAt: new Date('2024-07-02'),
      });

      const order = await repo.findById('order-001');
      // Amount must be 350 (second call wins), not 200 or 550 (no accumulation)
      expect(order!.items[0].refundStatus.amount).toBe(350);
    });
  });

  // ── checkReturnEligibility ─────────────────────────────────────────────────

  describe('checkReturnEligibility', () => {
    it('returns eligible:true when the facade reports the item is eligible', async () => {
      vi.mocked(returnsFacade.checkEligibility).mockResolvedValue({
        eligible: true,
        daysRemaining: 15,
        policyExpirationDate: new Date('2024-07-15'),
        productName: 'Test Product',
        productImage: 'https://example.com/img.jpg',
        orderDate: new Date('2024-06-01'),
        errorMessage: null,
      });

      const result = await service.checkReturnEligibility('customer-001', 'item-001');

      expect(result.eligible).toBe(true);
    });

    it('returns eligible:false when the item is outside the return window', async () => {
      vi.mocked(returnsFacade.checkEligibility).mockResolvedValue({
        eligible: false,
        daysRemaining: 0,
        policyExpirationDate: new Date('2024-04-01'),
        productName: 'Old Product',
        productImage: 'https://example.com/img.jpg',
        orderDate: new Date('2024-01-01'),
        errorMessage: 'Return window has expired.',
      });

      const result = await service.checkReturnEligibility('customer-001', 'item-old');

      expect(result.eligible).toBe(false);
    });

    it('returns eligible:false and does not rethrow when IReturnsFacade throws (Req 9.5)', async () => {
      vi.mocked(returnsFacade.checkEligibility).mockRejectedValue(
        new Error('Eligibility service unavailable'),
      );

      const result = await service.checkReturnEligibility('customer-001', 'item-001');

      expect(result.eligible).toBe(false);
      expect(result.errorMessage).toBe('Eligibility check temporarily unavailable');
    });

    it('error fallback contains safe null/empty values for all fields', async () => {
      vi.mocked(returnsFacade.checkEligibility).mockRejectedValue(new Error('boom'));

      const result = await service.checkReturnEligibility('customer-001', 'item-001');

      expect(result.daysRemaining).toBeNull();
      expect(result.policyExpirationDate).toBeNull();
      expect(result.productName).toBe('');
      expect(result.productImage).toBe('');
    });
  });

  // ── RefundIssued event subscriber ──────────────────────────────────────────

  describe('RefundIssued event', () => {
    it('subscribes to RefundIssued during construction', () => {
      expect(eventBus.subscribe).toHaveBeenCalledWith(
        'RefundIssued',
        expect.any(Function),
      );
    });

    it('updates refundStatus to refund_issued with the correct amount when event fires', async () => {
      const item = makeOrderItem({ id: 'item-001', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      await fireEvent('RefundIssued', {
        orderItemId: 'item-001',
        returnRequestId: 'rr-001',
        amount: 799,
        currency: 'INR',
        issuedAt: '2024-07-10T10:00:00.000Z',
      });

      const order = await repo.findById('order-001');
      const updatedItem = order!.items[0];
      expect(updatedItem.refundStatus.code).toBe('refund_issued');
      expect(updatedItem.refundStatus.amount).toBe(799);
      expect(updatedItem.refundStatus.currency).toBe('INR');
    });

    it('issuedAt is stored as a Date parsed from the ISO string in the event payload', async () => {
      const item = makeOrderItem({ id: 'item-001', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      const isoString = '2024-07-10T12:30:00.000Z';
      await fireEvent('RefundIssued', {
        orderItemId: 'item-001',
        returnRequestId: 'rr-001',
        amount: 100,
        currency: 'INR',
        issuedAt: isoString,
      });

      const order = await repo.findById('order-001');
      const { issuedAt } = order!.items[0].refundStatus;
      expect(issuedAt).toBeInstanceOf(Date);
      expect(issuedAt!.toISOString()).toBe(isoString);
    });

    it('second identical RefundIssued event produces the same state (idempotent — Req 8.4)', async () => {
      const item = makeOrderItem({ id: 'item-001', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      const payload = {
        orderItemId: 'item-001',
        returnRequestId: 'rr-001',
        amount: 500,
        currency: 'INR',
        issuedAt: '2024-07-10T10:00:00.000Z',
      };

      await fireEvent('RefundIssued', payload);
      await fireEvent('RefundIssued', payload);

      const order = await repo.findById('order-001');
      // Idempotent: amount should still be 500, not 1000
      expect(order!.items[0].refundStatus.amount).toBe(500);
      expect(order!.items[0].refundStatus.code).toBe('refund_issued');
    });

    it('second event with a different amount is discarded — first refund wins (Req 8.4 idempotent)', async () => {
      const item = makeOrderItem({ id: 'item-001', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      await fireEvent('RefundIssued', {
        orderItemId: 'item-001',
        returnRequestId: 'rr-001',
        amount: 300,
        currency: 'INR',
        issuedAt: '2024-07-10T10:00:00.000Z',
      });

      await fireEvent('RefundIssued', {
        orderItemId: 'item-001',
        returnRequestId: 'rr-002',
        amount: 450,
        currency: 'INR',
        issuedAt: '2024-07-10T11:00:00.000Z',
      });

      const order = await repo.findById('order-001');
      // First refund wins; subsequent events are discarded (Req 8.4)
      expect(order!.items[0].refundStatus.amount).toBe(300);
      expect(order!.items[0].refundStatus.currency).toBe('INR');
    });

    it('RefundIssued for a non-existent orderItemId does not throw', async () => {
      await expect(
        fireEvent('RefundIssued', {
          orderItemId: 'item-ghost',
          returnRequestId: 'rr-999',
          amount: 100,
          currency: 'INR',
          issuedAt: '2024-07-10T10:00:00.000Z',
        }),
      ).resolves.toBeUndefined();
    });

    it('RefundIssued for a non-existent orderItemId does not alter other items', async () => {
      const item = makeOrderItem({ id: 'item-real', refundStatus: NONE_REFUND });
      await repo.save(makeOrder({ id: 'order-001', items: [item] }));

      await fireEvent('RefundIssued', {
        orderItemId: 'item-ghost',
        returnRequestId: 'rr-999',
        amount: 999,
        currency: 'INR',
        issuedAt: '2024-07-10T10:00:00.000Z',
      });

      const order = await repo.findById('order-001');
      expect(order!.items[0].refundStatus.code).toBe('none');
    });
  });
});
