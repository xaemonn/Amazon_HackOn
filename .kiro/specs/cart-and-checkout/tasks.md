# Implementation Plan: Cart & Checkout

## Overview

This plan implements the Cart & Checkout module for Second Life Commerce. It builds from the domain layer up through application services and infrastructure adapters, then wires everything into the composition root. Property-based tests validate the 27 correctness properties using fast-check + Vitest. The implementation reuses existing Customer, Address, PaymentMethod, Order, OrderItem entities and IOrderRepository — never modifying them.

## Tasks

- [x] 1. Domain layer — Cart aggregate, value objects, interfaces, and configuration
  - [x] 1.1 Create CartItem and SaveForLaterItem value objects
    - Create `src/domain/cart/CartItem.ts` with the `CartItem` interface (variantId, productId, productName, productImage, unitPrice, condition, quantity)
    - Create `src/domain/cart/SaveForLaterItem.ts` with the `SaveForLaterItem` interface (variantId, productId, productName, productImage, unitPrice, condition, savedAt)
    - Import `Condition` type from `src/domain/catalog/ProductVariant.ts`
    - _Requirements: 1.5, 5.1_

  - [x] 1.2 Create Cart aggregate root entity
    - Create `src/domain/cart/Cart.ts` with `CartProps` interface and `Cart` class
    - Implement invariant enforcement: max 50 distinct items, quantity per item 1–10
    - Implement `addItem`, `removeItem`, `updateQuantity`, `moveToSaveForLater`, `moveBackToCart` methods as pure domain logic returning new Cart instances (immutable pattern matching existing entities)
    - Implement `subtotal` computation (sum of unitPrice × quantity, rounded to 2 decimal places using half-up rounding)
    - Implement `itemCount` (sum of all quantities)
    - Implement `canCheckout` (items.length > 0)
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.2, 3.1, 3.2, 4.1, 4.4, 4.5, 5.1, 5.2, 5.6, 14.2_

  - [x] 1.3 Create ICartRepository interface
    - Create `src/domain/cart/ICartRepository.ts` with `findByCustomerId(customerId: string): Promise<Cart | null>` and `save(cart: Cart): Promise<void>`
    - _Requirements: 17.1_

  - [x] 1.4 Create IPaymentProvider interface and PaymentResult type
    - Create `src/domain/cart/IPaymentProvider.ts` with `PaymentResult` interface (success, transactionId?, failureReason?) and `IPaymentProvider` interface with `processPayment(amount, currency, paymentMethod): Promise<PaymentResult>`
    - Import `PaymentMethod` type from `src/domain/account/PaymentMethod.ts`
    - _Requirements: 16.1_

  - [x] 1.5 Create CartConfig type and default configuration
    - Create `src/domain/cart/CartConfig.ts` with `DeliveryOption` interface and `CartConfig` interface (maxItemsPerCart, maxQuantityPerItem, maxQuantityAbsolute, deliveryOptions, expressFee, highRtoPincodes, paymentTimeoutMs, eventRetryAttempts, cartClearRetryAttempts)
    - Export a `defaultCartConfig` constant with default values from the design document
    - _Requirements: 7.1, 18.1, 18.5_

  - [x] 1.5b Create IOrderMetadataRepository interface and OrderMetadata type
    - Create `src/domain/cart/IOrderMetadataRepository.ts` with `OrderMetadata` interface (orderId, highRtoFlag, createdAt) and `IOrderMetadataRepository` interface with `save(metadata): Promise<void>` and `findByOrderId(orderId): Promise<OrderMetadata | null>`
    - _Requirements: 18.2, 18.3_

  - [x] 1.6 Create domain barrel export (index.ts)
    - Create `src/domain/cart/index.ts` exporting all domain types: Cart, CartItem, SaveForLaterItem, ICartRepository, IPaymentProvider, PaymentResult, IOrderMetadataRepository, OrderMetadata, CartConfig, DeliveryOption, defaultCartConfig
    - _Requirements: all (module structure)_

