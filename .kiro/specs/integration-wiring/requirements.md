# Requirements Document

## Introduction

This feature assembles the four existing standalone modules (Zero-Touch Returns, Storefront Browsing/Catalog, Accounts & Orders, and Cart & Checkout) into a single running application that shares one event bus instance, one set of repositories, and one unified React frontend. No module internals are modified — only wiring code is added via a composition root, unified seed data, a shared backend entry point, a unified frontend entry point, and integration smoke tests.

## Glossary

- **Composition_Root**: The single file (`src/composition/root.ts`) responsible for instantiating all concrete infrastructure classes (repositories, event bus) and calling each module's self-registration function.
- **Unified_Seed**: A single seed data loader (`src/composition/seed.ts`) that produces one coherent dataset spanning all modules, replacing per-module overlapping seed logic.
- **Shared_Event_Bus**: The single `InProcessEventBus` instance shared across all modules for domain event pub/sub.
- **Module_Registrar**: A self-registration function exported by each module (e.g., `registerCatalog`, `registerReturns`, `registerAccounts`, `registerCart`) that receives the shared event bus and shared repositories and wires its internal services.
- **Integration_Seam**: A cross-module boundary where one module publishes a domain event and another module subscribes and reacts.
- **Express_App**: The unified Express HTTP server mounting all module API routes on a shared application instance.
- **Unified_Frontend**: The single React application that mounts all module frontends under shared routing with a common `GlobalNav` and `Footer`.
- **Smoke_Test**: A minimal integration test that verifies correct event flow and data sharing across module boundaries.

## Requirements

### Requirement 1: Composition Root — Single Event Bus

**User Story:** As a developer, I want a single composition root that instantiates exactly one InProcessEventBus, so that domain events published by one module are received by all other subscribing modules.

#### Acceptance Criteria

1. THE Composition_Root SHALL instantiate exactly one InProcessEventBus and export it as the Shared_Event_Bus singleton, verifiable by reference-equality check across all injection sites.
2. THE Composition_Root SHALL pass the same Shared_Event_Bus instance to every Module_Registrar function invoked during bootstrap.
3. WHEN any module publishes a domain event on the Shared_Event_Bus, THE Shared_Event_Bus SHALL deliver that event to every handler registered for the event's eventType, all subscriber Promise return values SHALL be awaited before publish() resolves, so that by the time the publisher's await publish(...) returns, every registered handler has completed execution or thrown.
4. THE Composition_Root SHALL be the only file that imports and instantiates the InProcessEventBus class.
5. IF a subscriber handler throws an error during event delivery, THEN THE Shared_Event_Bus SHALL log the error with the event's eventId and eventType and continue delivering the event to all remaining subscribers without propagating the failure to the publisher.

### Requirement 2: Composition Root — Shared Repositories

**User Story:** As a developer, I want shared repository instances created once in the composition root, so that all modules read from and write to the same data stores.

#### Acceptance Criteria

1. THE Composition_Root SHALL instantiate exactly one instance of each shared repository: InMemoryProductRepository, InMemoryVariantRepository, InMemoryCategoryRepository, InMemoryCustomerRepository, InMemoryOrderRepository, and InMemoryReturnRequestRepository.
2. WHEN the Composition_Root injects dependencies into the Returns module, THE Composition_Root SHALL pass the same InMemoryCustomerRepository and InMemoryOrderRepository instances used by the Accounts module into the IdentityService that serves as the IAuthService dependency for ReturnsFacade.
3. WHEN the Composition_Root injects dependencies into the Cart module, THE Composition_Root SHALL pass the same InMemoryProductRepository and InMemoryVariantRepository instances used by the Catalog module into the CartCheckoutWiring as the IProductRepository and IVariantRepository dependencies.
4. THE Composition_Root SHALL inject the same InMemoryOrderRepository instance into both the IdentityService (IAuthService for Returns) and the OrdersService, so that orders created via checkout are visible to the returns eligibility check.
5. THE Composition_Root SHALL be the sole location that calls `new` on any shared cross-module repository class (InMemoryProductRepository, InMemoryVariantRepository, InMemoryCategoryRepository, InMemoryCustomerRepository, InMemoryOrderRepository, InMemoryReturnRequestRepository); module-internal repositories (e.g., InMemoryCartRepository) SHALL be instantiated exclusively within their owning module's wiring function and SHALL NOT be passed to or instantiated by the Composition_Root.
6. IF a module attempts to resolve a shared repository dependency before the Composition_Root has registered it, THEN the Composition_Root SHALL throw an error indicating which dependency is missing and which module requires it.

