/**
 * Property 4: Open_Box variant pricing invariant
 *
 * For any product with basePrice > 0 and for any openBoxDiscountPercent ∈ (0, 100),
 * when a ListingRequested event with conditionGrade 'A' is processed for that product,
 * the resulting Open_Box variant's price SHALL equal basePrice × (1 − openBoxDiscountPercent / 100).
 *
 * Feature: integration-wiring, Property 4: Open_Box variant pricing invariant
 * Validates: Requirements 7.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CatalogService } from '../../application/catalog/CatalogService';
import { InMemoryProductRepository } from '../../infrastructure/catalog/InMemoryProductRepository';
import { InMemoryVariantRepository } from '../../infrastructure/catalog/InMemoryVariantRepository';
import { InMemoryCategoryRepository } from '../../infrastructure/catalog/InMemoryCategoryRepository';
import { InProcessEventBus } from '../../infrastructure/events/InProcessEventBus';
import { Product } from '../../domain/catalog/Product';
import { DEFAULT_CATALOG_CONFIG } from '../../application/catalog/CatalogConfig';

describe('Feature: integration-wiring, Property 4: Open_Box variant pricing invariant', () => {
  it('Open_Box variant price equals basePrice × (1 − openBoxDiscountPercent / 100) for any valid basePrice and discount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        fc.integer({ min: 1, max: 99 }),
        async (basePrice, openBoxDiscountPercent) => {
          // Fresh repositories and event bus for each run
          const productRepo = new InMemoryProductRepository();
          const variantRepo = new InMemoryVariantRepository();
          const categoryRepo = new InMemoryCategoryRepository();
          const eventBus = new InProcessEventBus();

          // Configure CatalogService with the generated discount percent
          const config = {
            ...DEFAULT_CATALOG_CONFIG,
            openBoxDiscountPercent,
          };

          const catalogService = new CatalogService(
            productRepo,
            variantRepo,
            categoryRepo,
            eventBus,
            config,
          );

          // Create a product with the generated basePrice
          const productId = `test-product-${basePrice}-${openBoxDiscountPercent}`;
          const product = new Product({
            id: productId,
            title: 'Test Product',
            brand: 'TestBrand',
            catalogImageUrl: `/assets/products/${productId}.jpg`,
            category: 'test-category',
            basePrice,
          });
          productRepo.addProduct(product);

          // Trigger Open_Box variant creation via createVariantFromListing
          const result = await catalogService.createVariantFromListing({
            returnRequestId: `return-${productId}-${Date.now()}-${Math.random()}`,
            productId,
            conditionGrade: 'A',
            assessmentSummary: 'Item is in excellent condition',
            mediaReferences: [{
              id: 'media-1',
              type: 'photo_front',
              storageKey: 'uploads/photo-front.jpg',
              format: 'jpeg',
              sizeBytes: 1024,
              capturedAt: new Date(),
            }],
          });

          // Verify variant was created successfully
          expect(result.success).toBe(true);
          if (!result.success) return;

          // Verify the price invariant: basePrice × (1 − openBoxDiscountPercent / 100)
          const expectedPrice = basePrice * (1 - openBoxDiscountPercent / 100);
          expect(result.data.price).toBe(expectedPrice);
          expect(result.data.condition).toBe('Open_Box');
        }
      ),
      { numRuns: 100 }
    );
  });
});
