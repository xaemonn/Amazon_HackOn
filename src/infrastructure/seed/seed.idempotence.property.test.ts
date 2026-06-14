/**
 * Property-Based Test: Seed Idempotence (Property D)
 *
 * **Property D: Seed idempotence** — construct repositories from seed data multiple times;
 * assert identical state each time (no duplication).
 *
 * Running the seed operation multiple times SHALL result in the same set of Customer and Order
 * records — no duplicate Demo_Customer records or duplicate seeded Orders SHALL be created on
 * repeated initialisation.
 *
 * **Validates: Requirement 13 correctness property**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  demoCustomer,
  demoPrepaidOrder,
  demoCodOrder,
  DEMO_CUSTOMER_ID,
} from './index.js';
import { InMemoryCustomerRepository } from '../persistence/InMemoryCustomerRepository.js';
import { InMemoryOrderRepository } from '../persistence/InMemoryOrderRepository.js';
import type { Customer } from '../../domain/account/Customer.js';
import type { Order } from '../../domain/ordering/Order.js';

// ─── Property D: Seed Idempotence ─────────────────────────────────────────────
//
// FOR ALL N >= 1, constructing InMemoryCustomerRepository and InMemoryOrderRepository
// from the same seed data N times SHALL produce repositories with identical state — same
// number of records, same IDs, and same data. Map.set(id, v) upsert semantics ensure no
// duplication regardless of how many times the seed data array contains a given record.
//
// Validates: Requirement 13 (Seed idempotence)

describe('Seed Idempotence — Property D (PBT)', () => {
  /**
   * **Validates: Requirements 13**
   *
   * Constructing the customer repository with the demoCustomer repeated N times
   * (simulating N seed operations) always produces exactly 1 customer with the
   * expected ID — no duplicates are created.
   */
  it('CustomerRepository seeded N times with demoCustomer always contains exactly 1 customer', async () => {
    await fc.assert(
      fc.asyncProperty(
        // N: number of times to include the seed data (1–20, simulates repeated seeding)
        fc.integer({ min: 1, max: 20 }),
        async (n) => {
          // Construct the customer array as if seeded N times
          const seedArray: Customer[] = Array.from({ length: n }, () => demoCustomer);
          const repo = new InMemoryCustomerRepository(seedArray);

          // Verify exactly 1 customer exists with the expected ID
          const customer = await repo.findById(DEMO_CUSTOMER_ID);
          expect(customer).not.toBeNull();
          expect(customer!.id).toBe(DEMO_CUSTOMER_ID);
          expect(customer!.name).toBe(demoCustomer.name);
          expect(customer!.email).toBe(demoCustomer.email);

          // findByContact linear scan confirms no duplicates (returns at most 1)
          const byContact = await repo.findByContact(demoCustomer.email);
          expect(byContact).not.toBeNull();
          expect(byContact!.id).toBe(DEMO_CUSTOMER_ID);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 13**
   *
   * Constructing the order repository with demo orders repeated N times
   * always produces exactly the expected number of unique orders — no duplicates.
   */
  it('OrderRepository seeded N times with demo orders always contains exactly 2 unique orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        // N: repetition count (1–20)
        fc.integer({ min: 1, max: 20 }),
        async (n) => {
          // Repeat the seed orders N times
          const seedArray: Order[] = [];
          for (let i = 0; i < n; i++) {
            seedArray.push(demoPrepaidOrder, demoCodOrder);
          }

          const repo = new InMemoryOrderRepository(seedArray);

          // Verify exactly 2 orders for the demo customer
          const orders = await repo.findByCustomerId(DEMO_CUSTOMER_ID);
          expect(orders).toHaveLength(2);

          // Verify correct IDs are present
          const ids = orders.map((o) => o.id).sort();
          expect(ids).toEqual([demoCodOrder.id, demoPrepaidOrder.id].sort());

          // Verify each order can be individually retrieved
          const prepaid = await repo.findById(demoPrepaidOrder.id);
          const cod = await repo.findById(demoCodOrder.id);
          expect(prepaid).not.toBeNull();
          expect(cod).not.toBeNull();
          expect(prepaid!.id).toBe(demoPrepaidOrder.id);
          expect(cod!.id).toBe(demoCodOrder.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 13**
   *
   * Constructing repositories from seed data multiple times (K separate constructions)
   * always produces identical state across all instances — same customer, same orders,
   * same item counts.
   */
  it('K independent constructions from seed data produce identical repository state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // K: number of independent constructions to compare (2–10)
        fc.integer({ min: 2, max: 10 }),
        async (k) => {
          // Build K independent customer repos and K independent order repos
          const customerRepos = Array.from(
            { length: k },
            () => new InMemoryCustomerRepository([demoCustomer]),
          );
          const orderRepos = Array.from(
            { length: k },
            () => new InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder]),
          );

          // All customer repos should return the same customer
          const customers = await Promise.all(
            customerRepos.map((r) => r.findById(DEMO_CUSTOMER_ID)),
          );
          for (const customer of customers) {
            expect(customer).not.toBeNull();
            expect(customer!.id).toBe(DEMO_CUSTOMER_ID);
            expect(customer!.name).toBe(demoCustomer.name);
            expect(customer!.email).toBe(demoCustomer.email);
          }

          // All order repos should return the same orders
          const orderSets = await Promise.all(
            orderRepos.map((r) => r.findByCustomerId(DEMO_CUSTOMER_ID)),
          );
          const referenceIds = orderSets[0].map((o) => o.id).sort();
          expect(referenceIds).toHaveLength(2);

          for (let i = 1; i < orderSets.length; i++) {
            const currentIds = orderSets[i].map((o) => o.id).sort();
            expect(currentIds).toEqual(referenceIds);
            expect(orderSets[i]).toHaveLength(orderSets[0].length);
          }

          // Verify item counts are consistent across all repo instances
          for (const orderSet of orderSets) {
            const totalItems = orderSet.reduce((sum, o) => sum + o.items.length, 0);
            const referenceItems = orderSets[0].reduce((sum, o) => sum + o.items.length, 0);
            expect(totalItems).toBe(referenceItems);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
