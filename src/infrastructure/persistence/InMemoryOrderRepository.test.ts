import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryOrderRepository } from './InMemoryOrderRepository.js';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { RefundStatus } from '../../domain/ordering/RefundStatus.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const noRefund: RefundStatus = {
  code: 'none',
  amount: null,
  currency: null,
  issuedAt: null,
};

const issuedRefund: RefundStatus = {
  code: 'refund_issued',
  amount: 499,
  currency: 'INR',
  issuedAt: new Date('2024-06-01T10:00:00Z'),
};

const issuedRefund2: RefundStatus = {
  code: 'refund_issued',
  amount: 999,
  currency: 'INR',
  issuedAt: new Date('2024-06-02T12:00:00Z'),
};

function makeItem(id: string, orderId: string, customerId: string): OrderItem {
  return {
    id,
    orderId,
    customerId,
    productId: 'prod-1',
    variantId: 'var-1',
    productName: 'Test Product',
    productImage: 'https://example.com/img.jpg',
    unitPrice: 499,
    quantity: 1,
    deliveryDate: new Date('2024-05-20'),
    deliveryStatus: 'delivered',
    refundStatus: { ...noRefund },
  };
}

function makeOrder(id: string, customerId: string, items: OrderItem[]): Order {
  return {
    id,
    customerId,
    placedDate: new Date('2024-05-10'),
    status: 'delivered',
    paymentType: 'prepaid',
    items,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('InMemoryOrderRepository', () => {
  let repo: InMemoryOrderRepository;

  beforeEach(() => {
    repo = new InMemoryOrderRepository();
  });

  // ── round-trip save / findById ────────────────────────────────────────────

  describe('save / findById', () => {
    it('returns null for an unknown order id', async () => {
      expect(await repo.findById('does-not-exist')).toBeNull();
    });

    it('round-trips a saved order', async () => {
      const order = makeOrder('o1', 'c1', [makeItem('i1', 'o1', 'c1')]);
      await repo.save(order);
      expect(await repo.findById('o1')).toEqual(order);
    });

    it('upserts — overwriting an existing order by id', async () => {
      const original = makeOrder('o1', 'c1', []);
      await repo.save(original);

      const updated = { ...original, status: 'cancelled' } as Order;
      await repo.save(updated);

      expect((await repo.findById('o1'))!.status).toBe('cancelled');
    });
  });

  // ── findByCustomerId ──────────────────────────────────────────────────────

  describe('findByCustomerId', () => {
    it('returns empty array when customer has no orders', async () => {
      expect(await repo.findByCustomerId('ghost')).toEqual([]);
    });

    it('returns only the orders belonging to the given customer', async () => {
      const orderA1 = makeOrder('oA1', 'custA', []);
      const orderA2 = makeOrder('oA2', 'custA', []);
      const orderB = makeOrder('oB1', 'custB', []);

      await repo.save(orderA1);
      await repo.save(orderA2);
      await repo.save(orderB);

      const results = await repo.findByCustomerId('custA');
      expect(results).toHaveLength(2);
      expect(results.map((o) => o.id).sort()).toEqual(['oA1', 'oA2']);
    });

    it('customer isolation — custB orders never appear for custA', async () => {
      await repo.save(makeOrder('oB', 'custB', []));
      expect(await repo.findByCustomerId('custA')).toEqual([]);
    });
  });

  // ── findOrderItemById ─────────────────────────────────────────────────────

  describe('findOrderItemById', () => {
    it('returns null for an unknown item id', async () => {
      expect(await repo.findOrderItemById('ghost-item')).toBeNull();
    });

    it('returns the correct { order, item } pair for a known item', async () => {
      const item = makeItem('i1', 'o1', 'c1');
      const order = makeOrder('o1', 'c1', [item]);
      await repo.save(order);

      const result = await repo.findOrderItemById('i1');
      expect(result).not.toBeNull();
      expect(result!.order.id).toBe('o1');
      expect(result!.item.id).toBe('i1');
    });

    it('scans across multiple orders to find the right item', async () => {
      const item1 = makeItem('i1', 'o1', 'c1');
      const item2 = makeItem('i2', 'o2', 'c2');
      await repo.save(makeOrder('o1', 'c1', [item1]));
      await repo.save(makeOrder('o2', 'c2', [item2]));

      const result = await repo.findOrderItemById('i2');
      expect(result!.order.id).toBe('o2');
      expect(result!.item.id).toBe('i2');
    });
  });

  // ── updateOrderItemRefundStatus ───────────────────────────────────────────

  describe('updateOrderItemRefundStatus', () => {
    it('updates the refund status of the matching item', async () => {
      const item = makeItem('i1', 'o1', 'c1');
      await repo.save(makeOrder('o1', 'c1', [item]));

      await repo.updateOrderItemRefundStatus('i1', issuedRefund);

      const found = await repo.findOrderItemById('i1');
      expect(found!.item.refundStatus).toEqual(issuedRefund);
    });

    it('is idempotent — applying the same refund twice yields the same result', async () => {
      const item = makeItem('i1', 'o1', 'c1');
      await repo.save(makeOrder('o1', 'c1', [item]));

      await repo.updateOrderItemRefundStatus('i1', issuedRefund);
      await repo.updateOrderItemRefundStatus('i1', issuedRefund);

      const found = await repo.findOrderItemById('i1');
      expect(found!.item.refundStatus).toEqual(issuedRefund);
    });

    it('overwrites — last-write-wins with a different amount', async () => {
      const item = makeItem('i1', 'o1', 'c1');
      await repo.save(makeOrder('o1', 'c1', [item]));

      await repo.updateOrderItemRefundStatus('i1', issuedRefund);
      await repo.updateOrderItemRefundStatus('i1', issuedRefund2);

      const found = await repo.findOrderItemById('i1');
      expect(found!.item.refundStatus).toEqual(issuedRefund2);
    });

    it('no-op on unknown orderItemId — does not throw', async () => {
      const item = makeItem('i1', 'o1', 'c1');
      await repo.save(makeOrder('o1', 'c1', [item]));

      await expect(
        repo.updateOrderItemRefundStatus('ghost-item', issuedRefund),
      ).resolves.toBeUndefined();
    });

    it('no-op on unknown id — logs a console.warn', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await repo.updateOrderItemRefundStatus('ghost-item', issuedRefund);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain('ghost-item');
      warn.mockRestore();
    });

    it('no-op on unknown id — leaves all other items unchanged', async () => {
      const item = makeItem('i1', 'o1', 'c1');
      await repo.save(makeOrder('o1', 'c1', [item]));

      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await repo.updateOrderItemRefundStatus('ghost-item', issuedRefund);

      const found = await repo.findOrderItemById('i1');
      expect(found!.item.refundStatus).toEqual(noRefund);
      vi.restoreAllMocks();
    });
  });

  // ── constructor seed ──────────────────────────────────────────────────────

  describe('constructor initialOrders', () => {
    it('seeds orders provided to the constructor', async () => {
      const order = makeOrder('o-seed', 'c1', [makeItem('i-seed', 'o-seed', 'c1')]);
      const seeded = new InMemoryOrderRepository([order]);

      expect(await seeded.findById('o-seed')).toEqual(order);
    });
  });
});
