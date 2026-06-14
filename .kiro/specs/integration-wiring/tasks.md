# Implementation Plan: Integration Wiring

## Overview

Wire the four pre-built modules (Zero-Touch Returns, Storefront Browsing/Catalog, Accounts & Orders, and Cart & Checkout) into a single running application. Only wiring code is added — no module internals are modified. Implementation follows dependency order: composition root → module registrars → unified seed → unified server → unified frontend → integration tests.

## Tasks

- [x] 1. Implement Composition Root and Module Registrars
  - [x] 1.1 Create the Composition Root (`src/composition/root.ts`)
    - Instantiate exactly one `InProcessEventBus` as the shared event bus singleton
    - Instantiate one of each shared repository: `InMemoryProductRepository`, `InMemoryVariantRepository`, `InMemoryCategoryRepository`, `InMemoryCustomerRepository`, `InMemoryOrderRepository`, `InMemoryReturnRequestRepository`
    - Export `CompositionResult` interface and `createCompositionRoot()` function
    - Include a `dispose()` function that calls each module's dispose
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.2 Implement `registerCatalog` module registrar (`src/composition/registerCatalog.ts`)
    - Accept `CatalogDeps` (eventBus, productRepository, variantRepository, categoryRepository)
    - Instantiate `CatalogService` and `SearchService` using shared dependencies
    - Return `CatalogModuleResult` with catalogService, searchService, and dispose function
    - Do NOT import concrete classes from other modules
    - _Requirements: 3.1, 3.2, 3.4, 13.2_

  - [x] 1.3 Implement `registerAccounts` module registrar (`src/composition/registerAccounts.ts`)
    - Accept `AccountsDeps` (eventBus, customerRepository, orderRepository)
    - Instantiate `IdentityService`, `AccountService`, and `OrdersService` using shared dependencies
    - Return `AccountsModuleResult` with identityService, accountService, ordersService, and dispose function
    - _Requirements: 3.1, 3.2, 3.4, 13.2_

  - [x] 1.4 Implement `registerReturns` module registrar (`src/composition/registerReturns.ts`)
    - Accept `ReturnsDeps` (eventBus, returnRequestRepository, orderRepository, customerRepository, productRepository, authService)
    - Use `accountsModule.identityService` as the `IAuthService` dependency — do NOT create a second mock
    - The composition root MUST call `registerAccounts(...)` and capture its result before calling `registerReturns(...)`; the `authService` field in `ReturnsDeps` is satisfied by passing `accountsModule.identityService` from the captured `registerAccounts` result
    - Instantiate `ReturnsFacade` and related services using shared dependencies
    - Return `ReturnsModuleResult` with returnsFacade and dispose function
    - _Requirements: 3.1, 3.2, 3.4, 13.2_

  - [x] 1.5 Implement `registerCart` module registrar (`src/composition/registerCart.ts`)
    - Accept `CartDeps` (eventBus, orderRepository, variantRepository, productRepository, customerRepository)
    - Delegate to existing `initializeCartCheckoutWiring` from `src/application/cart-checkout-wiring.ts`
    - Return `CartModuleResult` with cartService, checkoutService, and dispose function
    - _Requirements: 3.1, 3.2, 3.4, 13.2_

  - [x] 1.6 Wire cross-module event subscriptions in the Composition Root
    - After all registrars complete, subscribe `ListingRequestedHandler` to the shared event bus
    - Ensure `OrdersService` handles `RefundIssued` (already subscribes at construction with shared bus)
    - Initialize `DispositionOrchestrator` with the shared event bus: it subscribes to `DispositionDecisionMade` events published by the Returns module; when the event's `dispositionAction` is `'relist'`, it publishes a `ListingRequested` event to the shared bus; for all dispositions where `dispositionAction` is not `'fraud'`, it also publishes a `RefundIssued` event with the returnRequestId, orderItemId, refundAmount, and currency from the event payload
    - Registration order: Catalog → Accounts → Returns → Cart, then event subscriptions
    - _Requirements: 3.3, 3.5, 7.1, 8.1_

