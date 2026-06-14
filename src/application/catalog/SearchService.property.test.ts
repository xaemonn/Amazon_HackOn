// Property-based tests for SearchService
// Feature: storefront-browsing
// Test framework: vitest + fast-check

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SearchService } from './SearchService.js';
import { InMemoryProductRepository } from '../../infrastructure/catalog/InMemoryProductRepository.js';
import { InMemoryVariantRepository } from '../../infrastructure/catalog/InMemoryVariantRepository.js';
import { Product } from '../../domain/catalog/Product.js';
import { ProductVariant, type Condition } from '../../domain/catalog/ProductVariant.js';
import { Category } from '../../domain/catalog/Category.js';
import { DEFAULT_CATALOG_CONFIG } from './CatalogConfig.js';
import type { SearchFilters } from './SearchService.js';

const ALL_CONDITIONS: Condition[] = ['New', 'Certified_Renewed', 'Open_Box', 'Used_Like_New'];

// --- Generators ---

const conditionArb = fc.constantFrom<Condition>(...ALL_CONDITIONS);

const brandArb = fc.constantFrom('Nike', 'Adidas', 'Samsung', 'Apple', 'Sony', 'LG', 'Puma', 'Reebok');

const productArb = (id: string, categoryId: string) =>
  fc.record({
    title: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/\s+/g, ' ').trim() || 'Product'),
    brand: brandArb,
    basePrice: fc.integer({ min: 100, max: 50000 }),
  }).map(({ title, brand, basePrice }) =>
    new Product({
      id,
      title,
      brand,
      catalogImageUrl: `/assets/products/${id}.jpg`,
      category: categoryId,
      basePrice,
    })
  );

const variantArb = (variantId: string, productId: string) =>
  fc.record({
    condition: conditionArb,
    price: fc.integer({ min: 50, max: 50000 }),
    stock: fc.integer({ min: 0, max: 100 }),
  }).map(({ condition, price, stock }) =>
    new ProductVariant({
      id: variantId,
      productId,
      condition,
      price,
      stock,
    })
  );

// Generate a non-empty subset of conditions
const conditionsFilterArb = fc.subarray(ALL_CONDITIONS, { minLength: 1 });

// Generate a non-empty subset of brands
const brandsFilterArb = fc.subarray(
  ['Nike', 'Adidas', 'Samsung', 'Apple', 'Sony', 'LG', 'Puma', 'Reebok'],
  { minLength: 1 }
);

// Generate filter combinations (each field is optional)
const filtersArb = fc.record({
  priceMin: fc.option(fc.integer({ min: 50, max: 25000 }), { nil: undefined }),
  priceMax: fc.option(fc.integer({ min: 100, max: 50000 }), { nil: undefined }),
  brands: fc.option(brandsFilterArb, { nil: undefined }),
  minRating: fc.option(fc.double({ min: 1, max: 5, noNaN: true }), { nil: undefined }),
  conditions: fc.option(conditionsFilterArb, { nil: undefined }),
});

