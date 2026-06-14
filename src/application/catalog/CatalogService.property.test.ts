// Property-based tests for CatalogService (event handling and variant creation)
// Feature: storefront-browsing
// Test framework: vitest + fast-check

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ListingRequestedHandler, type ILogger, type CatalogLogEntry } from './ListingRequestedHandler.js';
import { CatalogService, type CatalogError, type CatalogResult, type ListingRequestPayload } from './CatalogService.js';
import type { SearchResult } from './SearchService.js';
import { DEFAULT_CATALOG_CONFIG } from './CatalogConfig.js';
import { InMemoryProductRepository } from '../../infrastructure/catalog/InMemoryProductRepository.js';
import { InMemoryVariantRepository } from '../../infrastructure/catalog/InMemoryVariantRepository.js';
import { InMemoryCategoryRepository } from '../../infrastructure/catalog/InMemoryCategoryRepository.js';
import { Product } from '../../domain/catalog/Product.js';
import { Category } from '../../domain/catalog/Category.js';
import type { DomainEvent, IEventBus, EventHandler } from '../../domain/shared/events.js';
import type { MediaReference } from '../../domain/shared/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Simple in-process event bus for testing */
class MockEventBus implements IEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();
  public publishedEvents: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, existing.filter((h) => h !== handler));
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

/** Mock logger that captures log entries */
class MockLogger implements ILogger {
  public readonly entries: CatalogLogEntry[] = [];

  info(entry: CatalogLogEntry): void { this.entries.push(entry); }
  warn(entry: CatalogLogEntry): void { this.entries.push(entry); }
  error(entry: CatalogLogEntry): void { this.entries.push(entry); }

  clear(): void {
    this.entries.length = 0;
  }
}

// ─── Shared Arbitraries ──────────────────────────────────────────────────────

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

/** Generate a non-empty, non-whitespace string for text fields */
const validStringArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 200 })
  .map(s => s.trim() || 'fallback text');

// ─── Property 5 ──────────────────────────────────────────────────────────────

/**
 * Property 5: Valid Grade A ListingRequested creates correct variant and publishes ListingCreated
 *
 * For any valid ListingRequested event with conditionGrade equal to "A" and a productId
 * that exists in the catalog, the system SHALL create a ProductVariant with:
 * - condition 'Open_Box'
 * - price equal to basePrice * (1 - openBoxDiscountPercent/100)
 * - stock equal to 1
 * - sourceReturnId set to the event's returnRequestId
 * - conditionReport set to the event's assessmentSummary
 * - unitPhotos populated from the event's mediaReferences (capped at maxUnitPhotos)
 * AND SHALL publish a ListingCreated event with correct variantId, productId, condition, and sourceReturnId.
 *
 * **Validates: Requirements 3.1, 3.2, 6.7**
 */