### Requirement 3: Composition Root — Module Registration

**User Story:** As a developer, I want each module to have a self-registration function called by the composition root, so that modules are independently testable and wire their internal services without knowing about other modules.

#### Acceptance Criteria

1. THE Composition_Root SHALL call each Module_Registrar function (registerCatalog, registerReturns, registerAccounts, registerCart) passing the Shared_Event_Bus and the shared repository interfaces required by that module. The Module_Registrar functions SHALL be called in the following order: registerCatalog first, then registerAccounts, then registerReturns, then registerCart, so that each registrar can safely depend on interfaces returned by previously registered modules.
2. WHEN a Module_Registrar is called, THE Module_Registrar SHALL return an object containing the module's public service interfaces and a dispose function for teardown, within 2000 milliseconds.
3. THE Composition_Root SHALL register all event-bus subscriptions (ListingRequestedHandler, RefundIssued handler, DispositionOrchestrator) after all Module_Registrar functions have returned successfully and before the Express_App begins accepting HTTP connections.
4. WHEN the Composition_Root calls a Module_Registrar, THE Module_Registrar SHALL instantiate only services defined within its own module boundary, using the provided shared dependencies as constructor arguments without importing concrete classes from other modules.
5. IF a Module_Registrar throws an error during invocation, THEN THE Composition_Root SHALL halt the startup sequence and propagate the error without starting the Express_App.
6. THE Composition_Root SHALL enforce that no module source file imports another module's non-exported internal classes; modules interact exclusively through shared interfaces, the Shared_Event_Bus, and facade services returned by their respective Module_Registrar functions.

### Requirement 4: Unified Seed Data

**User Story:** As a developer, I want a single unified seed data loader that produces one coherent dataset across all modules, so that the demo flow has consistent data without overlapping or conflicting seed files.

#### Acceptance Criteria

1. THE Unified_Seed SHALL produce at least 6 products spanning Electronics, Footwear, and Home categories, with each category containing at least 1 product.
2. THE Unified_Seed SHALL include at least 1 product with New, Open_Box, and Certified_Renewed condition variants, each variant having stock of at least 1 and a price greater than 0.
3. THE Unified_Seed SHALL include at least 1 footwear product with fitMetadata containing sizeOffsetIndicator set to 'runs_small' and offsetMagnitude set to 1.
4. THE Unified_Seed SHALL include at least 1 product with basePrice less than 500 and at least 1 product with basePrice greater than or equal to 500, where all basePrice values fall within the range 1 to 999999.
5. THE Unified_Seed SHALL set catalogImageUrl to the pattern `/assets/products/{productId}.jpg` for each product.
6. THE Unified_Seed SHALL seed averageRating as a number between 1.0 and 5.0 (inclusive) and reviewCount as an integer between 0 and 99999 (inclusive) on each product.
7. THE Unified_Seed SHALL create 1 demo customer with id 'demo-customer-1', a saved default address with all required fields populated (recipientName, streetLine1, city, state, pincode as 6 digits, country), and a saved UPI mock payment method marked as isPreferred.
8. THE Unified_Seed SHALL create 1 delivered Order for demo-customer-1 with deliveryDate set to 3 days before the current date, ensuring the order falls within the configured return window (default 10 days).
9. THE Unified_Seed SHALL create at least 3 categories: Electronics, Footwear, and Home, each with a non-empty id, name, and imageUrl.
10. WHEN the Composition_Root calls the Unified_Seed, THE Unified_Seed SHALL execute synchronously before the Express_App starts listening.
11. IF the Unified_Seed is executed more than once, THEN THE Unified_Seed SHALL produce the same set of records without creating duplicates (idempotent seeding via upsert semantics).
12. IF the Unified_Seed encounters an error during data loading, THEN THE Unified_Seed SHALL throw an error that prevents the Express_App from starting and log a message indicating which seed step failed.
13. THE Unified_Seed SHALL create exactly one demo customer with customerId 'demo-customer-1', email 'demo@example.com', and at least one saved delivery address, and this customer SHALL be present in the shared InMemoryCustomerRepository before any module route handler is invoked.
14. THE Unified_Seed SHALL create exactly one seeded Order belonging to 'demo-customer-1' with status 'Delivered', containing at least one OrderItem whose productId and variantId reference a product and variant already seeded in the shared InMemoryProductRepository and InMemoryVariantRepository respectively, and whose deliveryDate is set to exactly 3 days before the application start date so that the item is within the default 10-day return window.

