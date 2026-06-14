# Implementation Plan: Storefront Browsing

## Overview

This plan implements the Storefront Browsing module following the layered architecture (Domain → Infrastructure → Application → Presentation). Tasks are ordered for incremental buildability: domain entities and interfaces first, then in-memory repository implementations, then application services (CatalogService facade, SearchService, ListingRequestedHandler), then seed data loading, then React presentation components, and finally property-based tests validating the 17 correctness properties from the design document.

## Tasks

- [x] 1. Define domain entities, value objects, and repository interfaces
  - [x] 1.1 Create Product entity and FitMetadata interface
    - Create `src/domain/catalog/Product.ts` with `ProductProps` interface, `FitMetadata` interface, and immutable `Product` class with getters and `toProps()` method
    - _Requirements: 6.2, 7.1, 7.3_

  - [x] 1.2 Create ProductVariant entity and Condition type
    - Create `src/domain/catalog/ProductVariant.ts` with `Condition` type (`'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New'`), `ProductVariantProps` interface, and immutable `ProductVariant` class with `isSecondLife` and `isInStock` computed getters
    - Import `MediaReference` from `../shared/types.js`
    - _Requirements: 6.3, 2.1, 2.3_

  - [x] 1.3 Create Category entity
    - Create `src/domain/catalog/Category.ts` with `CategoryProps` interface and immutable `Category` class
    - _Requirements: 7.5_

  - [x] 1.4 Define IProductRepository interface
    - Create `src/domain/catalog/IProductRepository.ts` with `findById`, `findByCategory`, `searchByKeyword` (default limit 50), and `findAll` (default limit 100) methods
    - _Requirements: 6.2_

  - [x] 1.5 Define IVariantRepository interface
    - Create `src/domain/catalog/IVariantRepository.ts` with `findByProductId`, `findById`, `save`, `findByCondition`, and `findBySourceReturnId` methods
    - _Requirements: 6.3_

  - [x] 1.6 Define ICategoryRepository interface
    - Create `src/domain/catalog/ICategoryRepository.ts` with `findAll` and `findById` methods
    - _Requirements: 7.5_

  - [x] 1.7 Create domain barrel export
    - Create `src/domain/catalog/index.ts` re-exporting all entities, types, and interfaces
    - _Requirements: 6.1_

- [x] 2. Implement in-memory repositories
  - [x] 2.1 Implement InMemoryProductRepository
    - Create `src/infrastructure/catalog/InMemoryProductRepository.ts` using `Map<string, Product>` storage
    - Implement `searchByKeyword` as case-insensitive substring match on title, brand, and category name
    - Include `addProduct` method for seed data loading
    - _Requirements: 6.4, 4.8_

  - [x] 2.2 Implement InMemoryVariantRepository
    - Create `src/infrastructure/catalog/InMemoryVariantRepository.ts` using `Map<string, ProductVariant>` with secondary index `Map<string, string[]>` for productId lookups
    - Include `addVariant` method for seed data loading
    - _Requirements: 6.4_

  - [x] 2.3 Implement InMemoryCategoryRepository
    - Create `src/infrastructure/catalog/InMemoryCategoryRepository.ts` using `Map<string, Category>` storage
    - Include `addCategory` method for seed data loading
    - _Requirements: 6.4, 7.5_

  - [x] 2.4 Implement LocalMediaResolver
    - Create `src/infrastructure/catalog/IMediaResolver.ts` interface and `src/infrastructure/catalog/LocalMediaResolver.ts` that maps storage keys to `/assets/uploads/{storageKey}`
    - _Requirements: 2.3_

  - [x] 2.5 Create infrastructure barrel export
    - Create `src/infrastructure/catalog/index.ts` re-exporting all implementations
    - _Requirements: 6.4_

