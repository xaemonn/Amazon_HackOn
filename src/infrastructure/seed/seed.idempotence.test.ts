/**
 * Seed idempotence tests — verifies that constructing InMemoryOrderRepository
 * and InMemoryCustomerRepository from seed data produces consistent, duplicate-free
 * results regardless of how many times construction occurs.
 *
 * Requirements: 13.1 (seed idempotence correctness property)
 */

import { describe, it, expect } from 'vitest';
import {
  demoCustomer,
  demoPrepaidOrder,
  demoCodOrder,
  DEMO_CUSTOMER_ID,
  DEMO_EMAIL,
} from './index.js';
import { InMemoryCustomerRepository } from '../persistence/InMemoryCustomerRepository.js';
import { InMemoryOrderRepository } from '../persistence/InMemoryOrderRepository.js';

describe('Seed idempotence', () => {
  // ─── Construction idempotence ─────────────────────────────────────────────

  describe('1. Construction idempotence — customer repository', () => {
    it('both instances built from the same seed contain exactly 1 customer', async () => {
      const repo1 = new InMemoryCustomerRepository([demoCustomer]);
      const repo2 = new InMemoryCustomerRepository([demoCustomer]);

      const customer1 = await repo1.findById(DEMO_CUSTOMER_ID);
      const customer2 = await repo2.findById(DEMO_CUSTOMER_ID);

      expect(customer1).not.toBeNull();
      expect(customer2).not.toBeNull();
      expect(customer1!.id).toBe(DEMO_CUSTOMER_ID);
      expect(customer2!.id).toBe(DEMO_CUSTOMER_ID);
    });

    it('both instances have the same customer id', async () => {
      const repo1 = new InMemoryCustomerRepository([demoCustomer]);
      const repo2 = new InMemoryCustomerRepository([demoCustomer]);

      const c1 = await repo1.findById(DEMO_CUSTOMER_ID);
      const c2 = await repo2.findById(DEMO_CUSTOMER_ID);

      expect(c1!.id).toBe(c2!.id);
    });
  });

  describe('2. Construction idempotence — order repository', () => {
    it('both instances built from the same seed contain exactly 2 orders', async () => {
      const repo1 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);
      const repo2 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);

      const orders1 = await repo1.findByCustomerId(DEMO_CUSTOMER_ID);
      const orders2 = await repo2.findByCustomerId(DEMO_CUSTOMER_ID);

      expect(orders1).toHaveLength(2);
      expect(orders2).toHaveLength(2);
    });

    it('both instances contain the same order ids', async () => {
      const repo1 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);
      const repo2 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);

      const orders1 = await repo1.findByCustomerId(DEMO_CUSTOMER_ID);
      const orders2 = await repo2.findByCustomerId(DEMO_CUSTOMER_ID);

      const ids1 = orders1.map((o) => o.id).sort();
      const ids2 = orders2.map((o) => o.id).sort();

      expect(ids1).toEqual(ids2);
      expect(ids1).toContain(demoPrepaidOrder.id);
      expect(ids1).toContain(demoCodOrder.id);
    });
  });

  // ─── No-duplicate invariant (Map.set upsert semantics) ───────────────────

  describe('3. No-duplicate invariant — Map.set upsert semantics', () => {
    it('customer repo built with the same customer twice still holds exactly 1 entry', async () => {
      const repo = new InMemoryCustomerRepository([demoCustomer, demoCustomer]);

      // findByContact does a linear scan — confirms only one entry exists
      const byContact = await repo.findByContact(DEMO_EMAIL);
      expect(byContact).not.toBeNull();
      expect(byContact!.id).toBe(DEMO_CUSTOMER_ID);

      // findById confirms the single entry
      const byId = await repo.findById(DEMO_CUSTOMER_ID);
      expect(byId).not.toBeNull();
    });

    it('order repo built with the same order twice still holds exactly 1 entry for that id', async () => {
      const repo = new InMemoryOrderRepository([demoPrepaidOrder, demoPrepaidOrder]);

      const order = await repo.findById(demoPrepaidOrder.id);
      expect(order).not.toBeNull();
      expect(order!.id).toBe(demoPrepaidOrder.id);

      // There should be exactly 1 prepaid order, not 2
      const orders = await repo.findByCustomerId(DEMO_CUSTOMER_ID);
      const prepaidOrders = orders.filter((o) => o.id === demoPrepaidOrder.id);
      expect(prepaidOrders).toHaveLength(1);
    });
  });

  // ─── Round-trip read consistency ─────────────────────────────────────────

  describe('4. Round-trip read consistency', () => {
    it('findById on both repo instances returns a customer with matching id and email', async () => {
      const repo1 = new InMemoryCustomerRepository([demoCustomer]);
      const repo2 = new InMemoryCustomerRepository([demoCustomer]);

      const c1 = await repo1.findById(DEMO_CUSTOMER_ID);
      const c2 = await repo2.findById(DEMO_CUSTOMER_ID);

      expect(c1!.id).toBe(DEMO_CUSTOMER_ID);
      expect(c2!.id).toBe(DEMO_CUSTOMER_ID);
      expect(c1!.email).toBe(DEMO_EMAIL);
      expect(c2!.email).toBe(DEMO_EMAIL);
      expect(c1!.id).toBe(c2!.id);
      expect(c1!.email).toBe(c2!.email);
    });

    it('findById returns null for a non-existent customer id in both instances', async () => {
      const repo1 = new InMemoryCustomerRepository([demoCustomer]);
      const repo2 = new InMemoryCustomerRepository([demoCustomer]);

      const missing1 = await repo1.findById('does-not-exist');
      const missing2 = await repo2.findById('does-not-exist');

      expect(missing1).toBeNull();
      expect(missing2).toBeNull();
    });
  });

  // ─── Order isolation ──────────────────────────────────────────────────────

  describe('5. Order isolation', () => {
    it('both repo instances return the same order ids', async () => {
      const repo1 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);
      const repo2 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);

      const orders1 = await repo1.findByCustomerId(DEMO_CUSTOMER_ID);
      const orders2 = await repo2.findByCustomerId(DEMO_CUSTOMER_ID);

      const ids1 = orders1.map((o) => o.id).sort();
      const ids2 = orders2.map((o) => o.id).sort();

      expect(ids1).toEqual(ids2);
    });

    it('findByCustomerId on both repo instances returns the same count', async () => {
      const repo1 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);
      const repo2 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);

      const orders1 = await repo1.findByCustomerId(DEMO_CUSTOMER_ID);
      const orders2 = await repo2.findByCustomerId(DEMO_CUSTOMER_ID);

      expect(orders1).toHaveLength(orders2.length);
      expect(orders1).toHaveLength(2);
    });

    it('orders from one repo instance do not bleed into the other (isolated Maps)', async () => {
      const repo1 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);
      const repo2 = new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]);

      // Save an extra order into repo1 only
      const extraOrder = {
        ...demoPrepaidOrder,
        id: 'order-extra-isolation-check',
      };
      await repo1.save(extraOrder);

      const orders1 = await repo1.findByCustomerId(DEMO_CUSTOMER_ID);
      const orders2 = await repo2.findByCustomerId(DEMO_CUSTOMER_ID);

      // repo1 now has 3, repo2 still has 2
      expect(orders1).toHaveLength(3);
      expect(orders2).toHaveLength(2);

      const repo2Ids = orders2.map((o) => o.id);
      expect(repo2Ids).not.toContain('order-extra-isolation-check');
    });
  });
});
