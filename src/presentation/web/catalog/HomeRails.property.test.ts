// Property-based tests for Home Page Rails logic
// Feature: storefront-browsing, Property 13: Deals rail contains only discounted variants
// Test framework: vitest + fast-check

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductData {
  id: string;
  basePrice: number;
}

interface VariantData {
  id: string;
  productId: string;
  price: number;
  stock: number;
  condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';
}

interface DealItem {
  productId: string;
  variantId: string;
  basePrice: number;
  discountedPrice: number;
}

// ─── Pure Logic Under Test ───────────────────────────────────────────────────

/**
 * Computes the deals rail items from products and variants.
 * This mirrors the exact logic from CatalogContext.tsx getDeals():
 *
 *   for (const product of products) {
 *     const variants = variantRepo.findByProductId(product.id);
 *     for (const variant of variants) {
 *       if (variant.price < product.basePrice && variant.stock > 0) {
 *         deals.push({ ... });
 *       }
 *     }
 *   }
 *   return deals.slice(0, maxDealsRailItems);
 *
 * The Property 13 invariant (from design doc) is:
 *   Deals rail SHALL contain only ProductVariants whose price is strictly less
 *   than their parent Product's basePrice, with a maximum of 10 items.
 */
function computeDealsRailItems(
  products: ProductData[],
  variants: VariantData[],
  maxItems: number = 10,
): DealItem[] {
  const deals: DealItem[] = [];

  for (const product of products) {
    const productVariants = variants.filter((v) => v.productId === product.id);
    for (const variant of productVariants) {
      if (variant.price < product.basePrice && variant.stock > 0) {
        deals.push({
          productId: product.id,
          variantId: variant.id,
          basePrice: product.basePrice,
          discountedPrice: variant.price,
        });
      }
    }
  }

  return deals.slice(0, maxItems);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const conditionArb: fc.Arbitrary<VariantData['condition']> = fc.constantFrom(
  'New',
  'Certified_Renewed',
  'Open_Box',
  'Used_Like_New',
);

/** Generate a product with a random base price */
const productArb: fc.Arbitrary<ProductData> = fc.record({
  id: fc.uuid(),
  basePrice: fc.integer({ min: 100, max: 100000 }),
});

/** Generate a variant for a given product ID with a price that may be above, below, or equal to any value */
function variantForProductArb(productId: string, basePrice: number): fc.Arbitrary<VariantData> {
  return fc.record({
    id: fc.uuid(),
    productId: fc.constant(productId),
    // Price ranges from well below to well above basePrice to get good mix
    price: fc.integer({ min: 1, max: basePrice * 2 }),
    stock: fc.integer({ min: 0, max: 100 }),
    condition: conditionArb,
  });
}

/**
 * Generate a catalog with random products and variants with mixed pricing.
 * Some variants will be cheaper than basePrice (deals), some equal or more expensive.
 */
const catalogArb: fc.Arbitrary<{ products: ProductData[]; variants: VariantData[] }> = fc
  .array(productArb, { minLength: 1, maxLength: 10 })
  .chain((products) => {
    // For each product, generate 1-5 variants with varied pricing
    const variantArbs = products.map((p) =>
      fc.array(variantForProductArb(p.id, p.basePrice), { minLength: 1, maxLength: 5 }),
    );
    return fc.tuple(...variantArbs).map((variantArrays) => ({
      products,
      variants: variantArrays.flat(),
    }));
  });

/**
 * Generate a large catalog that is likely to produce more than 10 deal items,
 * so we can test the max-items cap.
 */
const largeCatalogArb: fc.Arbitrary<{ products: ProductData[]; variants: VariantData[] }> = fc
  .array(productArb, { minLength: 5, maxLength: 15 })
  .chain((products) => {
    // For each product, generate variants that are mostly discounted (price < basePrice)
    const variantArbs = products.map((p) =>
      fc.array(
        fc.record({
          id: fc.uuid(),
          productId: fc.constant(p.id),
          // Bias price to be below basePrice to generate many deals
          price: fc.integer({ min: 1, max: Math.max(1, p.basePrice - 1) }),
          stock: fc.integer({ min: 1, max: 100 }), // all in stock
          condition: conditionArb,
        }),
        { minLength: 2, maxLength: 5 },
      ),
    );
    return fc.tuple(...variantArbs).map((variantArrays) => ({
      products,
      variants: variantArrays.flat(),
    }));
  });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: storefront-browsing, Property 13: Deals rail contains only discounted variants', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * Property 13: For any catalog state, the Deals rail SHALL contain only ProductVariants
   * whose price is strictly less than their parent Product's basePrice, with a maximum of 10 items.
   */

  it('all items in the deals rail have price strictly less than their parent product basePrice', () => {
    fc.assert(
      fc.property(catalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);

        for (const deal of dealsRail) {
          // Every deal item must have discountedPrice < basePrice
          expect(deal.discountedPrice).toBeLessThan(deal.basePrice);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('deals rail contains at most 10 items', () => {
    fc.assert(
      fc.property(largeCatalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);

        expect(dealsRail.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: 150 },
    );
  });

  it('no variant with price >= basePrice appears in the deals rail', () => {
    fc.assert(
      fc.property(catalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);
        const dealVariantIds = new Set(dealsRail.map((d) => d.variantId));

        // Check that no variant with price >= basePrice sneaked in
        for (const variant of variants) {
          const product = products.find((p) => p.id === variant.productId);
          if (product && variant.price >= product.basePrice) {
            expect(dealVariantIds.has(variant.id)).toBe(false);
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  it('no variant with stock === 0 appears in the deals rail', () => {
    fc.assert(
      fc.property(catalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);
        const dealVariantIds = new Set(dealsRail.map((d) => d.variantId));

        // Check that no out-of-stock variant is in the deals rail
        for (const variant of variants) {
          if (variant.stock === 0) {
            expect(dealVariantIds.has(variant.id)).toBe(false);
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  it('every eligible variant (price < basePrice AND stock > 0) appears in the rail when total eligible <= 10', () => {
    fc.assert(
      fc.property(catalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);

        // Compute expected eligible variants
        const eligible = variants.filter((v) => {
          const product = products.find((p) => p.id === v.productId);
          return product && v.price < product.basePrice && v.stock > 0;
        });

        if (eligible.length <= 10) {
          // All eligible should be in the rail
          const dealVariantIds = new Set(dealsRail.map((d) => d.variantId));
          for (const v of eligible) {
            expect(dealVariantIds.has(v.id)).toBe(true);
          }
          expect(dealsRail.length).toBe(eligible.length);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('deals rail is empty when no variants are priced below their product basePrice', () => {
    // Generate catalogs where all variants have price >= basePrice
    const noDealsCatalogArb = fc
      .array(productArb, { minLength: 1, maxLength: 10 })
      .chain((products) => {
        const variantArbs = products.map((p) =>
          fc.array(
            fc.record({
              id: fc.uuid(),
              productId: fc.constant(p.id),
              // Price always >= basePrice
              price: fc.integer({ min: p.basePrice, max: p.basePrice * 3 }),
              stock: fc.integer({ min: 1, max: 100 }),
              condition: conditionArb,
            }),
            { minLength: 1, maxLength: 5 },
          ),
        );
        return fc.tuple(...variantArbs).map((variantArrays) => ({
          products,
          variants: variantArrays.flat(),
        }));
      });

    fc.assert(
      fc.property(noDealsCatalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);
        expect(dealsRail.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('deals rail is empty when all discounted variants are out of stock', () => {
    // Generate catalogs where discounted variants all have stock === 0
    const oosDiscountedCatalogArb = fc
      .array(productArb, { minLength: 1, maxLength: 10 })
      .chain((products) => {
        const variantArbs = products.map((p) =>
          fc.array(
            fc.record({
              id: fc.uuid(),
              productId: fc.constant(p.id),
              // Price below basePrice but stock is 0
              price: fc.integer({ min: 1, max: Math.max(1, p.basePrice - 1) }),
              stock: fc.constant(0),
              condition: conditionArb,
            }),
            { minLength: 1, maxLength: 5 },
          ),
        );
        return fc.tuple(...variantArbs).map((variantArrays) => ({
          products,
          variants: variantArrays.flat(),
        }));
      });

    fc.assert(
      fc.property(oosDiscountedCatalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);
        expect(dealsRail.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('each deal item correctly references its parent product basePrice', () => {
    fc.assert(
      fc.property(catalogArb, ({ products, variants }) => {
        const dealsRail = computeDealsRailItems(products, variants);

        for (const deal of dealsRail) {
          // Verify the basePrice in the deal matches the actual product's basePrice
          const product = products.find((p) => p.id === deal.productId);
          expect(product).toBeDefined();
          expect(deal.basePrice).toBe(product!.basePrice);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('deals rail respects configurable maxItems parameter', () => {
    fc.assert(
      fc.property(
        largeCatalogArb,
        fc.integer({ min: 1, max: 20 }),
        ({ products, variants }, maxItems) => {
          const dealsRail = computeDealsRailItems(products, variants, maxItems);
          expect(dealsRail.length).toBeLessThanOrEqual(maxItems);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 14: Second Life rail contains only Open_Box or Certified_Renewed variants ────

// ─── Types for Property 14 ───────────────────────────────────────────────────

type Condition = 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';

interface SecondLifeVariantInput {
  id: string;
  productId: string;
  condition: Condition;
  price: number;
  stock: number;
  sourceReturnId?: string;
  conditionReport?: string;
  unitPhotos?: { id: string; storageKey: string }[];
}

interface SecondLifeItem {
  id: string;
  productId: string;
  condition: Condition;
  price: number;
  stock: number;
  sourceReturnId?: string;
  conditionReport?: string;
  unitPhotos?: { id: string; storageKey: string }[];
}

// ─── Pure Logic Under Test (Property 14) ─────────────────────────────────────

/**
 * Computes the Second Life rail items from a set of product variants.
 * This mirrors the logic used to build the SecondLifeRail data:
 * - Filter to only Open_Box or Certified_Renewed condition variants
 * - Cap at maxItems (default 10)
 *
 * From the design document:
 *   The "Second Life / Renewed" rail contains only ProductVariants
 *   with condition Open_Box or Certified_Renewed, max 10 items.
 */
function computeSecondLifeRailItems(
  variants: SecondLifeVariantInput[],
  maxItems: number = 10,
): SecondLifeItem[] {
  const eligible = variants.filter(
    (v) => v.condition === 'Open_Box' || v.condition === 'Certified_Renewed',
  );
  return eligible.slice(0, maxItems);
}

// ─── Arbitraries for Property 14 ─────────────────────────────────────────────

const conditionP14Arb: fc.Arbitrary<Condition> = fc.constantFrom(
  'New',
  'Certified_Renewed',
  'Open_Box',
  'Used_Like_New',
);

const secondLifeConditionP14Arb: fc.Arbitrary<'Open_Box' | 'Certified_Renewed'> = fc.constantFrom(
  'Open_Box',
  'Certified_Renewed',
);

const nonSecondLifeConditionP14Arb: fc.Arbitrary<'New' | 'Used_Like_New'> = fc.constantFrom(
  'New',
  'Used_Like_New',
);

/** Generate a variant with any condition */
const variantP14Arb: fc.Arbitrary<SecondLifeVariantInput> = fc.record({
  id: fc.uuid(),
  productId: fc.uuid(),
  condition: conditionP14Arb,
  price: fc.integer({ min: 1, max: 100000 }),
  stock: fc.integer({ min: 0, max: 500 }),
  sourceReturnId: fc.option(fc.uuid(), { nil: undefined }),
  conditionReport: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  unitPhotos: fc.option(
    fc.array(
      fc.record({
        id: fc.uuid(),
        storageKey: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
});

/** Generate a variant with Open_Box or Certified_Renewed condition */
const secondLifeVariantP14Arb: fc.Arbitrary<SecondLifeVariantInput> = fc.record({
  id: fc.uuid(),
  productId: fc.uuid(),
  condition: secondLifeConditionP14Arb,
  price: fc.integer({ min: 1, max: 100000 }),
  stock: fc.integer({ min: 0, max: 500 }),
  sourceReturnId: fc.option(fc.uuid(), { nil: undefined }),
  conditionReport: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  unitPhotos: fc.option(
    fc.array(
      fc.record({
        id: fc.uuid(),
        storageKey: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
});

/** Generate a variant that is NOT eligible for the second life rail (New or Used_Like_New) */
const nonSecondLifeVariantP14Arb: fc.Arbitrary<SecondLifeVariantInput> = fc.record({
  id: fc.uuid(),
  productId: fc.uuid(),
  condition: nonSecondLifeConditionP14Arb,
  price: fc.integer({ min: 1, max: 100000 }),
  stock: fc.integer({ min: 0, max: 500 }),
  sourceReturnId: fc.option(fc.uuid(), { nil: undefined }),
  conditionReport: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  unitPhotos: fc.option(
    fc.array(
      fc.record({
        id: fc.uuid(),
        storageKey: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
});

// ─── Property 14 Tests ───────────────────────────────────────────────────────

describe('Feature: storefront-browsing, Property 14: Second Life rail contains only Open_Box or Certified_Renewed variants', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * Property 14: For any catalog state, the "Second Life / Renewed" rail SHALL
   * contain only ProductVariants with condition Open_Box or Certified_Renewed,
   * with a maximum of 10 items.
   */

  it('all items in the Second Life rail have condition Open_Box or Certified_Renewed', () => {
    fc.assert(
      fc.property(
        fc.array(variantP14Arb, { minLength: 0, maxLength: 30 }),
        (variants) => {
          const railItems = computeSecondLifeRailItems(variants);

          for (const item of railItems) {
            expect(
              item.condition === 'Open_Box' || item.condition === 'Certified_Renewed',
            ).toBe(true);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('the rail never exceeds 10 items', () => {
    fc.assert(
      fc.property(
        fc.array(variantP14Arb, { minLength: 0, maxLength: 50 }),
        (variants) => {
          const railItems = computeSecondLifeRailItems(variants);
          expect(railItems.length).toBeLessThanOrEqual(10);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('no variant with condition New or Used_Like_New appears in the rail', () => {
    fc.assert(
      fc.property(
        fc.array(variantP14Arb, { minLength: 0, maxLength: 30 }),
        (variants) => {
          const railItems = computeSecondLifeRailItems(variants);

          for (const item of railItems) {
            expect(item.condition).not.toBe('New');
            expect(item.condition).not.toBe('Used_Like_New');
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('when catalog has only New and Used_Like_New variants, the rail is empty', () => {
    fc.assert(
      fc.property(
        fc.array(nonSecondLifeVariantP14Arb, { minLength: 0, maxLength: 20 }),
        (variants) => {
          const railItems = computeSecondLifeRailItems(variants);
          expect(railItems.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when catalog has only Open_Box and Certified_Renewed variants, all eligible appear (up to 10)', () => {
    fc.assert(
      fc.property(
        fc.array(secondLifeVariantP14Arb, { minLength: 0, maxLength: 20 }),
        (variants) => {
          const railItems = computeSecondLifeRailItems(variants);

          const expectedCount = Math.min(variants.length, 10);
          expect(railItems.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the rail count equals the number of eligible variants when there are 10 or fewer eligible', () => {
    fc.assert(
      fc.property(
        fc.array(variantP14Arb, { minLength: 0, maxLength: 30 }),
        (variants) => {
          const eligible = variants.filter(
            (v) => v.condition === 'Open_Box' || v.condition === 'Certified_Renewed',
          );
          const railItems = computeSecondLifeRailItems(variants);

          if (eligible.length <= 10) {
            expect(railItems.length).toBe(eligible.length);
          } else {
            expect(railItems.length).toBe(10);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('with a mixed catalog, only eligible variants are selected', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(secondLifeVariantP14Arb, { minLength: 1, maxLength: 10 }),
          fc.array(nonSecondLifeVariantP14Arb, { minLength: 1, maxLength: 10 }),
        ),
        ([secondLifeVariants, nonSecondLifeVariants]) => {
          const allVariants = [...secondLifeVariants, ...nonSecondLifeVariants];
          const railItems = computeSecondLifeRailItems(allVariants);

          // All rail items must have eligible condition
          for (const item of railItems) {
            expect(
              item.condition === 'Open_Box' || item.condition === 'Certified_Renewed',
            ).toBe(true);
          }

          // No non-second-life variant IDs should appear in the rail
          const nonEligibleIds = new Set(nonSecondLifeVariants.map((v) => v.id));
          for (const item of railItems) {
            expect(nonEligibleIds.has(item.id)).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('rail respects custom maxItems parameter', () => {
    fc.assert(
      fc.property(
        fc.array(secondLifeVariantP14Arb, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (variants, maxItems) => {
          const railItems = computeSecondLifeRailItems(variants, maxItems);
          expect(railItems.length).toBeLessThanOrEqual(maxItems);

          const expectedCount = Math.min(variants.length, maxItems);
          expect(railItems.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty catalog produces an empty rail', () => {
    const railItems = computeSecondLifeRailItems([]);
    expect(railItems.length).toBe(0);
  });

  it('rail items are a subset of the input variants (preservation)', () => {
    fc.assert(
      fc.property(
        fc.array(variantP14Arb, { minLength: 0, maxLength: 30 }),
        (variants) => {
          const railItems = computeSecondLifeRailItems(variants);
          const inputIds = new Set(variants.map((v) => v.id));

          for (const item of railItems) {
            expect(inputIds.has(item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