- [x] 3. Implement application services
  - [x] 3.1 Create CatalogConfig and defaults
    - Create `src/application/catalog/CatalogConfig.ts` with `CatalogConfig` interface and `DEFAULT_CATALOG_CONFIG` constant containing all configurable values (discounts, limits, delivery days)
    - _Requirements: 3.1, 6.6, 6.7_

  - [x] 3.2 Create DeliveryEstimate interface and helper
    - Create `src/application/catalog/DeliveryEstimate.ts` with `DeliveryEstimate` interface and a `computeDeliveryEstimate(config)` function that calculates date range from today
    - _Requirements: 1.1_

  - [x] 3.3 Create SearchService with filtering, sorting, and pagination
    - Create `src/application/catalog/SearchService.ts` with `SearchOptions`, `SearchFilters`, `SortOption`, `SearchResult`, and `ProductSearchCard` interfaces
    - Implement keyword search delegating to `IProductRepository.searchByKeyword`
    - Implement filter logic: priceMin/priceMax, brands, minRating, conditions
    - Implement sort: relevance (in-stock first), price_asc, price_desc, rating_desc
    - Implement pagination with 1-based page numbers
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.8, 8.4_

  - [x] 3.4 Implement CatalogService facade
    - Create `src/application/catalog/CatalogService.ts` implementing `getProductById`, `getVariantsByProductId`, `searchProducts`, `getCategories`, `createVariantFromListing`, and `getDeliveryEstimate`
    - Validate all inputs and return `CatalogResult<T>` with structured `CatalogError` on failure
    - Delegate search to SearchService internally
    - Implement `createVariantFromListing`: validate grade is A, compute Open_Box price from discount config, cap unitPhotos at maxUnitPhotos, publish `ListingCreated` on success
    - _Requirements: 6.1, 6.5, 6.6, 6.7, 3.1, 3.2_

  - [x] 3.5 Implement ListingRequestedHandler
    - Create `src/application/catalog/ListingRequestedHandler.ts` that subscribes to `ListingRequested` on the event bus
    - Validate required fields (returnRequestId, productId, conditionGrade, assessmentSummary, mediaReferences)
    - Reject non-A grades with structured log
    - Check idempotency via `findBySourceReturnId`
    - Delegate to `CatalogService.createVariantFromListing`
    - Log structured warnings/errors following `CatalogLogEntry` schema
    - Never throw — always catch and log
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 10.1, 10.2, 10.3, 10.4_

  - [x] 3.6 Create application barrel export
    - Create `src/application/catalog/index.ts` re-exporting CatalogService, CatalogConfig, ListingRequestedHandler, and public types
    - _Requirements: 6.1_

- [x] 4. Checkpoint - Core domain and application layers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement seed data loading
  - [x] 5.1 Create SeedDataLoader
    - Create `src/infrastructure/catalog/SeedDataLoader.ts` with a synchronous `load(productRepo, variantRepo, categoryRepo)` method
    - Seed 3+ categories: Electronics, Footwear, Home
    - Seed 6+ products spanning those categories
    - Seed at least 1 product with New + Open_Box + Certified_Renewed variants (demo showpiece with sourceReturnId, conditionReport, and unitPhotos on second-life variants)
    - Seed at least 1 footwear product with `fitMetadata: { sizeOffsetIndicator: 'runs_small', offsetMagnitude: 1 }`
    - Seed at least 1 product with basePrice < 500 and at least 1 with basePrice >= 500
    - Use `/assets/products/{productId}.jpg` pattern for catalogImageUrl
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.2 Write unit tests for SeedDataLoader
    - Verify correct number of categories, products, and variants are loaded
    - Verify at least one product has 3 condition variants
    - Verify footwear product has fitMetadata with runs_small
    - Verify price thresholds (below and above ₹500)
    - _Requirements: 7.1, 7.2, 7.3, 7.7_