- [x] 2. Application layer — CartService facade
  - [x] 2.1 Implement CartService with cart operations
    - Create `src/application/cart/CartService.ts` implementing `ICartService` interface
    - Constructor accepts: `ICartRepository`, `IVariantRepository` (from catalog domain for stock checks)
    - Implement `getCart(customerId)` — retrieves cart from repo, computes CartView (items, saveForLater, subtotal, itemCount, canCheckout)
    - Implement `addItem(customerId, variantId)` — validates variant exists and has stock, checks max quantity (10) and max items (50), caps at available stock with notice, persists via ICartRepository
    - Implement `removeItem(customerId, variantId)` — validates ownership, removes item, recalculates subtotal, persists
    - Implement `updateQuantity(customerId, variantId, quantity)` — validates range [0–99], rejects negative/non-integer/>99, removes on 0, caps at min(available stock, maxQuantityPerItem=10), persists
    - Implement `moveToSaveForLater(customerId, variantId)` — removes from cart, adds to save-for-later list (deduplicates), persists
    - Implement `moveBackToCart(customerId, variantId)` — validates stock > 0, removes from save-for-later, adds to cart with qty 1, persists
    - Implement `clearCart(customerId)` — removes all items from cart, persists
    - Return `CartOperationResult` with success/error/notice for each operation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 14.2, 14.3, 17.1, 17.2, 17.4, 17.5, 17.6_

  - [ ]* 2.2 Write property tests for CartService — cart operations (Properties 1–4)
    - **Property 1: Adding a valid variant grows the cart** — generate random valid variants with stock > 0, verify cart grows or quantity increments
    - **Property 2: Cart quantity invariants are enforced** — generate random sequences of add operations, verify distinct items ≤ 50 and each quantity in [1, 10]
    - **Property 3: Stock-constrained additions** — generate variants with varying stock, verify zero-stock rejected and quantity capped at available stock
    - **Property 4: CartItem captures variant details** — generate random ProductVariants, verify CartItem fields match source exactly
    - Create `src/application/cart/CartService.property.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 4.5**

  - [ ]* 2.3 Write property tests for CartService — remove and update (Properties 5–8)
    - **Property 5: Removing an item reduces cart and subtotal** — generate carts with items, remove one, verify subtotal = old - (price × qty)
    - **Property 6: Cross-customer cart isolation** — generate two customer IDs, verify operations on one cannot modify the other
    - **Property 7: Quantity update semantics** — generate quantities in [0, 99], verify set-to-zero removes, others set to min(qty, stock)
    - **Property 8: Invalid quantity rejection** — generate negative, non-integer, >99 values, verify rejection with cart unchanged
    - Append to `src/application/cart/CartService.property.test.ts`
    - **Validates: Requirements 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.5**

  - [ ]* 2.4 Write property tests for CartService — subtotal and save-for-later (Properties 9–12)
    - **Property 9: Subtotal and item count computation** — generate random CartItems, verify sum of (unitPrice × quantity) rounded to 2dp and sum of quantities
    - **Property 10: Unavailable items excluded from subtotal** — generate carts with some zero-stock variants, verify those excluded from subtotal
    - **Property 11: Save-for-later round trip** — generate CartItems, move to save-for-later and back, verify preservation
    - **Property 12: Save-for-later idempotency** — generate duplicate moves, verify no duplicate entries in save-for-later list
    - Append to `src/application/cart/CartService.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.6, 5.1, 5.2, 5.6**

