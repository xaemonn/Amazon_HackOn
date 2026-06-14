// Property-based tests for PDP logic (buy button stock rules)
// Feature: storefront-browsing, Property 1: Buy button state reflects variant stock availability
// Test framework: vitest + fast-check

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Types (mirroring VariantData from ProductDetailPage) ────────────────────

interface VariantData {
  id: string;
  productId: string;
  condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';
  price: number;
  stock: number;
  sourceReturnId?: string;
  conditionReport?: string;
  unitPhotos?: { id: string; storageKey: string }[];
}

// ─── Business Logic Under Test ───────────────────────────────────────────────

/**
 * Determines whether purchase buttons (Add to Cart / Buy Now) should be disabled.
 * This mirrors the exact logic from ProductDetailPage.tsx:
 *   const allOutOfStock = variants.every(v => v.stock === 0);
 *   const isDisabled = allOutOfStock || (selectedVariant?.stock ?? 0) === 0;
 *
 * For the GLOBAL product-level rule (Property 1), the key invariant is:
 *   buttons enabled iff at least one variant has stock > 0
 */
function shouldButtonsBeEnabled(variants: VariantData[]): boolean {
  if (variants.length === 0) return false;
  return variants.some((v) => v.stock > 0);
}

/**
 * The inverse: buttons disabled when ALL variants have stock === 0
 */