- [x] 6. Implement presentation layer components
  - [x] 6.1 Create GlobalNav component
    - Create `src/presentation/web/catalog/components/GlobalNav.tsx` with logo, SearchBar, category menu, account icon, and cart icon with badge (1–99, "99+" for >99)
    - Keyboard-navigable, WCAG AA contrast
    - _Requirements: 5.1, 4.1_

  - [x] 6.2 Create SearchBar component with autocomplete
    - Create `src/presentation/web/catalog/components/SearchBar.tsx` with text input (max 200 chars), autocomplete dropdown on 2+ chars within 300ms, dismiss on blur or <2 chars
    - Up to 8 suggestions from CatalogService
    - _Requirements: 4.1, 4.2_

  - [x] 6.3 Create HomePage component with CategoryTiles, DealsRail, and SecondLifeRail
    - Create `src/presentation/web/catalog/pages/HomePage.tsx` composing CategoryTiles (up to 12), DealsRail (up to 10 discounted variants), and SecondLifeRail (up to 10 Open_Box/Certified_Renewed variants)
    - Hide rails when empty; skeleton loaders for async data
    - Mobile-first responsive layout
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.9_

  - [x] 6.4 Create ProductDetailPage component
    - Create `src/presentation/web/catalog/pages/ProductDetailPage.tsx` with image gallery, product info (title, brand, price, delivery estimate, rating), condition selector, Second Life details, and purchase action buttons
    - Default selected variant: lowest-priced in-stock
    - Condition selector ordered by price ascending
    - Add to Cart / Buy Now enabled when at least one variant in stock; disabled with "Currently Unavailable" when all stock zero
    - Show "Second Life" badge + condition report + unit photo gallery when sourceReturnId present
    - Error state for product not found or network failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 8.1, 8.2, 8.3, 8.5, 8.6_

  - [x] 6.5 Create SearchResultsPage component
    - Create `src/presentation/web/catalog/pages/SearchResultsPage.tsx` with product grid (paginated at 20/page), FilterPanel (price range, brand checkboxes, min rating, condition multi-select), SortSelector, and NoResults state
    - Out-of-stock products show badge and sort after in-stock in default relevance sort
    - No-results state shows query, recovery suggestions, and optional Second Life rail
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 6.6 Set up routing and page wiring
    - Create `src/presentation/web/catalog/index.tsx` with React Router routes for `/`, `/product/:id`, `/search`, and `/category/:id`
    - Wire CatalogService into components via context or props
    - _Requirements: 5.5_

- [x] 7. Checkpoint - Full vertical slice
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Property-based tests for search and filtering logic
  - [x] 8.1 Write property test: Search returns matching products (Property 10)
    - **Property 10: Search returns matching products via case-insensitive substring**
    - Generate random products and keywords; verify a product appears in results iff keyword is a case-insensitive substring of title, brand, or category name
    - **Validates: Requirements 4.3, 4.8**

  - [x] 8.2 Write property test: Search sort produces correctly ordered results (Property 11)
    - **Property 11: Search sort produces correctly ordered results**
    - Generate random search results; verify price_asc → non-decreasing order, price_desc → non-increasing, rating_desc → non-increasing
    - **Validates: Requirements 4.5**

  - [x] 8.3 Write property test: Search filters return only matching products (Property 12)
    - **Property 12: Search filters return only products satisfying all active criteria**
    - Generate random products and filter combinations; verify all results satisfy every active filter simultaneously
    - **Validates: Requirements 4.6**

  - [x] 8.4 Write property test: Out-of-stock products sorted after in-stock (Property 17)
    - **Property 17: Out-of-stock products sorted after in-stock in default relevance sort**
    - Generate random products with mixed stock; verify out-of-stock appear after in-stock in relevance sort
    - **Validates: Requirements 8.4**

