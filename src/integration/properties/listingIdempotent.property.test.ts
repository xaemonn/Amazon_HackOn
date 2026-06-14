/**
 * Property 5: ListingRequested idempotent handling
 *
 * For any valid ListingRequested event published N times (N >= 1) with the same
 * returnRequestId, the system SHALL create exactly one Open_Box variant. All subsequent
 * publications with the same returnRequestId SHALL be discarded without creating duplicates.
 *
 * Feature: integration-wiring, Property 5: ListingRequested idempotent handling
 * Validates: Requirements 7.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InProcessEventBus } from '../../infrastructure/events/InProcessEventBus';
import { InMemoryProductRepository } from '../../infrastructure/catalog/InMemoryProductRepository';
import { InMemoryVariantRepository } from '../../infrastructure/catalog/InMemoryVariantRepository';
import { InMemoryCategoryRepository } from '../../infrastructure/catalog/InMemoryCategoryRepository';
import { CatalogService } from '../../application/catalog/CatalogService';
import { ListingRequestedHandler, type ILogger, type CatalogLogEntry } from '../../application/catalog/ListingRequestedHandler';
import { Product } from '../../domain/catalog/Product';
import { DEFAULT_CATALOG_CONFIG } from '../../application/catalog/CatalogConfig';
import type { DomainEvent } from '../../domain/shared/events';
import type { MediaReference } from '../../domain/shared/types';
import { randomUUID } from 'crypto';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Silent logger that captures entries without writing to stdout */
class SilentLogger implements ILogger {
  public readonly entries: CatalogLogEntry[] = [];
  info(entry: CatalogLogEntry): void { this.entries.push(entry); }
  warn(entry: CatalogLogEntry): void { this.entries.push(entry); }
  error(entry: CatalogLogEntry): void { this.entries.push(entry); }
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a valid MediaReference */
const mediaReferenceArb: fc.Arbitrary<MediaReference> = fc.record({
  id: fc.uuid(),
  type: fc.oneof(
    fc.constant('photo_front' as const),
    fc.constant('photo_back' as const),
    fc.constant('photo_closeup' as const),
    fc.constant('video' as const),
  ),
  storageKey: fc.string({ minLength: 1, maxLength: 50 }),
  format: fc.oneof(
    fc.constant('jpeg' as const),
    fc.constant('png' as const),
    fc.constant('mp4' as const),
    fc.constant('mov' as const),
  ),
  sizeBytes: fc.integer({ min: 1, max: 10_000_000 }),
  capturedAt: fc.date(),
});

describe('Feature: integration-wiring, Property 5: ListingRequested idempotent handling', () => {
  it('publishes the same ListingRequested event N times (1-5) with same returnRequestId — exactly one Open_Box variant is created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim() || 'assessment summary'),
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 5 }),
        async (publishCount, returnRequestId, assessmentSummary, mediaReferences) => {
          // Create fresh infrastructure for each property run
          const eventBus = new InProcessEventBus();
          const productRepo = new InMemoryProductRepository();
          const variantRepo = new InMemoryVariantRepository();
          const categoryRepo = new InMemoryCategoryRepository();
          const logger = new SilentLogger();

          // Seed one product in the product repo
          const productId = `prop5-product-${randomUUID()}`;
          productRepo.addProduct(new Product({
            id: productId,
            title: 'Idempotent Test Product',
            brand: 'TestBrand',
            catalogImageUrl: `/assets/products/${productId}.jpg`,
            category: 'cat-electronics',
            basePrice: 2000,
          }));

          // Create CatalogService + ListingRequestedHandler wired to the bus
          const catalogService = new CatalogService(
            productRepo,
            variantRepo,
            categoryRepo,
            eventBus,
            DEFAULT_CATALOG_CONFIG,
          );

          // Handler subscribes itself to the event bus on construction
          new ListingRequestedHandler(catalogService, eventBus, logger);

          // Publish the same ListingRequested event N times with the same returnRequestId
          // Each publish uses a unique eventId so the InProcessEventBus doesn't deduplicate at the bus level
          for (let i = 0; i < publishCount; i++) {
            const event: DomainEvent = {
              eventId: randomUUID(), // unique eventId each time to test handler-level idempotency
              eventType: 'ListingRequested',
              timestamp: new Date(),
              payload: {
                returnRequestId,
                productId,
                conditionGrade: 'A',
                assessmentSummary,
                mediaReferences,
              },
            };

            await eventBus.publish(event);
          }

          // After all publishes, query variants for the product
          const variants = await variantRepo.findByProductId(productId);
          const openBoxVariants = variants.filter(v => v.condition === 'Open_Box');

          // Verify exactly ONE Open_Box variant was created (not N)
          expect(openBoxVariants).toHaveLength(1);

          // The single variant should have the correct sourceReturnId
          expect(openBoxVariants[0].sourceReturnId).toBe(returnRequestId);

          // Also verify via findBySourceReturnId that only one exists
          const foundByReturn = await variantRepo.findBySourceReturnId(returnRequestId);
          expect(foundByReturn).not.toBeNull();
          expect(foundByReturn!.condition).toBe('Open_Box');

          // If N > 1, verify that duplicate discards were logged
          if (publishCount > 1) {
            const duplicateLogs = logger.entries.filter(
              e => e.discardReason === 'duplicate',
            );
            expect(duplicateLogs).toHaveLength(publishCount - 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
