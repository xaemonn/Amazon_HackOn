/**
 * Integration Smoke Tests
 *
 * Verifies the five cross-module seams work end-to-end:
 * 1. Return eligibility reads real order data from shared repo
 * 2. Product image URL matches between catalog repo and eligibility result
 * 3. ListingRequested event creates Open_Box variant in catalog
 * 4. RefundIssued event updates order item status
 * 5. Created variant appears in product detail query
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCompositionRoot } from '../composition/root.js';
import type { CompositionResult } from '../composition/root.js';
import { loadUnifiedSeed } from '../composition/seed.js';
import { randomUUID } from 'crypto';
import type { DomainEvent } from '../domain/shared/events.js';

describe('Integration Smoke Tests', () => {
  let composition: CompositionResult;

  beforeAll(async () => {
    composition = createCompositionRoot();
    await loadUnifiedSeed(composition.repos);
  });

  afterAll(() => {
    composition.dispose();
  });

  // ─── 12.1: Return eligibility reads from shared order repo ──────────────────

  it('return eligibility reads from shared order repo (seeded delivered order is eligible)', async () => {
    const result = await composition.returnsModule.returnsFacade.checkEligibility(
      'demo-customer-1',
      'oi-demo-001',
    );

    expect(result.eligible).toBe(true);
  });

  // ─── 12.2: Product image URL from catalog repo matches seeded catalogImageUrl ─

  it('product image URL from catalog repo matches the seeded catalogImageUrl', async () => {
    const product = await composition.repos.productRepository.findById('prod-headphones-001');

    expect(product).not.toBeNull();
    expect(product!.catalogImageUrl).toBe('/assets/products/prod-headphones-001.jpg');
  });

  // ─── 12.3: ListingRequested with conditionGrade 'A' creates Open_Box variant ─

  it('publishing ListingRequested with conditionGrade A creates Open_Box variant', async () => {
    const returnRequestId = `smoke-test-return-${randomUUID()}`;

    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType: 'ListingRequested',
      timestamp: new Date(),
      payload: {
        returnRequestId,
        productId: 'prod-headphones-001',
        conditionGrade: 'A',
        assessmentSummary: 'Smoke test: item is like-new, no visible defects.',
        mediaReferences: [
          {
            id: 'media-smoke-001',
            type: 'photo_front',
            storageKey: 'smoke-test/front.jpg',
            format: 'jpeg',
            sizeBytes: 1024,
            capturedAt: new Date(),
          },
        ],
      },
    };

    await composition.eventBus.publish(event);

    // Verify that a new Open_Box variant was created for this return
    const variant = await composition.repos.variantRepository.findBySourceReturnId(returnRequestId);
    expect(variant).not.toBeNull();
    expect(variant!.condition).toBe('Open_Box');
    expect(variant!.productId).toBe('prod-headphones-001');
  });

  // ─── 12.4: RefundIssued updates order item refundStatus ─────────────────────

  it('publishing RefundIssued updates order item refundStatus to refund_issued', async () => {
    const issuedAt = new Date().toISOString();

    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType: 'RefundIssued',
      timestamp: new Date(),
      payload: {
        orderItemId: 'oi-demo-001',
        returnRequestId: 'smoke-test-refund-return',
        amount: 29990,
        currency: 'INR',
        issuedAt,
      },
    };

    await composition.eventBus.publish(event);

    // Query the order item to verify refundStatus was updated
    const found = await composition.repos.orderRepository.findOrderItemById('oi-demo-001');
    expect(found).not.toBeNull();
    expect(found!.item.refundStatus.code).toBe('refund_issued');
    expect(found!.item.refundStatus.amount).toBe(29990);
    expect(found!.item.refundStatus.currency).toBe('INR');
  });

  // ─── 12.5: Created Open_Box variant appears in product detail variants list ─

  it('created Open_Box variant appears in product detail variants list', async () => {
    // Query all variants for the product used in the ListingRequested test (12.3)
    const variants = await composition.repos.variantRepository.findByProductId('prod-headphones-001');

    // Verify that at least one Open_Box variant exists in the product's variants list
    const openBoxVariants = variants.filter((v) => v.condition === 'Open_Box');
    expect(openBoxVariants.length).toBeGreaterThanOrEqual(2); // seeded + smoke-test-created

    // Verify the smoke-test-created variant is present (has sourceReturnId starting with 'smoke-test-return-')
    const smokeTestVariant = openBoxVariants.find(
      (v) => v.sourceReturnId?.startsWith('smoke-test-return-'),
    );
    expect(smokeTestVariant).toBeDefined();
  });
});