- [x] 2. Implement Unified Seed
  - [x] 2.1 Create the unified seed loader (`src/composition/seed.ts`)
    - Export `SeedDeps` interface accepting repository interfaces (not concrete classes)
    - Export `loadUnifiedSeed(deps: SeedDeps): Promise<void>` function
    - Implement upsert semantics — running multiple times produces identical state without duplicates
    - Seed 3 categories: Electronics, Footwear, Home (each with non-empty id, name, imageUrl)
    - Seed 6+ products spanning all categories (at least 1 per category)
    - Include at least 1 product with New, Open_Box, and Certified_Renewed variants
    - Include 1 footwear product with `fitMetadata` (sizeOffsetIndicator: 'runs_small', offsetMagnitude: 1)
    - Include at least 1 product with basePrice < 500 and at least 1 with basePrice ≥ 500
    - Set `catalogImageUrl` to `/assets/products/{productId}.jpg` pattern
    - Set `averageRating` ∈ [1.0, 5.0] and `reviewCount` ∈ [0, 99999] on each product
    - Create demo customer `demo-customer-1` with saved address and UPI payment method
    - The UPI payment method shape MUST match the `PaymentMethod` interface already defined in the Accounts & Orders module — do not redefine or create a new PaymentMethod type in the seed file
    - Create 1 delivered order (3 days ago) within 10-day return window for demo-customer-1
    - Throw on error to prevent server startup
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14_

- [x] 3. Checkpoint - Ensure composition root and seed work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Unified Backend Entry Point
  - [x] 4.1 Create unified server (`src/server.ts`)
    - Export `createUnifiedApp()` returning `{ app: Express; composition: CompositionResult }`
    - Export `startServer(options?: ServerOptions): Promise<http.Server>`
    - Call `createCompositionRoot()` first, then `loadUnifiedSeed()`, then mount routes
    - Mount catalog routes at `/api/catalog`
    - Mount account routes at `/api/accounts`
    - Mount order routes at `/api/orders`
    - Mount returns routes at `/api/returns`
    - Mount cart routes at `/api/cart`
    - Expose health check at `GET /api/health` returning `{ status: 'ok', modules: ['catalog', 'returns', 'accounts', 'orders', 'cart'] }` — note: use `/api/health` (with the `/api` prefix) to match the unified API prefix used by all other routes and the requirement in Requirements 14.3
    - Read port from `PORT` env var, default to 3001
    - Do not start listening until seed completes; halt and exit on composition/seed error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 14.1, 14.3_

- [x] 5. Implement RefundIssued Handler for Orders Module
  - [x] 5.1 Verify/implement `RefundIssued` event handling in `OrdersService`
    - Verify that `OrdersService` receives the shared `IEventBus` instance (passed from the composition root via `registerAccounts`) as a constructor argument and subscribes to `RefundIssued` on that exact instance — NOT on a locally instantiated bus; if `OrdersService` currently creates its own bus internally, move bus instantiation to the composition root and inject it
    - On receiving a `RefundIssued` event, call `updateRefundStatus()` on the referenced order item
    - Set refundStatus to `{ code: 'refund_issued', amount, currency, issuedAt }`
    - If orderItemId does not exist, log warning and discard without throwing
    - If order item already has `refund_issued` status, treat as idempotent (no modification)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Implement Unified React Frontend
  - [x] 6.1 Create the unified React app (`src/presentation/web/App.tsx`)
    - Create `ServiceContext` with `ServiceContextValue` containing: catalogService, ordersService, returnsFacade, cartService, checkoutService, and eventBus — all sourced from the composition root result; do NOT import service classes directly inside page components
    - Create `MainLayout` component rendering `GlobalNav` + `<Outlet>` + `Footer`
    - GlobalNav contains: home link, search entry point, account link, cart link with badge
    - Mount all routes per design: `/`, `/product/:id`, `/search`, `/category/:id`, `/account`, `/orders`, `/orders/:id`, `/returns/:orderId/:itemId`, `/cart`, `/checkout`, `*` (Not Found)
    - Not Found page renders within MainLayout with link to home
    - Service instances created once and reused across navigations (no re-instantiation)
    - Layout persists GlobalNav/Footer without unmounting across navigation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14, 6.15_