- [x] 9. Property-based tests for event handling and variant creation
  - [x] 9.1 Write property test: Valid Grade A ListingRequested creates variant (Property 5)
    - **Property 5: Valid Grade A ListingRequested creates correct variant and publishes ListingCreated**
    - Generate valid ListingRequested events; verify variant condition, price, stock, sourceReturnId, conditionReport, unitPhotos cap, and ListingCreated event payload
    - **Validates: Requirements 3.1, 3.2, 6.7**

  - [x] 9.2 Write property test: Unknown productId discarded gracefully (Property 6)
    - **Property 6: Unknown productId in ListingRequested results in graceful discard**
    - Generate events with non-existent productIds; verify no variant created, no ListingCreated published, no exception thrown, structured warning logged
    - **Validates: Requirements 3.3, 10.1, 10.2, 10.3, 10.4**

  - [x] 9.3 Write property test: Non-A grade discarded (Property 7)
    - **Property 7: Non-A grade ListingRequested is discarded**
    - Generate events with grades B, C, D, null, empty, random strings; verify no variant created and no ListingCreated published
    - **Validates: Requirements 3.4**

  - [x] 9.4 Write property test: Idempotent processing (Property 8)
    - **Property 8: Idempotent ListingRequested processing**
    - Process a valid event twice; verify only one variant exists after both, no duplicate
    - **Validates: Requirements 3.6**

  - [x] 9.5 Write property test: Malformed events discarded (Property 9)
    - **Property 9: Malformed ListingRequested events are discarded with error log**
    - Generate events with null/empty/wrong-type required fields; verify discard and structured error log
    - **Validates: Requirements 3.7**

- [x] 10. Property-based tests for CatalogService validation
  - [x] 10.1 Write property test: CatalogService validates inputs (Property 15)
    - **Property 15: CatalogService validates inputs and returns structured errors**
    - Generate invalid inputs (empty IDs, invalid conditions, negative prices); verify structured error objects returned, no unhandled exceptions
    - **Validates: Requirements 6.6**

- [x] 11. Property-based tests for PDP and home page logic
  - [x] 11.1 Write property test: Buy button reflects stock (Property 1)
    - **Property 1: Buy button state reflects variant stock availability**
    - Generate products with various stock levels; verify buttons enabled iff at least one variant has stock > 0
    - **Validates: Requirements 1.3, 8.2**

  - [x] 11.2 Write property test: Condition selector ordered by price (Property 2)
    - **Property 2: Condition selector is ordered by price ascending**
    - Generate products with multiple variants at random prices; verify selector ordering is price ascending
    - **Validates: Requirements 2.1**

  - [x] 11.3 Write property test: Second Life UI elements (Property 3)
    - **Property 3: Second Life UI elements rendered based on variant metadata presence**
    - Generate variants with/without sourceReturnId, conditionReport, unitPhotos; verify badge/report/gallery render rules
    - **Validates: Requirements 2.3, 2.4**

  - [x] 11.4 Write property test: Default variant selection (Property 4)
    - **Property 4: Default variant selection is lowest-priced in-stock**
    - Generate products with multiple variants; verify initial selection is lowest-priced among in-stock
    - **Validates: Requirements 2.7**

  - [x] 11.5 Write property test: Auto-switch on stock depletion (Property 16)
    - **Property 16: Auto-switch selected variant on stock depletion**
    - Simulate stock transitions to zero; verify auto-switch to next lowest-priced in-stock or buttons disabled
    - **Validates: Requirements 8.3**

  - [x] 11.6 Write property test: Deals rail correctness (Property 13)
    - **Property 13: Deals rail contains only discounted variants**
    - Generate catalogs with mixed pricing; verify deals rail contains only variants priced below basePrice, max 10 items
    - **Validates: Requirements 5.3**

  - [x] 11.7 Write property test: Second Life rail correctness (Property 14)
    - **Property 14: Second Life rail contains only Open_Box or Certified_Renewed variants**
    - Generate catalogs with mixed conditions; verify rail contains only Open_Box/Certified_Renewed, max 10 items
    - **Validates: Requirements 5.4**

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases using `vitest`
- The design uses TypeScript throughout — all implementations follow the existing project conventions
- The existing `IEventBus` at `src/domain/shared/events.ts` and `MediaReference` at `src/domain/shared/types.ts` are reused without modification
- In-memory repositories are the primary implementation; DynamoDB adapters are stretch goals not included in this plan

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 1, "tasks": ["1.7", "2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["3.4"] },
    { "id": 5, "tasks": ["3.5", "3.6"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2", "6.1", "6.2"] },
    { "id": 8, "tasks": ["6.3", "6.4", "6.5"] },
    { "id": 9, "tasks": ["6.6"] },
    { "id": 10, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 11, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 12, "tasks": ["10.1"] },
    { "id": 13, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7"] }
  ]
}
```