- [x] 3. Application layer — CheckoutService facade
  - [x] 3.1 Implement CheckoutService with checkout orchestration
    - Create `src/application/cart/CheckoutService.ts` implementing `ICheckoutService` interface
    - Constructor accepts: `ICartService`, `ICartRepository`, `IPaymentProvider`, `IOrderRepository`, `IOrderMetadataRepository`, `IEventBus`, `IVariantRepository`, `CartConfig`, and a customer-fetching dependency (e.g., `ICustomerRepository` from account domain)
    - Implement `getAddresses(customerId)` — retrieve from Customer, sort by isDefault first then by createdAt descending
    - Implement `getDeliveryOptions()` — return configured delivery options from CartConfig
    - Implement `getPaymentMethods(customerId)` — retrieve from Customer, build PaymentMethodView array with prepaid first then COD, apply isPreferred selection logic
    - Implement `isHighRtoPincode(pincode)` — check against CartConfig.highRtoPincodes
    - Implement `validateStock(customerId)` — check each CartItem's quantity against current ProductVariant stock
    - Implement `placeOrder(customerId, params)` — orchestrate: validate stock → check empty cart → determine payment type → process payment (prepaid) or skip (COD) → create Order + OrderItems → persist via IOrderRepository → compute highRtoFlag and persist via IOrderMetadataRepository → clear cart → publish OrderPlaced event (with highRtoFlag in payload) with retry → return PlaceOrderResult
    - Handle payment timeout (30s), retry event publication (3×), retry cart clear (3×)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3, 13.4, 14.1, 14.4, 15.1, 15.2, 15.3, 15.4, 15.5, 16.5, 17.6, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 3.2 Write property tests for CheckoutService — address and delivery (Properties 13–15)
    - **Property 13: Address ordering at checkout** — generate random address sets with varying isDefault/createdAt, verify ordering: default first, then by createdAt descending
    - **Property 14: Delivery date range calculation** — generate delivery options with minDays/maxDays and current dates, verify range is [currentDate + minDays, currentDate + maxDays]
    - **Property 15: Order total composition** — generate subtotals and delivery costs, verify total = subtotal + deliveryOption.cost
    - Create `src/application/cart/CheckoutService.property.test.ts`
    - **Validates: Requirements 6.1, 7.1, 7.3, 9.2**

  - [ ]* 3.3 Write property tests for CheckoutService — payment and stock validation (Properties 16–18)
    - **Property 16: Payment methods ordering** — generate mixed payment method sets, verify prepaid (UPI/Card) always before COD
    - **Property 17: High-RTO pincode COD warning** — generate pincodes and payment types, verify warning shown iff pincode in list AND payment is COD
    - **Property 18: Stock validation gates order placement** — generate CartItems with varying stock levels, verify order rejected when any item exceeds stock
    - Append to `src/application/cart/CheckoutService.property.test.ts`
    - **Validates: Requirements 8.1, 8.6, 15.1, 15.2, 9.5**

  - [ ]* 3.4 Write property tests for CheckoutService — order creation (Properties 19–23)
    - **Property 19: Successful prepaid order creation** — generate valid checkout states with mock payment success, verify Order has status='placed', paymentType='prepaid', correct OrderItems with deliveryStatus='pending' and refundStatus none
    - **Property 20: Cart preserved on order failure** — generate payment failures/timeouts/persistence errors, verify all CartItems remain unchanged
    - **Property 21: COD order bypasses payment provider** — generate COD orders, verify IPaymentProvider never invoked, Order created with paymentType='cod'
    - **Property 22: Cart cleared on successful order** — generate successful orders (both prepaid and COD), verify cart has zero items after
    - **Property 23: OrderPlaced event publication** — generate successful orders, verify exactly one event published with correct payload; generate persistence failures, verify zero events
    - Create or append to `src/application/cart/CheckoutService.property.test.ts`
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.4, 12.1, 12.3, 13.2, 13.3**