### Requirement 5: Unified Backend Entry Point

**User Story:** As a developer, I want a single Express server entry point that mounts all module API routes, so that the entire application runs from one HTTP server.

#### Acceptance Criteria

1. THE Express_App SHALL call the Composition_Root before any route handler is registered.
2. THE Express_App SHALL call the Unified_Seed after the Composition_Root and before listening for HTTP connections.
3. THE Express_App SHALL mount catalog routes at path prefix `/api/catalog`.
4. THE Express_App SHALL mount account routes at path prefix `/api/accounts`.
5. THE Express_App SHALL mount order routes at path prefix `/api/orders`.
6. THE Express_App SHALL mount returns routes at path prefix `/api/returns`.
7. THE Express_App SHALL mount cart routes at path prefix `/api/cart`.
8. THE Express_App SHALL expose a health check route at `GET /health` that returns HTTP status 200 with a JSON body containing `{ status: 'ok', modules: ['catalog', 'returns', 'accounts', 'orders', 'cart'] }`.
9. THE Express_App SHALL start listening for connections only after the Unified_Seed has completed execution.
10. THE Express_App SHALL read the listening port from the environment variable `PORT`, defaulting to 3001 if not set.
11. IF the Composition_Root or Unified_Seed throws an error during startup, THEN THE Express_App SHALL log the error and exit the process with a non-zero exit code without accepting any HTTP connections.
12. THE Express_App SHALL not begin accepting HTTP connections until the Unified_Seed loader has resolved successfully; if the seed throws an error, THE Express_App SHALL log the error and exit the process without starting the HTTP listener.

### Requirement 6: Unified React Frontend

**User Story:** As a developer, I want a single React application that mounts all module frontends under shared routing with a common GlobalNav and Footer, so that the user experiences one cohesive application.

#### Acceptance Criteria

1. THE Unified_Frontend SHALL render a single GlobalNav component at the top of the viewport on every authenticated and catalog route (excluding `/login` and `/signup`), containing at minimum: a link to the home page, a search entry point, an account link, and a cart link.
2. THE Unified_Frontend SHALL render a single Footer component at the bottom of the viewport on every authenticated and catalog route (excluding `/login` and `/signup`).
3. THE Unified_Frontend SHALL mount the home page at route `/`.
4. THE Unified_Frontend SHALL mount the product detail page at route `/product/:id`.
5. THE Unified_Frontend SHALL mount the search results page at route `/search`.
6. THE Unified_Frontend SHALL mount the category page at route `/category/:id`.
7. THE Unified_Frontend SHALL mount the account page at route `/account`, serving as the entry point for account sub-routes (profile, addresses, payment methods, notification preferences).
8. THE Unified_Frontend SHALL mount the orders list page at route `/orders`.
9. THE Unified_Frontend SHALL mount the order detail page at route `/orders/:id`.
10. THE Unified_Frontend SHALL mount the returns flow page at route `/returns/:orderId/:itemId`.
11. THE Unified_Frontend SHALL mount the cart page at route `/cart`.
12. THE Unified_Frontend SHALL mount the checkout page at route `/checkout`.
13. THE Unified_Frontend SHALL provide shared service instances (including CatalogService, CartService, AuthContext, and EventBus) to all pages via React context, with all service instances created once at the application Composition_Root and reused across route navigations without re-instantiation.
14. IF a user navigates to a route that does not match any defined route, THEN THE Unified_Frontend SHALL render a not-found page within the GlobalNav and Footer layout indicating the page does not exist, with a link to navigate back to the home page.
15. WHEN a user navigates between routes, THE Unified_Frontend SHALL preserve the GlobalNav and Footer without unmounting and remounting them, ensuring navigation does not cause a full-page reload.

### Requirement 7: Integration Seam — ListingRequested Event

**User Story:** As a developer, I want the Returns module's ListingRequested event to be received by the Catalog module's ListingRequestedHandler, so that a returned Grade-A item creates an Open_Box variant in the catalog.

#### Acceptance Criteria