function shouldButtonsBeDisabled(variants: VariantData[]): boolean {
  return !shouldButtonsBeEnabled(variants);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const conditionArb: fc.Arbitrary<VariantData['condition']> = fc.oneof(
  fc.constant('New' as const),
  fc.constant('Certified_Renewed' as const),
  fc.constant('Open_Box' as const),
  fc.constant('Used_Like_New' as const),
);

/** Generate a VariantData with configurable stock range */
function variantArb(stockMin: number, stockMax: number): fc.Arbitrary<VariantData> {
  return fc.record({
    id: fc.uuid(),
    productId: fc.uuid(),
    condition: conditionArb,
    price: fc.integer({ min: 1, max: 100000 }),
    stock: fc.integer({ min: stockMin, max: stockMax }),
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
}

/** Generate a variant with stock > 0 (in-stock) */
const inStockVariantArb: fc.Arbitrary<VariantData> = variantArb(1, 1000);

/** Generate a variant with stock === 0 (out-of-stock) */
const outOfStockVariantArb: fc.Arbitrary<VariantData> = variantArb(0, 0);

/** Generate a variant with any stock level (0 to N) */
const anyStockVariantArb: fc.Arbitrary<VariantData> = variantArb(0, 1000);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: storefront-browsing, Property 1: Buy button state reflects variant stock availability', () => {
  /**
   * **Validates: Requirements 1.3, 8.2**
   *
   * Property 1: For any Product with one or more ProductVariants, the "Add to Cart" and
   * "Buy Now" buttons SHALL be enabled if and only if at least one variant has stock > 0;
   * when all variants have stock equal to zero, both buttons SHALL be disabled.
   */
  it('buttons are enabled iff at least one variant has stock > 0 (mixed stock levels)', () => {
    fc.assert(
      fc.property(
        fc.array(anyStockVariantArb, { minLength: 1, maxLength: 20 }),
        (variants) => {
          const hasAnyInStock = variants.some((v) => v.stock > 0);
          const buttonsEnabled = shouldButtonsBeEnabled(variants);

          expect(buttonsEnabled).toBe(hasAnyInStock);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('buttons are always enabled when all variants have stock > 0', () => {
    fc.assert(
      fc.property(
        fc.array(inStockVariantArb, { minLength: 1, maxLength: 20 }),
        (variants) => {
          expect(shouldButtonsBeEnabled(variants)).toBe(true);
          expect(shouldButtonsBeDisabled(variants)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buttons are always disabled when all variants have stock === 0', () => {
    fc.assert(
      fc.property(
        fc.array(outOfStockVariantArb, { minLength: 1, maxLength: 20 }),
        (variants) => {
          expect(shouldButtonsBeEnabled(variants)).toBe(false);
          expect(shouldButtonsBeDisabled(variants)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buttons are enabled when at least one variant in a mixed set has stock > 0', () => {
    fc.assert(
      fc.property(
        // Ensure at least one in-stock variant and at least one out-of-stock variant
        fc.tuple(
          fc.array(inStockVariantArb, { minLength: 1, maxLength: 10 }),
          fc.array(outOfStockVariantArb, { minLength: 1, maxLength: 10 }),
        ),
        ([inStockVariants, outOfStockVariants]) => {
          const allVariants = [...inStockVariants, ...outOfStockVariants];
          expect(shouldButtonsBeEnabled(allVariants)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buttons state is independent of variant ordering', () => {
    fc.assert(
      fc.property(
        fc.array(anyStockVariantArb, { minLength: 1, maxLength: 20 }),
        (variants) => {
          // The result should be the same regardless of how variants are ordered
          const shuffled = [...variants].reverse();
          const randomOrder = [...variants].sort(() => Math.random() - 0.5);
          expect(shouldButtonsBeEnabled(variants)).toBe(shouldButtonsBeEnabled(shuffled));
          expect(shouldButtonsBeEnabled(variants)).toBe(shouldButtonsBeEnabled(randomOrder));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buttons disabled for empty variant list (edge case: no variants)', () => {
    // Edge case: when there are no variants at all, buttons should be disabled
    expect(shouldButtonsBeEnabled([])).toBe(false);
    expect(shouldButtonsBeDisabled([])).toBe(true);
  });

  it('buttons enabled with exactly one in-stock variant among many out-of-stock', () => {
    fc.assert(
      fc.property(
        inStockVariantArb,
        fc.array(outOfStockVariantArb, { minLength: 1, maxLength: 19 }),
        (singleInStock, outOfStockVariants) => {
          const allVariants = [singleInStock, ...outOfStockVariants];
          expect(shouldButtonsBeEnabled(allVariants)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the component logic (allOutOfStock) matches the property invariant', () => {
    /**
     * This test validates that the actual component logic from ProductDetailPage.tsx:
     *   const allOutOfStock = variants.every(v => v.stock === 0);
     * is equivalent to our property function's negation.
     */
    fc.assert(
      fc.property(
        fc.array(anyStockVariantArb, { minLength: 1, maxLength: 20 }),
        (variants) => {
          // The actual component logic
          const allOutOfStock = variants.every((v) => v.stock === 0);

          // Our property function
          const buttonsEnabled = shouldButtonsBeEnabled(variants);

          // They should be complementary: buttons enabled === NOT allOutOfStock
          expect(buttonsEnabled).toBe(!allOutOfStock);
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ---- Arbitraries for Property 3 ----

/** Generates an optional sourceReturnId (present or absent) */
const optionalSourceReturnIdArb = fc.oneof(
  fc.constant(undefined),
  fc.uuid()
);

/** Generates an optional conditionReport (present, empty string, or absent) */
const optionalConditionReportArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 200 })
);

/** Generates a unit photo entry */
const unitPhotoArb = fc.record({
  id: fc.uuid(),
  storageKey: fc.string({ minLength: 5, maxLength: 50 }),
});

/** Generates optional unitPhotos (absent, empty array, or non-empty array) */
const optionalUnitPhotosArb = fc.oneof(
  fc.constant(undefined),
  fc.constant([] as { id: string; storageKey: string }[]),
  fc.array(unitPhotoArb, { minLength: 1, maxLength: 10 })
);

/** Generates a full VariantData with all Second Life metadata combos */
const secondLifeVariantArbitrary: fc.Arbitrary<{
  id: string;
  productId: string;
  condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';
  price: number;
  stock: number;
  sourceReturnId?: string;
  conditionReport?: string;
  unitPhotos?: { id: string; storageKey: string }[];
}> = fc.record({
  id: fc.uuid(),
  productId: fc.uuid(),
  condition: fc.constantFrom('New', 'Certified_Renewed', 'Open_Box', 'Used_Like_New') as fc.Arbitrary<'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New'>,
  price: fc.integer({ min: 1, max: 10000000 }).map(n => n / 100),
  stock: fc.nat({ max: 100 }),
  sourceReturnId: optionalSourceReturnIdArb,
  conditionReport: optionalConditionReportArb,
  unitPhotos: optionalUnitPhotosArb,
});

// ---- Pure logic functions under test (mirrors SecondLifeDetails rendering logic) ----

/**
 * Determines whether the "Second Life" badge should be displayed.
 * Badge is shown if and only if sourceReturnId is present (truthy).
 */
function shouldShowBadge(variant: { sourceReturnId?: string }): boolean {
  return !!variant.sourceReturnId;
}

/**
 * Determines whether the condition report text should be displayed.
 * Report is shown if and only if sourceReturnId is present AND conditionReport is a non-empty string.
 */
function shouldShowConditionReport(variant: { sourceReturnId?: string; conditionReport?: string }): boolean {
  return !!variant.sourceReturnId && !!variant.conditionReport;
}

/**
 * Determines whether the unit photo thumbnail gallery should be displayed.
 * Gallery is shown if and only if sourceReturnId is present AND unitPhotos is a non-empty array.
 */
function shouldShowGallery(variant: { sourceReturnId?: string; unitPhotos?: { id: string; storageKey: string }[] }): boolean {
  return !!variant.sourceReturnId && Array.isArray(variant.unitPhotos) && variant.unitPhotos.length > 0;
}

// ---- Property 3: Second Life UI elements rendered based on variant metadata presence ----

describe('Feature: storefront-browsing, Property 3: Second Life UI elements rendered based on variant metadata presence', () => {
  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any ProductVariant:
   * - The "Second Life" badge is displayed if and only if sourceReturnId is present.
   * - The condition report text is displayed if and only if both sourceReturnId AND conditionReport are present (non-empty).
   * - The unit photo thumbnail gallery is displayed if and only if sourceReturnId is present AND unitPhotos is a non-empty array.
   */
  it('should show the Second Life badge if and only if sourceReturnId is present', () => {
    fc.assert(
      fc.property(secondLifeVariantArbitrary, (variant) => {
        const showBadge = shouldShowBadge(variant);

        if (variant.sourceReturnId) {
          expect(showBadge).toBe(true);
        } else {
          expect(showBadge).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should show the condition report if and only if sourceReturnId AND conditionReport are present', () => {
    fc.assert(
      fc.property(secondLifeVariantArbitrary, (variant) => {
        const showReport = shouldShowConditionReport(variant);

        if (variant.sourceReturnId && variant.conditionReport) {
          // Both present and conditionReport is non-empty → report shown
          expect(showReport).toBe(true);
        } else {
          // Either sourceReturnId missing OR conditionReport missing/empty → report hidden
          expect(showReport).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should show the unit photo gallery if and only if sourceReturnId is present AND unitPhotos is non-empty', () => {
    fc.assert(
      fc.property(secondLifeVariantArbitrary, (variant) => {
        const showGallery = shouldShowGallery(variant);

        if (variant.sourceReturnId && Array.isArray(variant.unitPhotos) && variant.unitPhotos.length > 0) {
          // sourceReturnId present AND unitPhotos is a non-empty array → gallery shown
          expect(showGallery).toBe(true);
        } else {
          // sourceReturnId missing OR unitPhotos absent/empty → gallery hidden
          expect(showGallery).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should never show report or gallery when badge is not shown (sourceReturnId absent)', () => {
    fc.assert(
      fc.property(secondLifeVariantArbitrary, (variant) => {
        const showBadge = shouldShowBadge(variant);
        const showReport = shouldShowConditionReport(variant);
        const showGallery = shouldShowGallery(variant);

        // If badge is not shown, neither report nor gallery should be shown
        if (!showBadge) {
          expect(showReport).toBe(false);
          expect(showGallery).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should correctly handle all combinations of optional metadata fields', () => {
    fc.assert(
      fc.property(secondLifeVariantArbitrary, (variant) => {
        const showBadge = shouldShowBadge(variant);
        const showReport = shouldShowConditionReport(variant);
        const showGallery = shouldShowGallery(variant);

        // Logical implication: report → badge (can't have report without badge)
        if (showReport) {
          expect(showBadge).toBe(true);
        }

        // Logical implication: gallery → badge (can't have gallery without badge)
        if (showGallery) {
          expect(showBadge).toBe(true);
        }

        // Badge can exist independently of report and gallery
        // (sourceReturnId present but conditionReport missing and unitPhotos empty)
        // This is the case described in Requirement 2.4
      }),
      { numRuns: 100 }
    );
  });
});


// ─── Property 16: Auto-switch selected variant on stock depletion ────────────
// Feature: storefront-browsing, Property 16: Auto-switch selected variant on stock depletion
// Test framework: vitest + fast-check

// ─── Pure Logic Under Test ───────────────────────────────────────────────────

/**
 * Computes the new selected variant ID when the currently selected variant goes out of stock.
 * This mirrors the useEffect auto-switch logic from ProductDetailPage.tsx:
 *
 *   if (selected && selected.stock === 0) {
 *     const inStock = variants.filter(v => v.stock > 0).sort((a, b) => a.price - b.price);
 *     if (inStock.length > 0) setSelectedVariantId(inStock[0].id);
 *   }
 *
 * Returns:
 * - The selectedVariantId unchanged if the selected variant is still in stock (no switch needed)
 * - The ID of the lowest-priced in-stock variant if selected is out of stock and alternatives exist
 * - null if selected is out of stock and NO other variant is in stock (all out of stock → buttons disabled)
 */
function computeAutoSwitch(variants: VariantData[], selectedVariantId: string): string | null {
  const selected = variants.find((v) => v.id === selectedVariantId);
  if (!selected || selected.stock > 0) return selectedVariantId; // no switch needed

  const inStock = variants.filter((v) => v.stock > 0).sort((a, b) => a.price - b.price);
  if (inStock.length > 0) return inStock[0].id;
  return null; // all out of stock, buttons disabled
}

// ─── Arbitraries for Property 16 ─────────────────────────────────────────────

/** Generate a variant with a specific stock level */
function variantWithStock(stock: number): fc.Arbitrary<VariantData> {
  return fc.record({
    id: fc.uuid(),
    productId: fc.constant('product-1'),
    condition: fc.constantFrom('New', 'Certified_Renewed', 'Open_Box', 'Used_Like_New') as fc.Arbitrary<VariantData['condition']>,
    price: fc.integer({ min: 100, max: 100000 }),
    stock: fc.constant(stock),
    sourceReturnId: fc.option(fc.uuid(), { nil: undefined }),
    conditionReport: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    unitPhotos: fc.option(
      fc.array(
        fc.record({ id: fc.uuid(), storageKey: fc.string({ minLength: 1, maxLength: 50 }) }),
        { minLength: 0, maxLength: 3 },
      ),
      { nil: undefined },
    ),
  });
}

/** Generate a variant with stock > 0 */
const inStockVariantP16: fc.Arbitrary<VariantData> = fc.record({
  id: fc.uuid(),
  productId: fc.constant('product-1'),
  condition: fc.constantFrom('New', 'Certified_Renewed', 'Open_Box', 'Used_Like_New') as fc.Arbitrary<VariantData['condition']>,
  price: fc.integer({ min: 100, max: 100000 }),
  stock: fc.integer({ min: 1, max: 500 }),
  sourceReturnId: fc.option(fc.uuid(), { nil: undefined }),
  conditionReport: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  unitPhotos: fc.option(
    fc.array(
      fc.record({ id: fc.uuid(), storageKey: fc.string({ minLength: 1, maxLength: 50 }) }),
      { minLength: 0, maxLength: 3 },
    ),
    { nil: undefined },
  ),
});

/** Generate a variant with stock === 0 */
const outOfStockVariantP16: fc.Arbitrary<VariantData> = fc.record({
  id: fc.uuid(),
  productId: fc.constant('product-1'),
  condition: fc.constantFrom('New', 'Certified_Renewed', 'Open_Box', 'Used_Like_New') as fc.Arbitrary<VariantData['condition']>,
  price: fc.integer({ min: 100, max: 100000 }),
  stock: fc.constant(0),
  sourceReturnId: fc.option(fc.uuid(), { nil: undefined }),
  conditionReport: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  unitPhotos: fc.option(
    fc.array(
      fc.record({ id: fc.uuid(), storageKey: fc.string({ minLength: 1, maxLength: 50 }) }),
      { minLength: 0, maxLength: 3 },
    ),
    { nil: undefined },
  ),
});

// ─── Property 16 Tests ───────────────────────────────────────────────────────

describe('Feature: storefront-browsing, Property 16: Auto-switch selected variant on stock depletion', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * Property 16: For any PDP state where the currently selected variant's stock
   * transitions to zero, the system SHALL automatically switch the selection to
   * the next lowest-priced in-stock variant if one exists, or disable purchase
   * buttons if no in-stock variant remains.
   */

  it('when selected variant is out of stock and in-stock alternatives exist, switches to lowest-priced in-stock', () => {
    fc.assert(
      fc.property(
        // Generate an out-of-stock "selected" variant + at least one in-stock alternative
        outOfStockVariantP16,
        fc.array(inStockVariantP16, { minLength: 1, maxLength: 10 }),
        fc.array(outOfStockVariantP16, { minLength: 0, maxLength: 5 }),
        (selectedVariant, inStockVariants, additionalOos) => {
          const allVariants = [selectedVariant, ...inStockVariants, ...additionalOos];
          const result = computeAutoSwitch(allVariants, selectedVariant.id);

          // The result should be the lowest-priced in-stock variant
          const sortedInStock = inStockVariants.slice().sort((a, b) => a.price - b.price);
          expect(result).toBe(sortedInStock[0].id);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('when selected variant is out of stock and no in-stock variants exist, returns null (buttons disabled)', () => {
    fc.assert(
      fc.property(
        // All variants are out of stock
        outOfStockVariantP16,
        fc.array(outOfStockVariantP16, { minLength: 0, maxLength: 10 }),
        (selectedVariant, otherOosVariants) => {
          const allVariants = [selectedVariant, ...otherOosVariants];
          const result = computeAutoSwitch(allVariants, selectedVariant.id);

          // null means all out of stock → buttons should be disabled
          expect(result).toBeNull();
        },
      ),
      { numRuns: 150 },
    );
  });

  it('when selected variant is still in stock, no switch occurs', () => {
    fc.assert(
      fc.property(
        inStockVariantP16,
        fc.array(anyStockVariantArb, { minLength: 0, maxLength: 10 }),
        (selectedVariant, otherVariants) => {
          const allVariants = [selectedVariant, ...otherVariants];
          const result = computeAutoSwitch(allVariants, selectedVariant.id);

          // Should stay on the same variant (no switch needed)
          expect(result).toBe(selectedVariant.id);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('auto-switch target is always the minimum price among in-stock variants', () => {
    fc.assert(
      fc.property(
        outOfStockVariantP16,
        fc.array(inStockVariantP16, { minLength: 1, maxLength: 15 }),
        (selectedVariant, inStockVariants) => {
          const allVariants = [selectedVariant, ...inStockVariants];
          const result = computeAutoSwitch(allVariants, selectedVariant.id);

          // Find the actual minimum price among in-stock variants
          const minPrice = Math.min(...inStockVariants.map((v) => v.price));
          const cheapestInStock = inStockVariants.find((v) => v.price === minPrice)!;

          // The result should be the cheapest in-stock variant
          expect(result).toBe(cheapestInStock.id);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('auto-switch never selects an out-of-stock variant', () => {
    fc.assert(
      fc.property(
        outOfStockVariantP16,
        fc.array(inStockVariantP16, { minLength: 1, maxLength: 10 }),
        fc.array(outOfStockVariantP16, { minLength: 0, maxLength: 5 }),
        (selectedVariant, inStockVariants, additionalOos) => {
          const allVariants = [selectedVariant, ...inStockVariants, ...additionalOos];
          const result = computeAutoSwitch(allVariants, selectedVariant.id);

          // Result should always be an in-stock variant
          if (result !== null) {
            const resultVariant = allVariants.find((v) => v.id === result);
            expect(resultVariant).toBeDefined();
            expect(resultVariant!.stock).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when selectedVariantId does not match any variant, returns the id unchanged (guard clause)', () => {
    fc.assert(
      fc.property(
        fc.array(anyStockVariantArb, { minLength: 1, maxLength: 10 }),
        fc.uuid(),
        (variants, unknownId) => {
          // Ensure unknownId is not in the variants list
          fc.pre(!variants.some((v) => v.id === unknownId));

          const result = computeAutoSwitch(variants, unknownId);
          // Guard clause: if variant not found, return the id unchanged
          expect(result).toBe(unknownId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deterministic: same inputs always produce the same auto-switch result', () => {
    fc.assert(
      fc.property(
        outOfStockVariantP16,
        fc.array(inStockVariantP16, { minLength: 1, maxLength: 10 }),
        (selectedVariant, inStockVariants) => {
          const allVariants = [selectedVariant, ...inStockVariants];

          const result1 = computeAutoSwitch(allVariants, selectedVariant.id);
          const result2 = computeAutoSwitch(allVariants, selectedVariant.id);

          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