- [x] 4. Checkpoint — Domain and Application layers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Infrastructure layer — InMemoryCartRepository and MockPaymentProvider
  - [x] 5.1 Implement InMemoryCartRepository
    - Create `src/infrastructure/persistence/InMemoryCartRepository.ts` implementing `ICartRepository`
    - Use a `Map<string, Cart>` keyed by customerId for storage (follows existing pattern: InMemoryCustomerRepository is in the same directory)
    - `findByCustomerId` returns the stored Cart or null
    - `save` stores the Cart by its customerId
    - _Requirements: 17.3, 17.4, 17.5_

  - [x] 5.2 Implement MockPaymentProvider
    - Create `src/infrastructure/payment/MockPaymentProvider.ts` implementing `IPaymentProvider`
    - Return success with deterministic transactionId `"mock-txn-{amount}-{currency}"` for valid amounts (0.01–999,999,999.99) and valid methods (UPI id ≠ "fail@test", Card lastFour ≠ "0000")
    - Return failure with "amount out of range" for amounts outside valid range
    - Return failure with "payment declined" for fail@test UPI or 0000 Card
    - _Requirements: 16.2, 16.3, 16.4_

  - [x] 5.2b Implement InMemoryOrderMetadataRepository
    - Create `src/infrastructure/persistence/InMemoryOrderMetadataRepository.ts` implementing `IOrderMetadataRepository`
    - Use a `Map<string, OrderMetadata>` keyed by orderId for storage
    - `save` stores the OrderMetadata by orderId
    - `findByOrderId` returns the stored OrderMetadata or null
    - _Requirements: 18.2, 18.3_

  - [ ]* 5.3 Write property tests for MockPaymentProvider (Property 25)
    - **Property 25: Mock payment provider determinism** — generate valid amounts and valid PaymentMethods, verify success with correct transactionId format; generate out-of-range amounts, verify failure
    - Create `src/infrastructure/payment/MockPaymentProvider.property.test.ts`
    - **Validates: Requirements 16.2, 16.3**

  - [ ]* 5.4 Write property tests for InMemoryCartRepository (Property 26)
    - **Property 26: Cart persistence round-trip** — generate random cart operation sequences, verify retrieval matches last successful mutation; generate unknown customer IDs, verify empty cart returned
    - Create `src/infrastructure/persistence/InMemoryCartRepository.property.test.ts`
    - **Validates: Requirements 17.1, 17.2, 17.4, 17.5**

- [ ] 6. Remaining property tests — canCheckout and High-RTO flag
  - [ ]* 6.1 Write property test for canCheckout (Property 24)
    - **Property 24: canCheckout reflects cart state** — generate carts with 0 to N items, verify canCheckout is true iff items.length > 0
    - Add to `src/application/cart/CartService.property.test.ts`
    - **Validates: Requirements 14.2, 14.3**

  - [ ]* 6.2 Write property test for High-RTO flag correctness (Property 27)
    - **Property 27: High-RTO flag correctness** — generate pincodes (in/out of RTO list), payment types (prepaid/cod), verify highRtoFlag = true iff (pincode in list AND paymentType is cod); verify flag never blocks placement
    - Add to `src/application/cart/CheckoutService.property.test.ts`
    - **Validates: Requirements 18.2, 18.3, 18.4, 18.5**

- [x] 7. Checkpoint — Infrastructure and property tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Application barrel export and composition root wiring
  - [x] 8.1 Create application/cart barrel export (index.ts)
    - Create `src/application/cart/index.ts` exporting CartService, CheckoutService, ICartService, ICheckoutService, CartView, CartOperationResult, PlaceOrderParams, PlaceOrderResult, StockValidationResult, PaymentMethodView, OrderItemSummary
    - _Requirements: all (module structure)_

  - [x] 8.2 Wire cart module into composition root
    - Create `src/application/cart-checkout-wiring.ts` following the `hero-path-wiring.ts` pattern
    - Instantiate InMemoryCartRepository, InMemoryOrderMetadataRepository, MockPaymentProvider
    - Instantiate CartService with ICartRepository + IVariantRepository
    - Instantiate CheckoutService with all dependencies (ICartService, ICartRepository, IPaymentProvider, IOrderRepository, IOrderMetadataRepository, IEventBus, IVariantRepository, CartConfig, ICustomerRepository)
    - Export an `initializeCartCheckoutWiring` function that takes shared dependencies (eventBus, orderRepository, variantRepository, customerRepository) and returns { cartService, checkoutService, dispose }
    - Register the `OrderPlaced` event type in the shared events if not already present
    - _Requirements: 16.5, 17.1_