1. WHEN the Returns module publishes a ListingRequested event on the Shared_Event_Bus, THE ListingRequestedHandler in the Catalog module SHALL receive the event within the same asynchronous tick as the publish call.
2. WHEN the ListingRequestedHandler receives a ListingRequested event with conditionGrade 'A' and a valid productId, THE CatalogService SHALL create an Open_Box ProductVariant for that product with condition set to 'Open_Box', sourceReturnId set to the event's returnRequestId, conditionReport populated from assessmentSummary, and price computed as basePrice × (1 − openBoxDiscountPercent / 100).
3. WHEN the Open_Box variant is created, THE Unified_Frontend SHALL display the variant on the product detail page with a "Second Life" badge and the AI condition report text.
4. IF the ListingRequested event references a productId that does not exist in the shared InMemoryProductRepository, THEN THE ListingRequestedHandler SHALL log a warning with discardReason 'unknown_productId' and discard the event without throwing.
5. IF a variant with the same sourceReturnId already exists, THEN THE ListingRequestedHandler SHALL log an info entry with discardReason 'duplicate' and discard the event (idempotent handling).

### Requirement 8: Integration Seam — RefundIssued Event

**User Story:** As a developer, I want the Returns module's RefundIssued event to be received by the Orders module, so that order detail reflects the refund status.

#### Acceptance Criteria

1. WHEN the Returns module publishes a RefundIssued event on the Shared_Event_Bus with payload containing orderItemId, returnRequestId, amount, currency, and issuedAt, THE OrdersService SHALL receive the event and update the corresponding order item's refundStatus to `{ code: 'refund_issued', amount, currency, issuedAt }`.
2. WHEN the order item refund status is updated, THE Express_App SHALL return the updated refund status in the `/api/orders/:id` response within the order item data.
3. IF the RefundIssued event references an orderItemId that does not exist in the shared InMemoryOrderRepository, THEN THE RefundIssued handler SHALL log a warning and discard the event without throwing.
4. IF a RefundIssued event is received for an order item that already has refundStatus code 'refund_issued', THEN THE handler SHALL treat the event as idempotent and not modify the existing refund data.

### Requirement 9: Integration Seam — Return Eligibility via Shared Repositories

**User Story:** As a developer, I want the Returns module to read real product data from the catalog repository and real customer/order data from the accounts repository, so that eligibility checks and return flows use live data rather than mock stubs.

#### Acceptance Criteria

1. WHEN the Returns module checks return eligibility, THE Returns module SHALL read the product data from the shared InMemoryProductRepository (the same instance used by the Catalog module), verifying that the product exists and retrieving its catalogImageUrl and title for use in the eligibility result.
2. WHEN the Returns module checks return eligibility, THE Returns module SHALL read the customer data from the shared InMemoryCustomerRepository (the same instance used by the Accounts module), confirming that the customer ID exists in the repository before proceeding.
3. WHEN the Returns module checks return eligibility, THE Returns module SHALL read the order data from the shared InMemoryOrderRepository (the same instance used by the Orders module), retrieving the order item's deliveryDate, productName, productImage, and price to evaluate the return window and populate the eligibility result.
4. WHEN the Returns module retrieves product data for an eligibility check, THE Returns module SHALL use the catalogImageUrl value from the shared InMemoryProductRepository rather than a hardcoded stub image, so that the eligibility result displays the real catalog image.
5. IF the shared repository returns null for a requested product, customer, or order item, THEN THE Returns module SHALL return an ineligible result with an error message indicating which entity could not be found.
6. WHEN a product or order is added to the shared repository by another module, THE Returns module SHALL observe that change on its next eligibility check without requiring a restart or reinitialization, confirming that both modules hold a reference to the same repository instance.

### Requirement 10: Integration Seam — DeliveryJobCreated Event

**User Story:** As a developer, I want the Returns module's DeliveryJobCreated event to be published on the Shared_Event_Bus, so that a Logistics/FlexRoute subscriber can react when it exists.

#### Acceptance Criteria

1. WHEN the Returns module publishes a DeliveryJobCreated event on the Shared_Event_Bus with payload containing returnRequestId, pickupAddress, dropAddress, itemId, and priority, THE Shared_Event_Bus SHALL deliver the event to any registered subscriber.
2. IF no subscriber is registered for DeliveryJobCreated, THEN THE Shared_Event_Bus SHALL discard the event without error and without logging a warning; this silent discard behavior is intentional because the FlexRoute/Logistics module is not yet implemented and will be added as a future Module_Registrar.
3. IF a subscriber is registered and throws an error while handling the DeliveryJobCreated event, THEN THE Shared_Event_Bus SHALL log the error and continue without propagating the failure to the Returns module publisher.

