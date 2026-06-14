/**
 * Property-Based Test: Seed Idempotence (Property 3)
 *
 * Feature: integration-wiring, Property 3: Seed idempotence
 *
 * For any number of invocations N ≥ 1 of `loadUnifiedSeed()` on the same
 * repository instances, the repository state after N invocations SHALL be
 * identical to the state after exactly 1 invocation (same entity count, same
 * entity data, no duplicates).
 *
 * **Validates: Requirements 4.11**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { loadUnifiedSeed } from '../../composition/seed.js';
import type { SeedDeps } from '../../composition/seed.js';
import { InMemoryProductRepository } from '../../infrastructure/catalog/InMemoryProductRepository.js';
import { InMemoryVariantRepository } from '../../infrastructure/catalog/InMemoryVariantRepository.js';
import { InMemoryCategoryRepository } from '../../infrastructure/catalog/InMemoryCategoryRepository.js';
import { InMemoryCustomerRepository } from '../../infrastructure/persistence/InMemoryCustomerRepository.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh set of empty repositories for testing.
 */
function createFreshRepos(): SeedDeps {
  return {
    productRepository: new InMemoryProductRepository(),
    variantRepository: new InMemoryVariantRepository(),
    categoryRepository: new InMemoryCategoryRepository(),
    customerRepository: new InMemoryCustomerRepository(),
    orderRepository: new InMemoryOrderRepository(),
  };
}

/**
 * Captures repository state counts for comparison.
 */
async function snapshotRepoCounts(repos: SeedDeps) {
  const products = await repos.productRepository.findAll();
  const categories = await repos.categoryRepository.findAll();
  const variants = await (repos.variantRepository as InMemoryVariantRepository).findByProductId('prod-headphones-001');
  const allVariantCount = (repos.variantRepository as InMemoryVariantRepository).size;
  const customer = await repos.customerRepository.findById('demo-customer-1');
  const orders = await repos.orderRepository.findByCustomerId('demo-customer-1');

  return {
    productCount: products.length,
    categoryCount: categories.length,
    variantCount: allVariantCount,
    customerExists: customer !== null,
    orderCount: orders.length,
    headphoneVariantCount: variants.length,
  };
}

// ─── Property 3: Seed Idempotence ────────────────────────────────────────────

describe('Feature: integration-wiring, Property 3: Seed idempotence', () => {
  /**
   * **Validates: Requirements 4.11**
   *
   * For any N in [1, 10], calling loadUnifiedSeed N times on the same repos
   * produces identical state to calling it exactly once. No duplicates are
   * created on repeated invocations.
   */
  it('loadUnifiedSeed called N times produces same state as calling it once (no duplicates)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (n) => {
          // Create fresh repos for this iteration
          const repos = createFreshRepos();

          // Call loadUnifiedSeed once to establish baseline
          await loadUnifiedSeed(repos);
          const baselineSnapshot = await snapshotRepoCounts(repos);

          // Verify baseline has expected known constants
          expect(baselineSnapshot.productCount).toBe(6);
          expect(baselineSnapshot.variantCount).toBe(8);
          expect(baselineSnapshot.categoryCount).toBe(3);
          expect(baselineSnapshot.customerExists).toBe(true);
          expect(baselineSnapshot.orderCount).toBe(1);

          // Call loadUnifiedSeed N-1 more times (total = N invocations)
          for (let i = 1; i < n; i++) {
            await loadUnifiedSeed(repos);
          }

          // Snapshot after N invocations
          const afterNSnapshot = await snapshotRepoCounts(repos);

          // Verify: state after N invocations equals state after 1 invocation
          expect(afterNSnapshot.productCount).toBe(baselineSnapshot.productCount);
          expect(afterNSnapshot.variantCount).toBe(baselineSnapshot.variantCount);
          expect(afterNSnapshot.categoryCount).toBe(baselineSnapshot.categoryCount);
          expect(afterNSnapshot.customerExists).toBe(baselineSnapshot.customerExists);
          expect(afterNSnapshot.orderCount).toBe(baselineSnapshot.orderCount);
          expect(afterNSnapshot.headphoneVariantCount).toBe(baselineSnapshot.headphoneVariantCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.11**
   *
   * Verifies that individual entity data is preserved across multiple
   * invocations — not just counts, but actual entity contents remain identical.
   */
  it('entity data remains identical after N invocations (no mutation or corruption)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (n) => {
          const repos = createFreshRepos();

          // Seed once and capture reference data
          await loadUnifiedSeed(repos);
          const refCustomer = await repos.customerRepository.findById('demo-customer-1');
          const refOrder = await repos.orderRepository.findById('order-demo-001');
          const refProduct = await repos.productRepository.findById('prod-headphones-001');

          expect(refCustomer).not.toBeNull();
          expect(refOrder).not.toBeNull();
          expect(refProduct).not.toBeNull();

          // Run N-1 more times
          for (let i = 1; i < n; i++) {
            await loadUnifiedSeed(repos);
          }

          // Verify entity data is unchanged
          const afterCustomer = await repos.customerRepository.findById('demo-customer-1');
          const afterOrder = await repos.orderRepository.findById('order-demo-001');
          const afterProduct = await repos.productRepository.findById('prod-headphones-001');

          // Customer data unchanged
          expect(afterCustomer).not.toBeNull();
          expect(afterCustomer!.id).toBe(refCustomer!.id);
          expect(afterCustomer!.name).toBe(refCustomer!.name);
          expect(afterCustomer!.email).toBe(refCustomer!.email);
          expect(afterCustomer!.addresses).toHaveLength(refCustomer!.addresses.length);

          // Order data unchanged
          expect(afterOrder).not.toBeNull();
          expect(afterOrder!.id).toBe(refOrder!.id);
          expect(afterOrder!.customerId).toBe(refOrder!.customerId);
          expect(afterOrder!.items).toHaveLength(refOrder!.items.length);
          expect(afterOrder!.status).toBe(refOrder!.status);

          // Product data unchanged
          expect(afterProduct).not.toBeNull();
          expect(afterProduct!.id).toBe(refProduct!.id);
          expect(afterProduct!.title).toBe(refProduct!.title);
          expect(afterProduct!.basePrice).toBe(refProduct!.basePrice);
          expect(afterProduct!.catalogImageUrl).toBe(refProduct!.catalogImageUrl);
        },
      ),
      { numRuns: 100 },
    );
  });
});