- [x] 9. Presentation layer — React checkout components
  - [x] 9.1 Create CartPage component
    - Create `src/presentation/web/src/pages/checkout/CartPage.tsx`
    - Display cart items (name, image, quantity, unit price, condition), subtotal, item count
    - Implement quantity adjustment controls (increment, decrement, direct input with validation)
    - Implement remove button and save-for-later toggle
    - Display save-for-later section with move-back-to-cart action
    - Show checkout button (disabled when cart is empty, enabled within 1 second of adding an item)
    - Mark unavailable items visually and exclude from subtotal display
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 5.1, 5.2, 14.2, 14.3_

  - [x] 9.2 Create CheckoutLayout with step navigation
    - Create `src/presentation/web/src/pages/checkout/CheckoutLayout.tsx`
    - Implement step indicator showing: Address → Delivery → Payment → Review → Confirmation
    - Support back-navigation to any previous step preserving all selections
    - Halt checkout and redirect to cart if all items removed during checkout
    - _Requirements: 9.3, 14.4_

  - [x] 9.3 Create AddressStep component
    - Create `src/presentation/web/src/pages/checkout/AddressStep.tsx`
    - Display saved addresses ordered by default first, then most recent
    - Pre-select default address; allow selection change
    - Show add-address prompt if no addresses saved; prevent advance without address
    - Display error with retry on address load failure
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 9.4 Create DeliveryStep component
    - Create `src/presentation/web/src/pages/checkout/DeliveryStep.tsx`
    - Display delivery options (Standard ₹0, Express ₹49) with date ranges
    - Pre-select Standard; update displayed total on selection change
    - Show error with retry prevention on delivery option load failure
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.5 Create PaymentStep component
    - Create `src/presentation/web/src/pages/checkout/PaymentStep.tsx`
    - Display saved payment methods (prepaid first) + COD option
    - Pre-select preferred method or COD if none preferred
    - Show high-RTO warning within 1 second when COD + high-RTO pincode selected
    - Prevent advance without payment method selected
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 9.6 Create ReviewStep component
    - Create `src/presentation/web/src/pages/checkout/ReviewStep.tsx`
    - Display full order summary: items, address, delivery option, payment method
    - Show breakdown: subtotal + delivery charge = total
    - Detect out-of-stock or price changes; block placement until acknowledged
    - Implement Place Order button (disabled during payment processing to prevent double submission)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.6_

  - [x] 9.7 Create ConfirmationStep component
    - Create `src/presentation/web/src/pages/checkout/ConfirmationStep.tsx`
    - Display order ID, estimated delivery date, and purchased items summary (name, image, quantity, price)
    - Show error with retry on order failure, preserving cart contents
    - _Requirements: 13.1, 13.3_

  - [x] 9.8 Create presentation barrel export (index.ts)
    - Create `src/presentation/web/src/pages/checkout/index.ts` exporting all checkout page components
    - _Requirements: all (module structure)_

- [x] 10. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–27)
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout, fast-check for property-based testing, and Vitest as the test runner
- All infrastructure implementations (InMemoryCartRepository, MockPaymentProvider) are deterministic for demo mode
- The composition root wiring follows the established `hero-path-wiring.ts` pattern
- Existing entities (Customer, Address, PaymentMethod, Order, OrderItem, IOrderRepository, IVariantRepository, IEventBus) are imported but never modified

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.5b"] },
    { "id": 2, "tasks": ["1.6", "5.1", "5.2", "5.2b"] },
    { "id": 3, "tasks": ["2.1", "5.3", "5.4"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "6.1"] },
    { "id": 6, "tasks": ["6.2", "8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["9.1", "9.2"] },
    { "id": 9, "tasks": ["9.3", "9.4", "9.5"] },
    { "id": 10, "tasks": ["9.6", "9.7"] },
    { "id": 11, "tasks": ["9.8"] }
  ]
}
```