describe('Property 5: Valid Grade A ListingRequested creates correct variant and publishes ListingCreated', () => {
  let productRepo: InMemoryProductRepository;
  let variantRepo: InMemoryVariantRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let eventBus: MockEventBus;
  let catalogService: CatalogService;

  const EXISTING_PRODUCT_ID = 'product-001';
  const BASE_PRICE = 2000;

  beforeEach(() => {
    productRepo = new InMemoryProductRepository();
    variantRepo = new InMemoryVariantRepository();
    categoryRepo = new InMemoryCategoryRepository();
    eventBus = new MockEventBus();

    productRepo.addProduct(new Product({
      id: EXISTING_PRODUCT_ID,
      title: 'Test Wireless Headphones',
      brand: 'TestBrand',
      catalogImageUrl: '/assets/products/product-001.jpg',
      category: 'cat-electronics',
      basePrice: BASE_PRICE,
    }));

    catalogService = new CatalogService(
      productRepo,
      variantRepo,
      categoryRepo,
      eventBus,
      DEFAULT_CATALOG_CONFIG,
    );
  });

  it('creates variant with correct condition, price, stock, sourceReturnId, conditionReport, and unitPhotos cap', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 20 }),
        async (returnRequestId, assessmentSummary, mediaReferences) => {
          // Reset state for each iteration
          variantRepo.clear();
          eventBus.clear();

          const payload = {
            returnRequestId,
            productId: EXISTING_PRODUCT_ID,
            conditionGrade: 'A',
            assessmentSummary,
            mediaReferences,
          };

          const result = await catalogService.createVariantFromListing(payload);

          // Must succeed
          expect(result.success).toBe(true);
          if (!result.success) return;

          const variant = result.data;

          // Condition must be Open_Box
          expect(variant.condition).toBe('Open_Box');

          // Price must be basePrice * (1 - 15/100) = basePrice * 0.85
          const expectedPrice = BASE_PRICE * (1 - DEFAULT_CATALOG_CONFIG.openBoxDiscountPercent / 100);
          expect(variant.price).toBe(expectedPrice);

          // Stock must be 1
          expect(variant.stock).toBe(1);

          // sourceReturnId must match the returnRequestId
          expect(variant.sourceReturnId).toBe(returnRequestId);

          // conditionReport must match assessmentSummary
          expect(variant.conditionReport).toBe(assessmentSummary);

          // unitPhotos length must be min(mediaReferences.length, maxUnitPhotos)
          const expectedPhotosLength = Math.min(mediaReferences.length, DEFAULT_CATALOG_CONFIG.maxUnitPhotos);
          expect(variant.unitPhotos).toBeDefined();
          expect(variant.unitPhotos!.length).toBe(expectedPhotosLength);

          // unitPhotos should be the first N items from mediaReferences (preserving order)
          for (let i = 0; i < expectedPhotosLength; i++) {
            expect(variant.unitPhotos![i].id).toBe(mediaReferences[i].id);
            expect(variant.unitPhotos![i].storageKey).toBe(mediaReferences[i].storageKey);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('publishes ListingCreated event with correct variantId, productId, condition, and sourceReturnId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 5 }),
        async (returnRequestId, assessmentSummary, mediaReferences) => {
          // Reset state for each iteration
          variantRepo.clear();
          eventBus.clear();

          const payload = {
            returnRequestId,
            productId: EXISTING_PRODUCT_ID,
            conditionGrade: 'A',
            assessmentSummary,
            mediaReferences,
          };

          const result = await catalogService.createVariantFromListing(payload);
          expect(result.success).toBe(true);
          if (!result.success) return;

          const variant = result.data;

          // Exactly one ListingCreated event must be published
          const listingCreatedEvents = eventBus.publishedEvents.filter(
            (e) => e.eventType === 'ListingCreated',
          );
          expect(listingCreatedEvents).toHaveLength(1);

          const event = listingCreatedEvents[0];
          expect(event.payload.variantId).toBe(variant.id);
          expect(event.payload.productId).toBe(EXISTING_PRODUCT_ID);
          expect(event.payload.condition).toBe('Open_Box');
          expect(event.payload.sourceReturnId).toBe(returnRequestId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('correctly caps unitPhotos at maxUnitPhotos when more than 10 mediaReferences are provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 11, maxLength: 20 }),
        async (returnRequestId, assessmentSummary, mediaReferences) => {
          variantRepo.clear();
          eventBus.clear();

          const payload = {
            returnRequestId,
            productId: EXISTING_PRODUCT_ID,
            conditionGrade: 'A',
            assessmentSummary,
            mediaReferences,
          };

          const result = await catalogService.createVariantFromListing(payload);
          expect(result.success).toBe(true);
          if (!result.success) return;

          // unitPhotos must be capped at maxUnitPhotos (10)
          expect(result.data.unitPhotos!.length).toBe(DEFAULT_CATALOG_CONFIG.maxUnitPhotos);

          // Must be the first 10 media references (order preserved)
          for (let i = 0; i < DEFAULT_CATALOG_CONFIG.maxUnitPhotos; i++) {
            expect(result.data.unitPhotos![i].id).toBe(mediaReferences[i].id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('produces correct price across varying base prices', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 100000 }),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 5 }),
        async (basePrice, returnRequestId, assessmentSummary, mediaReferences) => {
          // Create a fresh product with the random base price
          const localProductRepo = new InMemoryProductRepository();
          const localVariantRepo = new InMemoryVariantRepository();
          const localCategoryRepo = new InMemoryCategoryRepository();
          const localEventBus = new MockEventBus();

          localProductRepo.addProduct(new Product({
            id: 'dynamic-product',
            title: 'Dynamic Price Product',
            brand: 'DynBrand',
            catalogImageUrl: '/assets/products/dynamic-product.jpg',
            category: 'cat-electronics',
            basePrice,
          }));

          const localService = new CatalogService(
            localProductRepo,
            localVariantRepo,
            localCategoryRepo,
            localEventBus,
            DEFAULT_CATALOG_CONFIG,
          );

          const result = await localService.createVariantFromListing({
            returnRequestId,
            productId: 'dynamic-product',
            conditionGrade: 'A',
            assessmentSummary,
            mediaReferences,
          });

          expect(result.success).toBe(true);
          if (!result.success) return;

          const expectedPrice = basePrice * (1 - DEFAULT_CATALOG_CONFIG.openBoxDiscountPercent / 100);
          expect(result.data.price).toBe(expectedPrice);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6 ──────────────────────────────────────────────────────────────

/**
 * Property 6: Unknown productId in ListingRequested results in graceful discard
 *
 * For any ListingRequested event whose productId does not match any Product in the
 * repository, the system SHALL discard the event without creating a variant, without
 * publishing ListingCreated, without throwing an exception, and SHALL emit a structured
 * warning log containing the eventId, returnRequestId, productId, and discardReason.
 *
 * **Validates: Requirements 3.3, 10.1, 10.2, 10.3, 10.4**
 */
describe('Property 6: Unknown productId in ListingRequested results in graceful discard', () => {
  let productRepo: InMemoryProductRepository;
  let variantRepo: InMemoryVariantRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let eventBus: MockEventBus;
  let logger: MockLogger;
  let handler: ListingRequestedHandler;

  const KNOWN_PRODUCT_ID = 'known-product-for-prop6';

  beforeEach(() => {
    productRepo = new InMemoryProductRepository();
    variantRepo = new InMemoryVariantRepository();
    categoryRepo = new InMemoryCategoryRepository();
    eventBus = new MockEventBus();
    logger = new MockLogger();

    const category = new Category({ id: 'cat-prop6', name: 'Electronics', imageUrl: '/assets/cat.jpg' });
    categoryRepo.addCategory(category);
    productRepo.addCategoryMapping('cat-prop6', 'Electronics');

    const product = new Product({
      id: KNOWN_PRODUCT_ID,
      title: 'Known Product',
      brand: 'KnownBrand',
      catalogImageUrl: `/assets/products/${KNOWN_PRODUCT_ID}.jpg`,
      category: 'cat-prop6',
      basePrice: 2999,
    });
    productRepo.addProduct(product);

    const catalogService = new CatalogService(
      productRepo,
      variantRepo,
      categoryRepo,
      eventBus,
      DEFAULT_CATALOG_CONFIG,
    );

    handler = new ListingRequestedHandler(catalogService, eventBus, logger);
  });

  it('discards events with unknown productIds: no variant created, no ListingCreated published, no exception, structured warning logged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().filter(id => id !== KNOWN_PRODUCT_ID),
        fc.uuid(),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 5 }),
        async (unknownProductId, returnRequestId, eventId, assessmentSummary, mediaReferences) => {
          eventBus.clear();
          logger.clear();

          const variantCountBefore = variantRepo.size;

          const event: DomainEvent = {
            eventId,
            eventType: 'ListingRequested',
            timestamp: new Date(),
            payload: {
              returnRequestId,
              productId: unknownProductId,
              conditionGrade: 'A',
              assessmentSummary,
              mediaReferences,
            },
          };

          let threwException = false;
          try {
            await handler.handle(event);
          } catch {
            threwException = true;
          }
          expect(threwException).toBe(false);

          expect(variantRepo.size).toBe(variantCountBefore);

          const listingCreatedEvents = eventBus.publishedEvents.filter(
            e => e.eventType === 'ListingCreated',
          );
          expect(listingCreatedEvents).toHaveLength(0);

          const warnEntries = logger.entries.filter(e => e.level === 'warn');
          expect(warnEntries.length).toBeGreaterThanOrEqual(1);

          const relevantWarning = warnEntries.find(entry => entry.eventId === eventId);
          expect(relevantWarning).toBeDefined();
          expect(relevantWarning!.returnRequestId).toBe(returnRequestId);
          expect(relevantWarning!.productId).toBe(unknownProductId);
          expect(relevantWarning!.discardReason).toBe('unknown_productId');
          expect(relevantWarning!.module).toBe('catalog');
          expect(relevantWarning!.level).toBe('warn');
          expect(relevantWarning!.action).toBeDefined();
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ─── Property 7 ──────────────────────────────────────────────────────────────

/**
 * Property 7: Non-A grade ListingRequested is discarded
 *
 * For any ListingRequested event with a conditionGrade value that is not "A"
 * (including "B", "C", "D", null, empty, or any unrecognized value), the system
 * SHALL discard the event without creating a variant and without publishing
 * ListingCreated.
 *
 * **Validates: Requirements 3.4**
 */
describe('Property 7: Non-A grade ListingRequested is discarded', () => {
  let productRepo: InMemoryProductRepository;
  let variantRepo: InMemoryVariantRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let eventBus: MockEventBus;
  let logger: MockLogger;
  let catalogService: CatalogService;
  let handler: ListingRequestedHandler;

  const EXISTING_PRODUCT_ID = 'product-for-grade-test';

  /**
   * Generate condition grades that are NOT 'A'.
   * Includes known non-A grades and random strings — all filtered to exclude 'A'.
   */
  const arbNonAGrade: fc.Arbitrary<string> = fc.oneof(
    fc.constant('B'),
    fc.constant('C'),
    fc.constant('D'),
    fc.constant('a'),
    fc.constant('AA'),
    fc.constant('Grade A'),
    fc.constant('Z'),
    fc.constant('0'),
    fc.string({ minLength: 0, maxLength: 20 }).filter((s) => s !== 'A'),
  );

  beforeEach(() => {
    productRepo = new InMemoryProductRepository();
    variantRepo = new InMemoryVariantRepository();
    categoryRepo = new InMemoryCategoryRepository();
    eventBus = new MockEventBus();
    logger = new MockLogger();

    productRepo.addProduct(new Product({
      id: EXISTING_PRODUCT_ID,
      title: 'Grade Test Product',
      brand: 'TestBrand',
      catalogImageUrl: '/assets/products/product-for-grade-test.jpg',
      category: 'cat-1',
      basePrice: 1000,
    }));

    catalogService = new CatalogService(
      productRepo,
      variantRepo,
      categoryRepo,
      eventBus,
      DEFAULT_CATALOG_CONFIG,
    );

    handler = new ListingRequestedHandler(catalogService, eventBus, logger);
  });

  it('discards events with non-A conditionGrade — no variant created and no ListingCreated published', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNonAGrade,
        fc.uuid(),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 5 }),
        async (grade, eventId, returnRequestId, assessmentSummary, mediaRefs) => {
          variantRepo.clear();
          eventBus.clear();
          logger.clear();

          const event: DomainEvent = {
            eventId,
            eventType: 'ListingRequested',
            timestamp: new Date(),
            payload: {
              returnRequestId,
              productId: EXISTING_PRODUCT_ID,
              conditionGrade: grade,
              assessmentSummary,
              mediaReferences: mediaRefs,
            },
          };

          await handler.handle(event);

          expect(variantRepo.size).toBe(0);

          const listingCreatedEvents = eventBus.publishedEvents.filter(
            (e) => e.eventType === 'ListingCreated',
          );
          expect(listingCreatedEvents).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logs with discardReason "invalid_grade" for non-empty non-A grades that pass field validation', async () => {
    const arbNonANonEmptyGrade: fc.Arbitrary<string> = fc.oneof(
      fc.constant('B'),
      fc.constant('C'),
      fc.constant('D'),
      fc.constant('a'),
      fc.constant('AA'),
      fc.constant('Grade A'),
      fc.constant('Z'),
      fc.constant('0'),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== 'A' && s.trim().length > 0),
    );

    await fc.assert(
      fc.asyncProperty(
        arbNonANonEmptyGrade,
        fc.uuid(),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
        async (grade, eventId, returnRequestId, assessmentSummary, mediaRefs) => {
          logger.clear();
          eventBus.clear();

          const event: DomainEvent = {
            eventId,
            eventType: 'ListingRequested',
            timestamp: new Date(),
            payload: {
              returnRequestId,
              productId: EXISTING_PRODUCT_ID,
              conditionGrade: grade,
              assessmentSummary,
              mediaReferences: mediaRefs,
            },
          };

          await handler.handle(event);

          const discardLogs = logger.entries.filter(
            (e) => e.discardReason === 'invalid_grade',
          );
          expect(discardLogs.length).toBeGreaterThanOrEqual(1);
          expect(discardLogs[0].action).toBe('listing_requested_discard');
          expect(discardLogs[0].module).toBe('catalog');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handler never throws regardless of the grade value', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNonAGrade,
        fc.uuid(),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
        async (grade, eventId, returnRequestId, assessmentSummary, mediaRefs) => {
          eventBus.clear();
          logger.clear();

          const event: DomainEvent = {
            eventId,
            eventType: 'ListingRequested',
            timestamp: new Date(),
            payload: {
              returnRequestId,
              productId: EXISTING_PRODUCT_ID,
              conditionGrade: grade,
              assessmentSummary,
              mediaReferences: mediaRefs,
            },
          };

          let threw = false;
          try {
            await handler.handle(event);
          } catch {
            threw = true;
          }
          expect(threw).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 15 ─────────────────────────────────────────────────────────────

/**
 * Property 15: CatalogService validates inputs and returns structured errors
 *
 * For any invalid input to CatalogService methods (empty IDs, invalid condition
 * enum values, negative prices), the service SHALL return a descriptive error object
 * with `type`, `field`, and `message` properties rather than throwing an unhandled
 * exception. For not-found cases, the service SHALL return null.
 *
 * **Validates: Requirements 6.6**
 */
describe('Property 15: CatalogService validates inputs and returns structured errors', () => {
  let productRepo: InMemoryProductRepository;
  let variantRepo: InMemoryVariantRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let eventBus: MockEventBus;
  let catalogService: CatalogService;

  const EXISTING_PRODUCT_ID = 'prop15-product-001';

  beforeEach(() => {
    productRepo = new InMemoryProductRepository();
    variantRepo = new InMemoryVariantRepository();
    categoryRepo = new InMemoryCategoryRepository();
    eventBus = new MockEventBus();

    productRepo.addProduct(new Product({
      id: EXISTING_PRODUCT_ID,
      title: 'Validation Test Product',
      brand: 'TestBrand',
      catalogImageUrl: '/assets/products/prop15-product-001.jpg',
      category: 'cat-test',
      basePrice: 1000,
    }));

    catalogService = new CatalogService(
      productRepo,
      variantRepo,
      categoryRepo,
      eventBus,
      DEFAULT_CATALOG_CONFIG,
    );
  });

  // ─── Arbitraries for invalid inputs ──────────────────────────────────────

  /** Generate invalid IDs: empty strings, whitespace-only strings */
  const invalidIdArb: fc.Arbitrary<unknown> = fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\t'),
    fc.constant('\n'),
    fc.constant('  \t\n  '),
    fc.constant('     '),
    fc.constant(' \t \n '),
  );

  /** Generate non-A condition grades for createVariantFromListing */
  const invalidGradeArb: fc.Arbitrary<string> = fc.oneof(
    fc.constant('B'),
    fc.constant('C'),
    fc.constant('D'),
    fc.constant('a'),
    fc.constant('AA'),
    fc.constant('Grade A'),
    fc.constant(''),
    fc.constant('Z'),
    fc.constant('new'),
    fc.string({ minLength: 0, maxLength: 20 }).filter(s => s !== 'A'),
  );

  /** Generate payloads with missing/empty required string fields */
  const invalidPayloadFieldArb = fc.oneof(
    // Empty returnRequestId
    fc.record({
      returnRequestId: fc.oneof(fc.constant(''), fc.constant('   ')),
      productId: fc.constant(EXISTING_PRODUCT_ID),
      conditionGrade: fc.constant('A'),
      assessmentSummary: validStringArb,
      mediaReferences: fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
    }),
    // Empty productId
    fc.record({
      returnRequestId: fc.uuid(),
      productId: fc.oneof(fc.constant(''), fc.constant('   ')),
      conditionGrade: fc.constant('A'),
      assessmentSummary: validStringArb,
      mediaReferences: fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
    }),
    // Empty conditionGrade
    fc.record({
      returnRequestId: fc.uuid(),
      productId: fc.constant(EXISTING_PRODUCT_ID),
      conditionGrade: fc.oneof(fc.constant(''), fc.constant('   ')),
      assessmentSummary: validStringArb,
      mediaReferences: fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
    }),
    // Empty assessmentSummary
    fc.record({
      returnRequestId: fc.uuid(),
      productId: fc.constant(EXISTING_PRODUCT_ID),
      conditionGrade: fc.constant('A'),
      assessmentSummary: fc.oneof(fc.constant(''), fc.constant('   ')),
      mediaReferences: fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
    }),
    // Empty mediaReferences array
    fc.record({
      returnRequestId: fc.uuid(),
      productId: fc.constant(EXISTING_PRODUCT_ID),
      conditionGrade: fc.constant('A'),
      assessmentSummary: validStringArb,
      mediaReferences: fc.constant([] as MediaReference[]),
    }),
  );

  // ─── getProductById with invalid inputs ──────────────────────────────────

  it('getProductById returns null for empty/whitespace-only IDs without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidIdArb,
        async (invalidId) => {
          let threw = false;
          let result: Product | null = null;
          try {
            result = await catalogService.getProductById(invalidId as string);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getProductById returns null for non-existent valid IDs without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().filter(id => id !== EXISTING_PRODUCT_ID),
        async (nonExistentId) => {
          let threw = false;
          let result: Product | null = null;
          try {
            result = await catalogService.getProductById(nonExistentId);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── getVariantsByProductId with invalid inputs ──────────────────────────

  it('getVariantsByProductId returns empty array for empty/whitespace-only IDs without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidIdArb,
        async (invalidId) => {
          let threw = false;
          let result: unknown = undefined;
          try {
            result = await catalogService.getVariantsByProductId(invalidId as string);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── searchProducts with invalid inputs ──────────────────────────────────

  it('searchProducts returns empty result with totalCount=0 for empty/whitespace keywords without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidIdArb,
        async (invalidKeyword) => {
          let threw = false;
          let result: SearchResult | undefined;
          try {
            result = await catalogService.searchProducts(invalidKeyword as string);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(result!.products).toEqual([]);
          expect(result!.totalCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── createVariantFromListing with invalid required fields ───────────────

  it('createVariantFromListing returns { success: false, error } with structured CatalogError for missing/empty fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidPayloadFieldArb,
        async (payload) => {
          variantRepo.clear();
          eventBus.clear();

          let threw = false;
          let result: CatalogResult<unknown> | undefined;
          try {
            result = await catalogService.createVariantFromListing(payload as ListingRequestPayload);
          } catch {
            threw = true;
          }

          // No unhandled exceptions
          expect(threw).toBe(false);
          expect(result).toBeDefined();

          // Must return failure
          expect(result!.success).toBe(false);
          if (!result!.success) {
            const error = (result as { success: false; error: CatalogError }).error;
            // Structured error with type, field, and message
            expect(error).toBeDefined();
            expect(typeof error.type).toBe('string');
            expect(error.type).toMatch(/^(validation|not_found|duplicate|invalid_grade)$/);
            expect(typeof error.field).toBe('string');
            expect(error.field.length).toBeGreaterThan(0);
            expect(typeof error.message).toBe('string');
            expect(error.message.length).toBeGreaterThan(0);
          }

          // No variant should have been created
          expect(variantRepo.size).toBe(0);

          // No ListingCreated event published
          const listingCreatedEvents = eventBus.publishedEvents.filter(
            e => e.eventType === 'ListingCreated',
          );
          expect(listingCreatedEvents).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── createVariantFromListing with invalid grades ────────────────────────

  it('createVariantFromListing returns { success: false, error } with type "invalid_grade" for non-A grades', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidGradeArb.filter(g => g.trim().length > 0),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
        async (grade, returnRequestId, assessmentSummary, mediaRefs) => {
          variantRepo.clear();
          eventBus.clear();

          const payload = {
            returnRequestId,
            productId: EXISTING_PRODUCT_ID,
            conditionGrade: grade,
            assessmentSummary,
            mediaReferences: mediaRefs,
          };

          let threw = false;
          let result: CatalogResult<unknown> | undefined;
          try {
            result = await catalogService.createVariantFromListing(payload);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(result!.success).toBe(false);

          if (!result!.success) {
            const error = (result as { success: false; error: CatalogError }).error;
            expect(error.type).toBe('invalid_grade');
            expect(error.field).toBe('conditionGrade');
            expect(typeof error.message).toBe('string');
            expect(error.message.length).toBeGreaterThan(0);
          }

          // No variant should have been created
          expect(variantRepo.size).toBe(0);

          // No ListingCreated event published
          const listingCreatedEvents = eventBus.publishedEvents.filter(
            e => e.eventType === 'ListingCreated',
          );
          expect(listingCreatedEvents).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── createVariantFromListing with unknown productId ─────────────────────

  it('createVariantFromListing returns { success: false, error } with type "not_found" for unknown productId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().filter(id => id !== EXISTING_PRODUCT_ID),
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
        async (unknownProductId, returnRequestId, assessmentSummary, mediaRefs) => {
          variantRepo.clear();
          eventBus.clear();

          const payload = {
            returnRequestId,
            productId: unknownProductId,
            conditionGrade: 'A',
            assessmentSummary,
            mediaReferences: mediaRefs,
          };

          let threw = false;
          let result: CatalogResult<unknown> | undefined;
          try {
            result = await catalogService.createVariantFromListing(payload);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(result!.success).toBe(false);

          if (!result!.success) {
            const error = (result as { success: false; error: CatalogError }).error;
            expect(error.type).toBe('not_found');
            expect(error.field).toBe('productId');
            expect(typeof error.message).toBe('string');
            expect(error.message.length).toBeGreaterThan(0);
          }

          // No variant should have been created
          expect(variantRepo.size).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── createVariantFromListing duplicate sourceReturnId ───────────────────

  it('createVariantFromListing returns { success: false, error } with type "duplicate" for existing sourceReturnId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validStringArb,
        fc.array(mediaReferenceArb, { minLength: 1, maxLength: 3 }),
        async (returnRequestId, assessmentSummary, mediaRefs) => {
          variantRepo.clear();
          eventBus.clear();

          const payload = {
            returnRequestId,
            productId: EXISTING_PRODUCT_ID,
            conditionGrade: 'A',
            assessmentSummary,
            mediaReferences: mediaRefs,
          };

          // First call — should succeed
          const first = await catalogService.createVariantFromListing(payload);
          expect(first.success).toBe(true);

          // Reset event tracking but keep variant in store
          eventBus.clear();

          // Second call with same returnRequestId — should return duplicate error
          let threw = false;
          let result: CatalogResult<unknown> | undefined;
          try {
            result = await catalogService.createVariantFromListing(payload);
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(result!.success).toBe(false);

          if (!result!.success) {
            const error = (result as { success: false; error: CatalogError }).error;
            expect(error.type).toBe('duplicate');
            expect(error.field).toBe('returnRequestId');
            expect(typeof error.message).toBe('string');
            expect(error.message.length).toBeGreaterThan(0);
          }

          // No additional ListingCreated event from second call
          const listingCreatedEvents = eventBus.publishedEvents.filter(
            e => e.eventType === 'ListingCreated',
          );
          expect(listingCreatedEvents).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ─── All methods never throw unhandled exceptions ────────────────────────

  it('no CatalogService method throws an unhandled exception regardless of input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          invalidIdArb,
          fc.uuid(),
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
        ),
        async (input) => {
          const calls: Promise<unknown>[] = [
            catalogService.getProductById(input as string),
            catalogService.getVariantsByProductId(input as string),
            catalogService.searchProducts(input as string),
          ];

          for (const call of calls) {
            let threw = false;
            try {
              await call;
            } catch {
              threw = true;
            }
            expect(threw).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