### Requirement 11: Integration Seam — OrderDelivered for Eligibility

**User Story:** As a developer, I want delivered-order data available to the Returns module for eligibility checks, so that the return window calculation uses the actual delivery date.

#### Acceptance Criteria

1. WHEN the Returns module performs an eligibility check for an order item, THE Returns module SHALL read the delivery date from the shared InMemoryOrderRepository by querying the order item's deliveryDate field.
2. THE Returns module SHALL compute the return window as deliveryDate + configured returnWindowDays (default 10), and the item is eligible if the current date is before that computed expiry date.
3. IF the order item does not have a deliveryDate set (e.g., order not yet delivered), THEN THE Returns module SHALL return an ineligible result with an error message indicating the item has not been delivered.

### Requirement 12: Integration Smoke Tests

**User Story:** As a developer, I want a minimal integration smoke test suite that verifies all five cross-module seams work end-to-end, so that regressions in wiring are caught immediately.

#### Acceptance Criteria

1. THE Smoke_Test SHALL call the order detail API endpoint for the seeded delivered order belonging to 'demo-customer-1' and verify that the response includes returnEligible set to true for the seeded OrderItem, confirming both that the Returns module reads from the shared InMemoryOrderRepository and that the Return button precondition is satisfied.
2. THE Smoke_Test SHALL verify that the Returns module reads a seeded product from the catalog repository and that the returned catalogImageUrl matches the value stored in the seeded Product entity.
3. WHEN a ListingRequested event with conditionGrade 'A' and a valid seeded productId is published on the event bus, THE Smoke_Test SHALL verify that a new ProductVariant with condition 'Open_Box' appears in the catalog variant repository within 500 milliseconds.
4. WHEN a RefundIssued event referencing a seeded order item is published on the event bus, THE Smoke_Test SHALL verify that querying the corresponding order item returns a refundStatus of 'refund_issued' within 500 milliseconds.
5. WHEN the Open_Box variant has been created from a ListingRequested event, THE Smoke_Test SHALL verify that querying the product detail by productId includes the new variant in its variants list.

### Requirement 13: Module Isolation Constraint

**User Story:** As a developer, I want to ensure no module directly imports another module's internal classes, so that the architecture remains loosely coupled and independently testable.

#### Acceptance Criteria

1. THE Composition_Root (src/composition/root.ts and module-specific wiring files such as cart-checkout-wiring.ts) SHALL be the only production source files that import concrete infrastructure classes (InProcessEventBus, InMemoryProductRepository, InMemoryVariantRepository, InMemoryCategoryRepository, InMemoryCustomerRepository, InMemoryOrderRepository, InMemoryReturnRequestRepository).
2. IF one application module (a folder under src/application/) needs functionality from a different application module, THEN THE requesting module SHALL depend only on that module's barrel-exported facade interface or on a domain event published to the Shared_Event_Bus — never on a file path inside the other module's folder.
3. IF a developer adds a direct import of another application module's non-barrel-exported class outside the Composition_Root, THEN THE architectural boundary test SHALL fail by detecting the disallowed import path via static import-graph analysis and reporting the violating file and imported symbol.
4. THE barrel export file (index.ts) of each application module SHALL expose only facade interfaces and public types — not internal service implementations, handlers, or helper classes.

### Requirement 14: Local Execution Without Cloud Credentials

**User Story:** As a developer, I want the fully wired application to run end-to-end locally without live AWS credentials, so that demos and development are reliable without cloud dependencies.

#### Acceptance Criteria

1. IF the environment variable `ZTR_BEDROCK_ENABLED` is not set or is set to any value other than `true`, THEN THE Express_App SHALL start using only in-memory repositories and mock adapters without attempting any outbound connections to AWS services.
2. THE Unified_Frontend SHALL render and navigate all application routes by calling only the locally served Express API, with no requests made to external domains or cloud endpoints.
3. WHEN the command `npm run dev` is executed with no AWS credentials configured, THE application SHALL begin listening on the configured port within 10 seconds and respond to `GET /api/health` with HTTP status 200.
4. IF `ZTR_BEDROCK_ENABLED` is set to `true` but valid AWS credentials are not available, THEN THE Express_App SHALL fail to start and log an error message indicating which credential or configuration is missing.