describe('SearchService Property Tests', () => {
  /**
   * Property 12: Search filters return only products satisfying all active criteria
   * **Validates: Requirements 4.6**
   *
   * For any set of active filters (price range, brands, minimum rating, conditions),
   * all products in the filtered results satisfy every active filter simultaneously.
   * No product violating any active filter appears in results, and no product
   * satisfying all filters is missing from results.
   */
  describe('Property 12: Search filters return only products satisfying all active criteria', () => {
    it('all returned products satisfy ALL active filters simultaneously', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 2-8 products with 1-3 variants each
          fc.integer({ min: 2, max: 8 }).chain(numProducts =>
            fc.tuple(
              fc.array(
                fc.integer({ min: 0, max: 999999 }).chain(seed =>
                  productArb(`prod-${seed}`, 'cat-1')
                ),
                { minLength: numProducts, maxLength: numProducts }
              ),
              fc.constant(numProducts)
            )
          ),
          filtersArb,
          async ([products, _numProducts], filters) => {
            // Setup repos
            const productRepo = new InMemoryProductRepository();
            const variantRepo = new InMemoryVariantRepository();

            // Ensure unique product IDs
            const uniqueProducts = new Map<string, Product>();
            for (let i = 0; i < products.length; i++) {
              const p = new Product({
                ...products[i].toProps(),
                id: `prod-${i}`,
              });
              uniqueProducts.set(p.id, p);
            }

            // Add products and generate variants
            const productVariantsMap = new Map<string, ProductVariant[]>();
            let variantIdx = 0;
            for (const product of uniqueProducts.values()) {
              productRepo.addProduct(product);
              // Each product gets 1-3 variants deterministically
              const numVariants = (variantIdx % 3) + 1;
              const variants: ProductVariant[] = [];
              for (let v = 0; v < numVariants; v++) {
                const variant = new ProductVariant({
                  id: `var-${variantIdx}-${v}`,
                  productId: product.id,
                  condition: ALL_CONDITIONS[v % ALL_CONDITIONS.length],
                  price: product.basePrice - (v * 50) > 0 ? product.basePrice - (v * 50) : product.basePrice,
                  stock: v === 0 ? 5 : (v % 2 === 0 ? 3 : 0), // Mix of in-stock and out-of-stock
                });
                variantRepo.addVariant(variant);
                variants.push(variant);
              }
              productVariantsMap.set(product.id, variants);
              variantIdx++;
            }

            // Add category mapping for search to work
            productRepo.addCategoryMapping('cat-1', 'General');

            const searchService = new SearchService(productRepo, variantRepo, DEFAULT_CATALOG_CONFIG);

            // Use a broad keyword that matches all products (search by category name)
            const result = await searchService.search('General', { filters });

            // Verify: every returned product satisfies ALL active filters
            for (const card of result.products) {
              // priceMin filter
              if (filters.priceMin !== undefined) {
                expect(card.lowestPrice).toBeGreaterThanOrEqual(filters.priceMin);
              }

              // priceMax filter
              if (filters.priceMax !== undefined) {
                expect(card.lowestPrice).toBeLessThanOrEqual(filters.priceMax);
              }

              // brands filter (case-insensitive)
              if (filters.brands !== undefined && filters.brands.length > 0) {
                const brandsLower = filters.brands.map(b => b.toLowerCase());
                expect(brandsLower).toContain(card.brand.toLowerCase());
              }

              // minRating filter
              if (filters.minRating !== undefined) {
                expect(card.averageRating).not.toBeNull();
                expect(card.averageRating!).toBeGreaterThanOrEqual(filters.minRating);
              }

              // conditions filter
              if (filters.conditions !== undefined && filters.conditions.length > 0) {
                const variants = productVariantsMap.get(card.id) ?? [];
                const conditionSet = new Set(filters.conditions);
                const hasMatchingCondition = variants.some(v => conditionSet.has(v.condition));
                expect(hasMatchingCondition).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no product satisfying all filters is missing from results', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 2-6 products
          fc.integer({ min: 2, max: 6 }).chain(numProducts =>
            fc.tuple(
              fc.array(
                fc.integer({ min: 0, max: 999999 }).chain(seed =>
                  productArb(`prod-${seed}`, 'cat-1')
                ),
                { minLength: numProducts, maxLength: numProducts }
              ),
              fc.constant(numProducts)
            )
          ),
          filtersArb,
          async ([products, _numProducts], filters) => {
            // Setup repos
            const productRepo = new InMemoryProductRepository();
            const variantRepo = new InMemoryVariantRepository();

            // Ensure unique product IDs
            const uniqueProducts: Product[] = [];
            for (let i = 0; i < products.length; i++) {
              const p = new Product({
                ...products[i].toProps(),
                id: `prod-${i}`,
              });
              uniqueProducts.push(p);
            }

            // Add products and generate variants
            const productVariantsMap = new Map<string, ProductVariant[]>();
            let variantIdx = 0;
            for (const product of uniqueProducts) {
              productRepo.addProduct(product);
              const numVariants = (variantIdx % 3) + 1;
              const variants: ProductVariant[] = [];
              for (let v = 0; v < numVariants; v++) {
                const variant = new ProductVariant({
                  id: `var-${variantIdx}-${v}`,
                  productId: product.id,
                  condition: ALL_CONDITIONS[v % ALL_CONDITIONS.length],
                  price: product.basePrice - (v * 50) > 0 ? product.basePrice - (v * 50) : product.basePrice,
                  stock: v === 0 ? 5 : (v % 2 === 0 ? 3 : 0),
                });
                variantRepo.addVariant(variant);
                variants.push(variant);
              }
              productVariantsMap.set(product.id, variants);
              variantIdx++;
            }

            productRepo.addCategoryMapping('cat-1', 'General');

            const searchService = new SearchService(productRepo, variantRepo, DEFAULT_CATALOG_CONFIG);

            // Get unfiltered results first (via category match)
            const unfilteredResult = await searchService.search('General', {
              pageSize: 100,
            });

            // Get filtered results
            const filteredResult = await searchService.search('General', {
              filters,
              pageSize: 100,
            });

            const returnedIds = new Set(filteredResult.products.map(p => p.id));

            // For each product that should pass all filters, verify it's in the results
            for (const card of unfilteredResult.products) {
              const variants = productVariantsMap.get(card.id) ?? [];

              // Check if this product satisfies all active filters
              let satisfiesAll = true;

              if (filters.priceMin !== undefined && card.lowestPrice < filters.priceMin) {
                satisfiesAll = false;
              }
              if (filters.priceMax !== undefined && card.lowestPrice > filters.priceMax) {
                satisfiesAll = false;
              }
              if (filters.brands !== undefined && filters.brands.length > 0) {
                const brandsLower = filters.brands.map(b => b.toLowerCase());
                if (!brandsLower.includes(card.brand.toLowerCase())) {
                  satisfiesAll = false;
                }
              }
              if (filters.minRating !== undefined) {
                if (card.averageRating === null || card.averageRating < filters.minRating) {
                  satisfiesAll = false;
                }
              }
              if (filters.conditions !== undefined && filters.conditions.length > 0) {
                const conditionSet = new Set(filters.conditions);
                const hasMatchingCondition = variants.some(v => conditionSet.has(v.condition));
                if (!hasMatchingCondition) {
                  satisfiesAll = false;
                }
              }

              if (satisfiesAll) {
                expect(returnedIds.has(card.id)).toBe(true);
              } else {
                expect(returnedIds.has(card.id)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ─── Property 10: Search returns matching products via case-insensitive substring ────

/**
 * Property 10: Search returns matching products via case-insensitive substring
 *
 * For any non-empty search keyword and any Product in the catalog, the Product
 * SHALL appear in search results if and only if the keyword is a case-insensitive
 * substring of the Product's title, brand, or category name.
 *
 * **Validates: Requirements 4.3, 4.8**
 */
describe('Property 10: Search returns matching products via case-insensitive substring', () => {
  /** Generate a non-empty string suitable for product fields */
  const arbFieldString = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => s.trim().length > 0);

  /** Generate a keyword (non-empty, trimmed, typically short) */
  const arbKeyword = fc.string({ minLength: 1, maxLength: 8 })
    .filter(s => s.trim().length > 0);

  it('a product appears in results iff keyword is a case-insensitive substring of title, brand, or category name', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-3 categories with distinct IDs and names
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: arbFieldString,
          }),
          { minLength: 1, maxLength: 3 }
        ),
        // Generate 2-6 products
        fc.array(
          fc.record({
            title: arbFieldString,
            brand: arbFieldString,
            basePrice: fc.integer({ min: 100, max: 10000 }),
          }),
          { minLength: 2, maxLength: 6 }
        ),
        // Generate a non-empty keyword
        arbKeyword,
        async (categories, productDefs, keyword) => {
          // Set up repos
          const productRepo = new InMemoryProductRepository();
          const variantRepo = new InMemoryVariantRepository();

          // Register categories
          for (const cat of categories) {
            productRepo.addCategoryMapping(cat.id, cat.name);
          }

          // Create products, each assigned a category round-robin
          const products: Product[] = [];
          for (let i = 0; i < productDefs.length; i++) {
            const cat = categories[i % categories.length];
            const product = new Product({
              id: `p10-${i}`,
              title: productDefs[i].title,
              brand: productDefs[i].brand,
              catalogImageUrl: `/assets/products/p10-${i}.jpg`,
              category: cat.id,
              basePrice: productDefs[i].basePrice,
            });
            products.push(product);
            productRepo.addProduct(product);

            // Each product needs at least one variant with stock > 0 to appear in results
            variantRepo.addVariant(
              new ProductVariant({
                id: `p10-${i}-v0`,
                productId: product.id,
                condition: 'New',
                price: product.basePrice,
                stock: 5,
              })
            );
          }

          // Execute search
          const searchService = new SearchService(productRepo, variantRepo, DEFAULT_CATALOG_CONFIG);
          const result = await searchService.search(keyword, { pageSize: 100 });

          // Determine which product IDs are in results
          const resultIds = new Set(result.products.map(p => p.id));

          // Verify each product: present in results iff keyword matches title, brand, or category name
          const lowerKeyword = keyword.toLowerCase();
          for (const product of products) {
            const cat = categories.find(c => c.id === product.category);
            const categoryName = cat?.name ?? '';

            const matchesTitle = product.title.toLowerCase().includes(lowerKeyword);
            const matchesBrand = product.brand.toLowerCase().includes(lowerKeyword);
            const matchesCategory = categoryName.toLowerCase().includes(lowerKeyword);

            const shouldMatch = matchesTitle || matchesBrand || matchesCategory;
            const didMatch = resultIds.has(product.id);

            expect(didMatch).toBe(shouldMatch);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Property 11: Search sort produces correctly ordered results ─────────────

/**
 * Property 11: Search sort produces correctly ordered results
 *
 * Generates random products with random prices and ratings, adds them to in-memory
 * repos with at least one variant per product, then searches with each sort option
 * and verifies the ordering property holds.
 *
 * - price_asc → non-decreasing order of lowestPrice
 * - price_desc → non-increasing order of lowestPrice
 * - rating_desc → non-increasing order of averageRating (null ratings go last)
 *
 * **Validates: Requirements 4.5**
 */

const SORT_KEYWORD = 'sortitem';

describe('Property 11: Search sort produces correctly ordered results', () => {
  /**
   * Arbitrary: generate a list of test products with random prices and stock.
   * All products share SORT_KEYWORD in the title so they match search.
   * Each product has 1-4 variants with random prices and stock levels.
   */
  const arbSortTestProducts: fc.Arbitrary<
    Array<{
      id: string;
      title: string;
      brand: string;
      basePrice: number;
      variants: Array<{ condition: Condition; price: number; stock: number }>;
    }>
  > = fc
    .integer({ min: 2, max: 15 })
    .chain((count) =>
      fc.tuple(
        ...Array.from({ length: count }, (_, idx) =>
          fc.record({
            id: fc.constant(`sort-prod-${idx}`),
            title: fc
              .string({ minLength: 1, maxLength: 10 })
              .map((s) => `${SORT_KEYWORD} sort${idx} ${s}`),
            brand: fc.string({ minLength: 1, maxLength: 10 }),
            basePrice: fc.integer({ min: 100, max: 10000 }),
            variants: fc.array(
              fc.record({
                condition: conditionArb,
                price: fc.integer({ min: 1, max: 10000 }),
                stock: fc.integer({ min: 0, max: 50 }),
              }),
              { minLength: 1, maxLength: 4 },
            ),
          }),
        ),
      ),
    );

  function setupSortRepos(testProducts: typeof arbSortTestProducts extends fc.Arbitrary<infer T> ? T : never) {
    const productRepo = new InMemoryProductRepository();
    const variantRepo = new InMemoryVariantRepository();
    productRepo.addCategoryMapping('cat-sort', 'SortTestCategory');

    for (const tp of testProducts) {
      const product = new Product({
        id: tp.id,
        title: tp.title,
        brand: tp.brand,
        catalogImageUrl: `/assets/products/${tp.id}.jpg`,
        category: 'cat-sort',
        basePrice: tp.basePrice,
      });
      productRepo.addProduct(product);

      for (let i = 0; i < tp.variants.length; i++) {
        const v = tp.variants[i];
        const variant = new ProductVariant({
          id: `${tp.id}-v${i}`,
          productId: tp.id,
          condition: v.condition,
          price: v.price,
          stock: v.stock,
        });
        variantRepo.addVariant(variant);
      }
    }

    return { productRepo, variantRepo };
  }

  it('price_asc sort produces non-decreasing order of lowestPrice', () => {
    fc.assert(
      fc.asyncProperty(arbSortTestProducts, async (testProducts) => {
        const { productRepo, variantRepo } = setupSortRepos(testProducts);
        const searchService = new SearchService(productRepo, variantRepo, DEFAULT_CATALOG_CONFIG);

        const result = await searchService.search(SORT_KEYWORD, {
          sort: 'price_asc',
          pageSize: 100,
        });

        // Verify non-decreasing order of lowestPrice
        for (let i = 1; i < result.products.length; i++) {
          expect(result.products[i].lowestPrice).toBeGreaterThanOrEqual(
            result.products[i - 1].lowestPrice,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('price_desc sort produces non-increasing order of lowestPrice', () => {
    fc.assert(
      fc.asyncProperty(arbSortTestProducts, async (testProducts) => {
        const { productRepo, variantRepo } = setupSortRepos(testProducts);
        const searchService = new SearchService(productRepo, variantRepo, DEFAULT_CATALOG_CONFIG);

        const result = await searchService.search(SORT_KEYWORD, {
          sort: 'price_desc',
          pageSize: 100,
        });

        // Verify non-increasing order of lowestPrice
        for (let i = 1; i < result.products.length; i++) {
          expect(result.products[i].lowestPrice).toBeLessThanOrEqual(
            result.products[i - 1].lowestPrice,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rating_desc sort produces non-increasing order of averageRating with nulls last', () => {
    fc.assert(
      fc.asyncProperty(arbSortTestProducts, async (testProducts) => {
        const { productRepo, variantRepo } = setupSortRepos(testProducts);
        const searchService = new SearchService(productRepo, variantRepo, DEFAULT_CATALOG_CONFIG);

        const result = await searchService.search(SORT_KEYWORD, {
          sort: 'rating_desc',
          pageSize: 100,
        });

        const products = result.products;

        // Find boundary between non-null and null ratings
        let nullStart = products.length;
        for (let i = 0; i < products.length; i++) {
          if (products[i].averageRating === null) {
            nullStart = i;
            break;
          }
        }

        // All items from nullStart onward should have null rating
        for (let i = nullStart; i < products.length; i++) {
          expect(products[i].averageRating).toBeNull();
        }

        // Items before nullStart should be in non-increasing order
        for (let i = 1; i < nullStart; i++) {
          expect(products[i].averageRating!).toBeLessThanOrEqual(
            products[i - 1].averageRating!,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Property 17: Out-of-stock products sorted after in-stock ─────────────────

/**
 * Property 17: Out-of-stock products sorted after in-stock in default relevance sort
 *
 * Generates random products with mixed stock levels; verifies that when searching
 * with the default relevance sort, all out-of-stock products (every variant has
 * stock = 0) appear after all in-stock products (at least one variant with stock > 0).
 *
 * **Validates: Requirements 8.4**
 */
describe('Property 17: Out-of-stock products sorted after in-stock in default relevance sort', () => {
  const COMMON_KEYWORD = 'gadget';

  /**
   * Generate a product with explicitly controlled stock for its variants.
   * isOutOfStock = true means ALL variants have stock = 0.
   */
  const arbProductWithStock = (index: number, forceOutOfStock?: boolean) => {
    const productId = `p17-prod-${index}`;
    return fc.record({
      brand: fc.constantFrom('BrandA', 'BrandB', 'BrandC', 'BrandD'),
      basePrice: fc.integer({ min: 100, max: 10000 }),
      variantCount: fc.integer({ min: 1, max: 4 }),
    }).chain(({ brand, basePrice, variantCount }) => {
      // Generate stock values: if forceOutOfStock all are 0, otherwise at least one > 0
      const stockArbs = Array.from({ length: variantCount }, () =>
        forceOutOfStock
          ? fc.constant(0)
          : fc.integer({ min: 0, max: 50 })
      );

      return fc.tuple(...stockArbs).map((stocks) => {
        // If not forced out of stock, ensure at least one variant has stock > 0
        if (!forceOutOfStock && stocks.every((s) => s === 0)) {
          stocks[0] = 1; // Force first variant to be in stock
        }
        return {
          id: productId,
          title: `${COMMON_KEYWORD} item ${index}`,
          brand,
          basePrice,
          variants: stocks.map((stock, vi) => ({
            id: `${productId}-v${vi}`,
            condition: ALL_CONDITIONS[vi % ALL_CONDITIONS.length],
            price: Math.max(50, basePrice - vi * 100),
            stock,
          })),
        };
      });
    });
  };

  /**
   * Generate a mixed list with guaranteed in-stock and out-of-stock products.
   */
  const arbMixedProductList = fc
    .record({
      inStockCount: fc.integer({ min: 1, max: 8 }),
      outOfStockCount: fc.integer({ min: 1, max: 8 }),
    })
    .chain(({ inStockCount, outOfStockCount }) => {
      const inStockArbs = Array.from({ length: inStockCount }, (_, i) =>
        arbProductWithStock(i, false)
      );
      const outOfStockArbs = Array.from({ length: outOfStockCount }, (_, i) =>
        arbProductWithStock(inStockCount + i, true)
      );
      return fc.tuple(...inStockArbs, ...outOfStockArbs).map((all) =>
        // Shuffle the products so insertion order is random
        [...all].sort(() => Math.random() - 0.5)
      );
    });

  it('all out-of-stock products appear after all in-stock products in relevance sort', async () => {
    await fc.assert(
      fc.asyncProperty(arbMixedProductList, async (productDefs) => {
        const productRepo = new InMemoryProductRepository();
        const variantRepo = new InMemoryVariantRepository();

        // Populate repositories
        for (const def of productDefs) {
          const product = new Product({
            id: def.id,
            title: def.title,
            brand: def.brand,
            catalogImageUrl: `/assets/products/${def.id}.jpg`,
            category: 'cat-17',
            basePrice: def.basePrice,
          });
          productRepo.addProduct(product);

          for (const varDef of def.variants) {
            const variant = new ProductVariant({
              id: varDef.id,
              productId: def.id,
              condition: varDef.condition,
              price: varDef.price,
              stock: varDef.stock,
            });
            variantRepo.addVariant(variant);
          }
        }

        productRepo.addCategoryMapping('cat-17', 'TestCategory');

        const searchService = new SearchService(
          productRepo,
          variantRepo,
          DEFAULT_CATALOG_CONFIG
        );

        // Search with default sort (relevance)
        const result = await searchService.search(COMMON_KEYWORD, { pageSize: 50 });

        // Property: no in-stock product appears after an out-of-stock product
        let seenOutOfStock = false;
        for (const card of result.products) {
          if (seenOutOfStock && !card.isOutOfStock) {
            expect.fail(
              `In-stock product "${card.title}" (id: ${card.id}) appeared after an out-of-stock product in relevance sort`
            );
          }
          if (card.isOutOfStock) {
            seenOutOfStock = true;
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('for every pair (i, j) where i < j, if results[j] is in-stock then results[i] must also be in-stock', async () => {
    await fc.assert(
      fc.asyncProperty(arbMixedProductList, async (productDefs) => {
        const productRepo = new InMemoryProductRepository();
        const variantRepo = new InMemoryVariantRepository();

        for (const def of productDefs) {
          const product = new Product({
            id: def.id,
            title: def.title,
            brand: def.brand,
            catalogImageUrl: `/assets/products/${def.id}.jpg`,
            category: 'cat-17',
            basePrice: def.basePrice,
          });
          productRepo.addProduct(product);

          for (const varDef of def.variants) {
            const variant = new ProductVariant({
              id: varDef.id,
              productId: def.id,
              condition: varDef.condition,
              price: varDef.price,
              stock: varDef.stock,
            });
            variantRepo.addVariant(variant);
          }
        }

        productRepo.addCategoryMapping('cat-17', 'TestCategory');

        const searchService = new SearchService(
          productRepo,
          variantRepo,
          DEFAULT_CATALOG_CONFIG
        );

        const result = await searchService.search(COMMON_KEYWORD, { pageSize: 50 });
        const results = result.products;

        // Pairwise check: for every pair (i, j) where i < j,
        // if results[j] is in-stock then results[i] must also be in-stock
        for (let j = 1; j < results.length; j++) {
          if (!results[j].isOutOfStock) {
            for (let i = 0; i < j; i++) {
              expect(results[i].isOutOfStock).toBe(false);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('in-stock and out-of-stock groups concatenated equal the full results (stable partition)', async () => {
    await fc.assert(
      fc.asyncProperty(arbMixedProductList, async (productDefs) => {
        const productRepo = new InMemoryProductRepository();
        const variantRepo = new InMemoryVariantRepository();

        for (const def of productDefs) {
          const product = new Product({
            id: def.id,
            title: def.title,
            brand: def.brand,
            catalogImageUrl: `/assets/products/${def.id}.jpg`,
            category: 'cat-17',
            basePrice: def.basePrice,
          });
          productRepo.addProduct(product);

          for (const varDef of def.variants) {
            const variant = new ProductVariant({
              id: varDef.id,
              productId: def.id,
              condition: varDef.condition,
              price: varDef.price,
              stock: varDef.stock,
            });
            variantRepo.addVariant(variant);
          }
        }

        productRepo.addCategoryMapping('cat-17', 'TestCategory');

        const searchService = new SearchService(
          productRepo,
          variantRepo,
          DEFAULT_CATALOG_CONFIG
        );

        const result = await searchService.search(COMMON_KEYWORD, { pageSize: 50 });
        const results = result.products;

        // Extract the two groups
        const inStockResults = results.filter((r) => !r.isOutOfStock);
        const outOfStockResults = results.filter((r) => r.isOutOfStock);

        // Together they should form the full result set in order (stable partition)
        const combined = [...inStockResults, ...outOfStockResults];
        expect(combined.map((r) => r.id)).toEqual(results.map((r) => r.id));
      }),
      { numRuns: 100 },
    );
  });
});
