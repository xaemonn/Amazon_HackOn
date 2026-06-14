import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryReturnRequestRepository } from './InMemoryReturnRequestRepository.js';
import { ReturnRequest } from '../../domain/returns/ReturnRequest.js';
import type { ReturnRequestProps } from '../../domain/returns/ReturnRequest.js';

function makeRequest(overrides: Partial<ReturnRequestProps> = {}): ReturnRequest {
  const defaults: ReturnRequestProps = {
    id: 'req-1',
    customerId: 'cust-1',
    orderItemId: 'item-1',
    orderId: 'order-1',
    productId: 'prod-1',
    state: 'Initiated',
    reason: null,
    reasonDetails: null,
    media: [],
    conditionAssessment: null,
    dispositionDecision: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  };
  return new ReturnRequest({ ...defaults, ...overrides });
}

describe('InMemoryReturnRequestRepository', () => {
  let repo: InMemoryReturnRequestRepository;

  beforeEach(() => {
    repo = new InMemoryReturnRequestRepository();
  });

  describe('save and findById', () => {
    it('stores and retrieves a return request by id', async () => {
      const request = makeRequest({ id: 'req-abc' });
      await repo.save(request);

      const found = await repo.findById('req-abc');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('req-abc');
      expect(found!.customerId).toBe('cust-1');
    });

    it('returns null for a non-existent id', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });

    it('overwrites on save (upsert semantics)', async () => {
      const v1 = makeRequest({ id: 'req-1', state: 'Initiated' });
      await repo.save(v1);

      const v2 = makeRequest({ id: 'req-1', state: 'Grading' });
      await repo.save(v2);

      const found = await repo.findById('req-1');
      expect(found!.state).toBe('Grading');
      expect(repo.size).toBe(1);
    });
  });

  describe('findByCustomerId', () => {
    it('returns all requests for a customer sorted by createdAt descending', async () => {
      await repo.save(makeRequest({ id: 'r1', customerId: 'cust-A', createdAt: new Date('2024-01-01') }));
      await repo.save(makeRequest({ id: 'r2', customerId: 'cust-A', createdAt: new Date('2024-01-03') }));
      await repo.save(makeRequest({ id: 'r3', customerId: 'cust-A', createdAt: new Date('2024-01-02') }));
      await repo.save(makeRequest({ id: 'r4', customerId: 'cust-B', createdAt: new Date('2024-01-04') }));

      const results = await repo.findByCustomerId('cust-A');
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('r2'); // most recent first
      expect(results[1].id).toBe('r3');
      expect(results[2].id).toBe('r1');
    });

    it('returns empty array when no requests exist for the customer', async () => {
      const results = await repo.findByCustomerId('no-one');
      expect(results).toEqual([]);
    });
  });

  describe('findByOrderItemId', () => {
    it('returns the active (non-cancelled) return for the order item', async () => {
      await repo.save(makeRequest({ id: 'r1', orderItemId: 'item-X', state: 'Initiated' }));

      const found = await repo.findByOrderItemId('item-X');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('r1');
    });

    it('skips cancelled returns and returns null if only cancelled exist', async () => {
      await repo.save(makeRequest({ id: 'r1', orderItemId: 'item-X', state: 'Cancelled' }));

      const found = await repo.findByOrderItemId('item-X');
      expect(found).toBeNull();
    });

    it('returns null when no return exists for the order item', async () => {
      const found = await repo.findByOrderItemId('item-Z');
      expect(found).toBeNull();
    });
  });

  describe('countByCustomerInDays', () => {
    it('counts returns within the lookback window', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      await repo.save(makeRequest({ id: 'r1', customerId: 'cust-1', createdAt: twoDaysAgo }));
      await repo.save(makeRequest({ id: 'r2', customerId: 'cust-1', createdAt: tenDaysAgo }));
      await repo.save(makeRequest({ id: 'r3', customerId: 'cust-1', createdAt: now }));

      const count = await repo.countByCustomerInDays('cust-1', 7);
      expect(count).toBe(2); // twoDaysAgo and now, not tenDaysAgo
    });

    it('returns 0 when no returns exist for the customer', async () => {
      const count = await repo.countByCustomerInDays('no-one', 90);
      expect(count).toBe(0);
    });

    it('does not count other customers returns', async () => {
      const now = new Date();
      await repo.save(makeRequest({ id: 'r1', customerId: 'cust-A', createdAt: now }));
      await repo.save(makeRequest({ id: 'r2', customerId: 'cust-B', createdAt: now }));

      const count = await repo.countByCustomerInDays('cust-A', 30);
      expect(count).toBe(1);
    });
  });

  describe('size and clear', () => {
    it('reports the number of stored requests', async () => {
      expect(repo.size).toBe(0);
      await repo.save(makeRequest({ id: 'r1' }));
      await repo.save(makeRequest({ id: 'r2' }));
      expect(repo.size).toBe(2);
    });

    it('clear removes all stored requests', async () => {
      await repo.save(makeRequest({ id: 'r1' }));
      await repo.save(makeRequest({ id: 'r2' }));
      repo.clear();
      expect(repo.size).toBe(0);
      expect(await repo.findById('r1')).toBeNull();
    });
  });
});