- [x] 7. Checkpoint - Ensure all modules wire correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Integration Smoke Tests
  - [x] 8.1 Create integration smoke test file (`src/integration/smoke.test.ts`)
    - In `beforeAll`: call `createCompositionRoot()` first and capture the result, then call `await loadUnifiedSeed(composition.repos)` — this mirrors the exact startup sequence in `server.ts` and ensures repos are populated before any test assertion runs
    - Call `composition.dispose()` in `afterAll`
    - Test: return eligibility reads from shared order repo (seeded delivered order for demo-customer-1 is eligible)
    - Test: product image URL from catalog repo matches the seeded catalogImageUrl
    - Test: publishing `ListingRequested` with conditionGrade 'A' and valid productId creates Open_Box variant
    - Test: publishing `RefundIssued` updates order item refundStatus to 'refund_issued'
    - Test: created Open_Box variant appears in product detail variants list
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 9. Implement Property-Based Tests
  - [x] 9.1 Write property test for event bus delivery completeness
    - **Property 1: Event bus delivers to all subscribers and awaits completion**
    - Generate random handler counts (1-20) and random events
    - Verify all N handlers are invoked and publish() resolves only after all handlers settle
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 1.3**

  - [x] 9.2 Write property test for error isolation
    - **Property 2: Error isolation — throwing handlers do not affect others**
    - Generate handler arrays with random throw positions (K of N throw)
    - Verify remaining N−K handlers still complete and publish() resolves without throwing
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 1.5, 10.3**

  - [x] 9.3 Write property test for seed idempotence
    - **Property 3: Seed idempotence**
    - Generate random invocation counts (1-10) of `loadUnifiedSeed()` on the same repos
    - Verify repository state after N invocations equals state after 1 invocation (same count, same data, no duplicates)
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 4.11**

  - [x] 9.4 Write property test for Open_Box variant pricing invariant
    - **Property 4: Open_Box variant pricing invariant**
    - Generate random basePrices (> 0) and openBoxDiscountPercent ∈ (0, 100)
    - Verify resulting variant price = `basePrice × (1 − openBoxDiscountPercent / 100)`
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 7.2**

  - [x] 9.5 Write property test for ListingRequested idempotent handling
    - **Property 5: ListingRequested idempotent handling**
    - Generate valid events, publish 1-5 times with same returnRequestId
    - Verify exactly one Open_Box variant is created, duplicates are discarded
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 7.5**

  - [x] 9.6 Write property test for RefundIssued correctness
    - **Property 6: RefundIssued correctly updates order item status**
    - Generate random amounts (> 0), valid currency strings, valid issuedAt timestamps
    - Verify order item's refundStatus is set to `{ code: 'refund_issued', amount, currency, issuedAt }`
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 8.1**

  - [x] 9.7 Write property test for RefundIssued idempotent handling
    - **Property 7: RefundIssued idempotent handling**
    - Generate random events, publish 1-5 times for the same orderItemId
    - Verify refundStatus after N publications equals status after 1 publication
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 8.4**

  - [x] 9.8 Write property test for cross-module repository visibility
    - **Property 8: Cross-module repository visibility**
    - Generate random entities, write via one module's repo reference, read via another's
    - Verify write-then-read consistency without restart or reinitialization
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 9.6**

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Integration smoke tests validate cross-module seam behavior end-to-end
- The design uses TypeScript throughout — all code examples and implementations use TypeScript
- `fast-check` is already in devDependencies; `vitest` is the test runner
- Module registrars delegate to existing wiring functions where available (e.g., `initializeCartCheckoutWiring`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5"] },
    { "id": 3, "tasks": ["1.6", "5.1"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["3"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["7"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8"] },
    { "id": 11, "tasks": ["10"] }
  ]
}
```
