# Implementation Plan: Accounts & Orders

## Overview

This plan builds the Accounts & Orders feature in dependency order. The domain and infrastructure
foundation comes first (domain types, repositories, `IdentityService`, seed data), then the
application facades, then the API layer, then the React UI. A working demo checkpoint — where the
hero path from login → My Orders → Order Detail → "Return or replace items" → Returns flow — is
reached before optional stretch tasks (Cognito, DynamoDB adapters).

The key integration concern: `IdentityService` must be wired as `IAuthService` into the already-
built `ReturnsFacade` before the demo runs, replacing the old `MockAuthService`.

## Tasks

- [x] 1. Domain types and interfaces — ordering, account, identity
  - [x] 1.1 Define ordering domain entities and `IOrderRepository`
    - Create `src/domain/ordering/RefundStatus.ts` — `RefundStatusCode` union, `RefundStatus` interface (`code`, `amount | null`, `currency | null`, `issuedAt: Date | null`)
    - Create `src/domain/ordering/OrderItem.ts` — `OrderItem` interface (`id`, `orderId`, `productId`, `variantId`, `productName`, `productImage`, `unitPrice`, `quantity`, `deliveryDate`, `deliveryStatus`, `refundStatus`)
    - Create `src/domain/ordering/Order.ts` — `OrderStatus` type, `PaymentType` type, `Order` interface (`id`, `customerId`, `placedDate`, `status`, `paymentType`, `items: OrderItem[]`)
    - Create `src/domain/ordering/IOrderRepository.ts` — `save`, `findById`, `findByCustomerId`, `findOrderItemById(id): Promise<{order, item} | null>`, `updateOrderItemRefundStatus`
    - Create `src/domain/ordering/index.ts` barrel
    - _Requirements: 7.1, 8.1, 10.1, 11.2, 12.1, 12.5_

  - [x] 1.2 Define account domain entities and `ICustomerRepository`
    - Create `src/domain/account/Address.ts` — `Address` interface with all required fields and `isDefault: boolean`
    - Create `src/domain/account/PaymentMethod.ts` — `UpiMethod`, `CardMethod`, `CodMethod` discriminated union; `PaymentMethod` type with `id`, `isPreferred`, `createdAt`
    - Create `src/domain/account/NotificationPreferences.ts` — `NotificationChannel` and `NotificationEventType` union types; `NotificationPreferences` matrix type; `defaultAllEnabled()` helper returning all `true` for all 5×4 combinations
    - Create `src/domain/account/Customer.ts` — `Customer` interface (`id`, `name`, `email`, `addresses`, `paymentMethods`, `notificationPreferences`, `createdAt`, `updatedAt`); `enforceDefaultInvariant(addresses): Address[]` pure function (single default, auto-promote on removal, preserve on add)
    - Create `src/domain/account/ICustomerRepository.ts` — `save`, `findById`, `findByContact`
    - Create `src/domain/account/errors.ts` — `CustomerNotFoundError`, `AddressNotFoundError`, `AddressValidationError`, `DuplicatePaymentMethodError`, `PaymentMethodCapExceededError`, `PaymentMethodNotFoundError`
    - Create `src/domain/account/index.ts` barrel
    - _Requirements: 3.4, 4.1, 4.4, 5.1, 5.4, 6.5, 12.2, 12.6_

  - [x] 1.3 Define identity domain value objects and `IOtpStore`
    - Create `src/domain/identity/OtpRecord.ts` — `OtpRecord` interface (`contact`, `code: string` (6-digit), `expiresAt`, `attemptsRemaining`, `customerId: string | null`, `lockedUntil: Date | null` — set when `attemptsRemaining` reaches 0 to enforce the cooldown period; `IdentityService` checks this field before processing any OTP attempt)
    - Create `src/domain/identity/Session.ts` — `Session` interface (`token`, `customerId`, `expiresAt`)
    - Create `src/domain/identity/IOtpStore.ts` — `saveOtp`, `findOtp`, `deleteOtp`, `saveSession`, `findSession`, `deleteSession`
    - Create `src/domain/identity/errors.ts` — `OtpInvalidError`, `OtpExpiredError`, `OtpMaxAttemptsError`, `OtpLockedError` (with `retryAfterMs`), `ContactAlreadyRegisteredError`, `ContactNotRegisteredError`, `SessionNotFoundError`
    - Create `src/domain/identity/index.ts` barrel
    - _Requirements: 1.3, 1.4, 2.3, 2.6_

  - [x] 1.4 Add `RefundIssuedEvent` to shared events catalogue and extend `AppConfig` with OTP settings
    - Append `RefundIssuedEvent` interface to `src/domain/shared/events.ts` with payload: `orderItemId`, `returnRequestId`, `amount: number`, `currency: string`, `issuedAt: string` (ISO 8601)
    - Export the new type from the shared events barrel
    - Add `otp: { validityMinutes: number; maxAttempts: number; lockoutMinutes: number }` section to the `AppConfig` type in `src/infrastructure/config/index.ts` with defaults: `validityMinutes: 10`, `maxAttempts: 3`, `lockoutMinutes: 15`
    - _Requirements: 1.3, 2.6, 10.1, 10.3, 10.4_

- [x] 2. In-memory infrastructure — repositories and OTP store
  - [x] 2.1 Implement `InMemoryOrderRepository`
    - `Map<string, Order>` for storage; `save` is an upsert by `id`
    - `findByCustomerId`: filter orders by `customerId`
    - `findOrderItemById`: scan all orders for a matching item id; return `{ order, item }` or `null`
    - `updateOrderItemRefundStatus`: locate item, overwrite `refundStatus` in place; no-op (log warning) if item not found — satisfies graceful unknown-order edge case (Req 10.3)
    - Write unit tests: round-trip save/find, customer isolation, idempotent refund update, no-op on unknown id
    - _Requirements: 7.1, 10.3, 12.5_

  - [x] 2.2 Implement `InMemoryCustomerRepository`
    - `Map<string, Customer>` for storage; `save` is an upsert by `id`
    - `findByContact`: linear scan on `email` field (sufficient for demo scale)
    - Write unit tests: round-trip save/find, findByContact, upsert semantics
    - _Requirements: 3.4, 4.1, 12.6_

  - [x] 2.3 Implement `InMemoryOtpStore`
    - Two `Map`s: `Map<contact, OtpRecord>` and `Map<token, Session>`
    - TTL enforced on read: entries with `expiresAt < Date.now()` are treated as absent and lazily deleted
    - All six `IOtpStore` methods implemented
    - Write unit tests: TTL expiry, overwrite semantics, session round-trip
    - _Requirements: 1.2, 2.2, 2.3_

- [x] 3. Seed data — extend existing seed with account and ordering data
  - [x] 3.1 Update `src/infrastructure/seed/index.ts` with canonical demo constants and new seed objects
    - Export `DEMO_CUSTOMER_ID = 'customer-001'` (keeps existing ID — no break to existing Returns tests), `DEMO_SESSION_TOKEN = 'demo-session-token'`, `DEMO_EMAIL = 'priya@example.com'`
    - Export `demoCustomer: Customer` — fixed id/name/email, one default address (Bengaluru), UPI + COD payment methods, `defaultAllEnabled()` notification prefs
    - Export `demoPrepaidOrder: Order` — status `delivered`, paymentType `prepaid`, two items:
      - `order-item-001` (productId `item-grade-a`, `unitPrice: 1299`, `deliveryDate: now - 2 days` — inside 30-day window)
      - `oi-demo-ineligible` (productId `prod-demo-2`, `unitPrice: 299`, `deliveryDate: now - 45 days` — outside window)
    - Export `demoCodOrder: Order` — status `delivered`, paymentType `cod`, one item inside return window
    - All delivery dates computed from `Date.now()` at module evaluation time
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 3.2 Write seed idempotence test
    - Construct `InMemoryOrderRepository` and `InMemoryCustomerRepository` from seed data twice
    - Assert both repos contain exactly one demo customer and the same demo orders after both constructions
    - Property: `Map.set(id, v)` semantics ensure no duplicates
    - _Requirements: 13.1 (seed idempotence correctness property)_

- [x] 4. `IdentityService` — implements both `IAuthService` and `IIdentityService`
  - [x] 4.1 Implement `IIdentityService` interface and `IdentityService` class
    - Create `src/application/identity/IIdentityService.ts` — `sendOtp`, `verifyOtp`, `logout` (separate from `IAuthService` — no extension)
    - Create `src/application/identity/IdentityService.ts` implementing both `IIdentityService` and `IAuthService`
    - Constructor: `(customerRepo: ICustomerRepository, orderRepo: IOrderRepository, otpStore: IOtpStore, config: AppConfig)`
    - `sendOtp(contact)`: validate contact format (RFC 5322 email or E.164 phone); check `customerRepo.findByContact`; if existing customer treat as login (set `customerId` on `OtpRecord`); generate 6-digit code; save `OtpRecord` with `expiresAt = now + config.otp.validityMinutes`; return `{ otpSent: true, isExistingCustomer }`
    - `verifyOtp(contact, code)`: load OTP record; if `lockedUntil` is set and `lockedUntil > Date.now()` throw `OtpLockedError({ retryAfterMs: lockedUntil - Date.now() })`; throw `OtpExpiredError` if expired; decrement `attemptsRemaining`; if `attemptsRemaining` reaches 0 set `lockedUntil = now + config.otp.lockoutMinutes * 60_000`; throw `OtpInvalidError` (remaining > 0) or `OtpLockedError` (remaining = 0) on wrong code; on success: create `Customer` if new (empty addresses/paymentMethods, `defaultAllEnabled()` prefs) or load existing; create `Session`; delete OTP record; return `{ token, customerId }`
    - `logout(token)`: delete session from `otpStore`
    - `authenticate(token)`: find session; check expiry; load customer; return `IAuthService.Customer` projection or `null`
    - `verifyOwnership(customerId, orderItemId)`: delegate to `orderRepo.findOrderItemById`; compare `item.customerId`
    - `getOrderItem(orderItemId)`: delegate to `orderRepo.findOrderItemById`; map `unitPrice → price` for `IAuthService.OrderItem` projection; return `null` if not found
    - `getOrderItemsByCustomer(customerId)`: `orderRepo.findByCustomerId`; flatMap items; filter by `customerId`; map to `IAuthService.OrderItem` projection
    - Create `src/application/identity/index.ts` barrel
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 4.2 Write unit tests for `IdentityService`
    - OTP send → verify round-trip for new customer: creates `Customer` with empty book + `defaultAllEnabled()` prefs
    - OTP send for existing contact → `isExistingCustomer: true`; after verify, returns existing customer
    - Wrong OTP: decrements attempts; throws `OtpInvalidError`; after 3 failures throws `OtpMaxAttemptsError`
    - Expired OTP: throws `OtpExpiredError`
    - `authenticate` with valid token → correct customer; expired token → `null`
    - `verifyOwnership` correctness property: result equals `getOrderItem(i)?.customerId === c`
    - `getOrderItemsByCustomer` isolation: items for customer A never appear in customer B's result
    - _Requirements: 2 (correctness properties), 11 (correctness properties)_

  - [x] 4.3 Write property-based test for `IAuthService` correctness properties
    - **Property: Ownership correctness** — for any seeded (customerId, orderItemId), `verifyOwnership` returns `true` iff `getOrderItem(orderItemId)?.customerId === customerId`
    - **Property: Customer isolation** — for any two distinct customers C1, C2 seeded in `InMemoryOrderRepository`, `getOrderItemsByCustomer(C1.id)` and `getOrderItemsByCustomer(C2.id)` are disjoint by `id`
    - **Property: Round-trip authentication** — for any `Session` saved via `otpStore.saveSession`, `authenticate(token)` returns a customer with matching `id`
    - _Requirements: 2 (correctness properties), 11 (correctness properties)_

- [x] 5. `AccountService` facade
  - [x] 5.1 Implement `IAccountService` interface and `AccountService` class
    - Create `src/application/account/AccountService.ts` implementing `IAccountService`
    - Constructor: `(customerRepo: ICustomerRepository)`
    - `getCustomer(customerId)`: delegate to repo; return `null` if not found
    - `updateProfile(customerId, { name })`: trim name; throw `AddressValidationError` if empty/whitespace; load customer; update `name` and `updatedAt`; save; return updated customer
    - `addAddress(customerId, fields)`: validate all required fields (trim + non-empty; pincode must match `/^\d{6}$/`); throw `AddressValidationError` with `invalidFields` if any fail; generate id; set `isDefault: false`; call `enforceDefaultInvariant` to preserve existing default; save; return updated customer
    - `updateAddress(customerId, addressId, fields)`: load customer; find address; apply field updates with same validation; call `enforceDefaultInvariant`; save
    - `removeAddress(customerId, addressId)`: load customer; remove address; call `enforceDefaultInvariant` (auto-promotes most-recent if default removed); save
    - `setDefaultAddress(customerId, addressId)`: load customer; mark target as default; call `enforceDefaultInvariant` to remove old default; save
    - `addPaymentMethod(customerId, method)`: validate (UPI ID format, card fields); throw `DuplicatePaymentMethodError` on duplicate UPI; throw `PaymentMethodCapExceededError` at 10 methods; do NOT store full card number; generate id; `isPreferred: false`; save
    - `removePaymentMethod(customerId, methodId)`: load customer; remove; save
    - `getPaymentMethods(customerId)`: `getCustomer → customer.paymentMethods`
    - `updateNotificationPreferences(customerId, prefs)`: deep-merge partial prefs onto current; save; return updated customer
    - Create `src/application/account/index.ts` barrel
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.5, 12.2, 12.4_

  - [x] 5.2 Write unit tests for `AccountService`
    - `updateProfile`: valid name persists; empty name throws; whitespace-only name throws
    - `addAddress`: all fields valid → added; any field missing → `AddressValidationError` with correct field names; pincode non-6-digit → error
    - `removeAddress` (non-default): default unchanged
    - `removeAddress` (default, others remain): next most-recent becomes default
    - `removeAddress` (last address): empty book, no default
    - `setDefaultAddress`: only one default at a time
    - `addPaymentMethod`: UPI duplicate rejected; card masked (no full number); cap at 10
    - `removePaymentMethod`: removes correctly; throws `PaymentMethodNotFoundError` for unknown `methodId` (Req 5.2 edge case — maps to 404 in API)
    - `updateNotificationPreferences`: partial update merges, does not overwrite unmentioned prefs
    - _Requirements: 3, 4, 5, 6_

  - [x] 5.3 Write property-based tests for address book invariants
    - **Property A: Single-default invariant** — using fast-check, generate arbitrary sequences of `addAddress`, `removeAddress`, `setDefaultAddress` operations; assert `addresses.filter(a => a.isDefault).length` is always 0 or 1
    - **Property: Add does not change default** — for any customer with an existing default, `addAddress` without explicit `isDefault=true` leaves the previous default unchanged
    - **Property: Round-trip profile update** — for any valid non-empty name N, `updateProfile(id, {name:N})` then `getCustomer(id)` returns customer with `name === N`
    - _Requirements: 3 (correctness property), 4 (correctness properties)_

- [x] 6. `OrdersService` facade and `RefundIssued` subscriber
  - [x] 6.1 Implement `IOrdersService` interface and `OrdersService` class
    - Create `src/application/ordering/OrdersService.ts` implementing `IOrdersService`
    - Constructor: `(orderRepo: IOrderRepository, returnsFacade: IReturnsFacade, eventBus: IEventBus)` — subscribes to `'RefundIssued'` in constructor body
    - `getOrdersByCustomer(customerId)`: `orderRepo.findByCustomerId`; sort by `placedDate` descending
    - `getOrderDetail(customerId, orderId)`: `orderRepo.findById`; return `null` if not found OR `order.customerId !== customerId` (no data leak)
    - `updateRefundStatus(orderItemId, refundStatus)`: `orderRepo.updateOrderItemRefundStatus`; if not found: log warning and return (no throw)
    - `checkReturnEligibility(customerId, orderItemId)`: delegate to `returnsFacade.checkEligibility(customerId, orderItemId)`; catch any exception and return `{ eligible: false, daysRemaining: null, policyExpirationDate: null, productName: '', productImage: '', orderDate: new Date(0), errorMessage: 'Eligibility check temporarily unavailable' }`
    - `RefundIssued` subscriber (wired in constructor): extract `{ orderItemId, amount, currency, issuedAt }` from payload; call `updateRefundStatus`; last-write-wins overwrite ensures idempotence
    - Create `src/application/ordering/index.ts` barrel; import only `IReturnsFacade` interface from returns module (never internals)
    - _Requirements: 7.1, 8.1, 8.5, 9.1, 9.5, 10.1, 10.3, 10.4, 12.1, 12.3, 12.5_

  - [x] 6.2 Write unit tests for `OrdersService`
    - `getOrdersByCustomer`: returns only orders with matching `customerId`; sorted most-recent-first; empty array when none
    - `getOrderDetail`: returns order for owner; returns `null` for wrong customer; returns `null` for unknown orderId
    - `updateRefundStatus`: updates item correctly; no-op + no throw for unknown orderItemId; when called twice with different amounts, the second call's amount wins (overwrite, not accumulate — Req 10.4)
    - `checkReturnEligibility`: eligible item returns `eligible: true`; out-of-window item returns `eligible: false`; `IReturnsFacade` error returns `eligible: false` (no rethrow)
    - `RefundIssued` event: fires subscriber; verifies `refundStatus` updated to `refund_issued` with correct amount; second identical event produces same state (idempotent); second event with different amount overwrites first (last-write-wins — Req 10.4)
    - _Requirements: 7, 8, 9.5, 10_

  - [x] 6.3 Write property-based tests for `OrdersService` correctness properties
    - **Property B: Customer isolation** — for any two distinct customers, `getOrdersByCustomer` results are disjoint by order id
    - **Property C: Idempotent refund reflection** — processing `RefundIssued(orderItemId, amount)` N times produces the same `refundStatus` as processing it once
    - **Property: Graceful unknown-order handling** — processing `RefundIssued` for a non-existent `orderItemId` does not throw and does not alter any other item's `refundStatus`
    - _Requirements: 7 (correctness property), 10 (correctness properties)_

- [x] 7. Update DI composition root — wire `IdentityService` as `IAuthService`
  - [x] 7.1 Update `src/infrastructure/config/container.ts` to register new services
    - Construct `InMemoryCustomerRepository([demoCustomer])` and `InMemoryOrderRepository([demoPrepaidOrder, demoCodOrder])` and `InMemoryOtpStore()`
    - Pre-seed demo session: `otpStore.saveSession({ token: DEMO_SESSION_TOKEN, customerId: DEMO_CUSTOMER_ID, expiresAt: far future })`
    - Construct `IdentityService(customerRepo, orderRepo, otpStore, config)` — implements both `IAuthService` and `IIdentityService`
    - Register `identityService` under `'authService'` key (replacing `MockAuthService`) so `ReturnsFacade` receives the new implementation — `ReturnsFacade` constructor already accepts `IAuthService`
    - Construct `AccountService(customerRepo)` and register
    - Construct `OrdersService(orderRepo, returnsFacade, eventBus)` — subscribes to `RefundIssued` at construction
    - Register `ordersService`
    - Add `identityService` and `accountService` and `ordersService` to `ContainerRegistry` type map
    - Extend `InMemoryDemandSignalProvider` seed with `item-grade-a` → existing signal AND `prod-demo-1` → new demo signal
    - Remove `loadSeedData({ authService: MockAuthService })` call — seed data is now passed to repo constructors
    - Run `vitest --run` after wiring; confirm all tests in `ReturnsFacade.test.ts` and `hero-path-wiring.test.ts` pass without modification — the tests use their own `createMockAuthService()` and are unaffected by the container change
    - _Requirements: 11.4, 11.5, 12.1, 12.2, 12.5, 12.6, 13.1, 13.4_

- [x] 8. API routes — identity, account, orders
  - [x] 8.1 Implement `src/presentation/api/identityRoutes.ts`
    - `POST /identity/otp/send` — call `identityService.sendOtp(contact)`; 409 on `ContactAlreadyRegisteredError` (treated as redirect-to-login, not error — return `{ isExistingCustomer: true }`); 400 on invalid contact format
    - `POST /identity/otp/verify` — call `identityService.verifyOtp(contact, code)`; return `{ token }`; 401 on `OtpInvalidError`/`OtpExpiredError`; 429 on `OtpLockedError` with `retryAfterMs`
    - `POST /identity/logout` — call `identityService.logout(token)` from Authorization header; 200 always (idempotent)
    - `GET /identity/me` — call `identityService.authenticate(token)`; return customer; 401 if null
    - Auth middleware helper: extract `Authorization: Bearer <token>` header; call `authenticate`; attach to request context; respond 401 if absent or invalid
    - _Requirements: 1.1, 2.1, 2.4, 2.5, 2.6, 14.1, 14.4_

  - [x] 8.2 Implement `src/presentation/api/accountRoutes.ts`
    - All routes require auth middleware (401 if unauthenticated)
    - All routes extract `customerId` from authenticated session; return 403 if path param customerId doesn't match session (cross-customer guard)
    - `GET /account/profile` → `accountService.getCustomer`
    - `PUT /account/profile` → `accountService.updateProfile`; 400 on `AddressValidationError` (reused for name validation)
    - `GET /account/addresses` → `accountService.getCustomer().addresses` sorted default-first
    - `POST /account/addresses` → `accountService.addAddress`; 400 on `AddressValidationError`
    - `PUT /account/addresses/:id` → `accountService.updateAddress`; 404 on `AddressNotFoundError`
    - `DELETE /account/addresses/:id` → `accountService.removeAddress`; 404 on `AddressNotFoundError`
    - `PUT /account/addresses/:id/default` → `accountService.setDefaultAddress`; 404 on `AddressNotFoundError`
    - `GET /account/payment-methods` → `accountService.getPaymentMethods`
    - `POST /account/payment-methods` → `accountService.addPaymentMethod`; 409 on `DuplicatePaymentMethodError`; 400 on cap exceeded
    - `DELETE /account/payment-methods/:id` → `accountService.removePaymentMethod`; 404 on `PaymentMethodNotFoundError`
    - `GET /account/notifications` → `accountService.getCustomer().notificationPreferences`
    - `PUT /account/notifications` → `accountService.updateNotificationPreferences`
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.6, 5.1, 5.2, 5.3, 6.1, 6.2, 14.3_

  - [x] 8.3 Implement `src/presentation/api/ordersRoutes.ts`
    - All routes require auth middleware
    - `GET /orders` → `ordersService.getOrdersByCustomer(session.customerId)`; return array sorted newest-first
    - `GET /orders/:orderId` → `ordersService.getOrderDetail(session.customerId, orderId)`; 404 if null (cross-customer returns null → 404, no data leak)
    - `GET /orders/items/:orderItemId/eligibility` → `ordersService.checkReturnEligibility(session.customerId, orderItemId)`; always returns 200 with eligibility result (errors surface as `eligible: false`)
    - Register routes in `src/presentation/api/index.ts` and `server.ts`
    - _Requirements: 7.1, 7.3, 8.1, 8.4, 9.1, 9.5, 14.3, 14.4_

- [x] 9. React frontend — app shell, shared components, and auth screens
  - [x] 9.0 Scaffold React app shell, route config, and `SkeletonLoader` component
    - Update `src/presentation/web/src/main.tsx` (or `App.tsx`) to configure React Router with all routes:
      - `/login` → `<LoginPage />`
      - `/orders` → `<AuthGuard><OrdersListPage /></AuthGuard>`
      - `/orders/:orderId` → `<AuthGuard><OrderDetailPage /></AuthGuard>`
      - `/account/profile` → `<AuthGuard><ProfilePage /></AuthGuard>`
      - `/account/addresses` → `<AuthGuard><AddressBookPage /></AuthGuard>`
      - `/account/payment-methods` → `<AuthGuard><PaymentMethodsPage /></AuthGuard>`
      - `/account/notifications` → `<AuthGuard><NotificationPrefsPage /></AuthGuard>`
    - Create `src/presentation/web/src/components/SkeletonLoader.tsx` — reusable animated pulse skeleton block; accepts optional `height` and `width` props; used by all pages while data loads (Req 14.4, 7.5, 8.6)
    - Create `src/presentation/web/src/components/OrderCard.tsx` — stub placeholder (filled in task 11.1)
    - _Requirements: 9.6, 14.1, 14.4, 15.1_

  - [x] 9.1 Scaffold auth context, `AuthGuard`, and `useAuth` hook
    - Create `src/presentation/web/src/contexts/AuthContext.tsx` — stores `{ customer, sessionToken, loading }` in context; reads token from `localStorage` on init; calls `GET /identity/me` to validate
    - Create `src/presentation/web/src/components/AuthGuard.tsx` — if `loading` render `<SkeletonLoader />`; if no customer navigate to `/login?returnTo=<currentPath>`; else render children (Req 14.4 — no personal data before auth confirmed)
    - Create `src/presentation/web/src/hooks/useAuth.ts` — returns context values + `login(token)` / `logout()` helpers
    - Add `<AuthGuard>` wrapping to routes: `/orders`, `/orders/:orderId`, `/account/*`
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 9.2 Build `LoginPage` and `SignUpPage`
    - `LoginPage` (`/login`): contact input (email or phone); "Send OTP" → `POST /identity/otp/send`; on success navigate to `OtpVerifyPage`; preserve `returnTo` query param
    - `OtpVerifyPage`: 6-digit code input; "Verify" → `POST /identity/otp/verify`; on success store token in `localStorage`, update auth context, navigate to `returnTo` or `/orders`
    - Inline error messages: invalid OTP (Req 1.3), expired OTP with "Resend" button (Req 1.4), locked state with countdown timer (Req 2.6)
    - `SignUpPage`: same form — backend handles new-vs-existing transparently (Req 1.5)
    - Mobile-first layout; all inputs keyboard-accessible; WCAG AA contrast (Req 15.3, 15.4)
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.2, 2.5, 2.6, 15.1, 15.3, 15.4_

- [x] 10. React frontend — account pages
  - [x] 10.1 Build `ProfilePage` with inline name editing
    - `GET /account/profile` on mount; display name and masked contact (email or `+91 ****XXXX`)
    - Inline edit: click to enable text input (1–100 chars); `PUT /account/profile`; optimistic update + confirm; inline error on empty/whitespace name (Req 3.2, 3.3)
    - Skeleton loader while loading (Req 3.1 — 2s display requirement)
    - _Requirements: 3.1, 3.2, 3.3, 15.1, 15.3_

  - [x] 10.2 Build `AddressBookPage` with add/edit/remove/default controls
    - `GET /account/addresses`; render list default-first; each address card shows fields
    - "Add address" form: all 6 required fields; pincode 6-digit validation; per-field inline errors (Req 4.6)
    - Edit: inline form pre-filled with existing values
    - Remove: confirmation prompt; no-op on last address (shows empty state)
    - "Set as default" button: only shown on non-default addresses
    - Optimistic UI: update list immediately, revert on API error
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 15.1_

  - [x] 10.3 Build `PaymentMethodsPage` with add/remove controls
    - `GET /account/payment-methods`; render each method with type label and masked details
    - "Add UPI": text input for UPI ID; inline error on duplicate (Req 5.3)
    - "Add card": inputs for last-four, expiry month, expiry year, cardholder name; display only — no full card number stored (Req 5.4)
    - "Add COD": one-tap add
    - Remove button per method
    - Skeleton loader; 2s display target (Req 5.5)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 15.1_

  - [x] 10.4 Build `NotificationPrefsPage` with toggle matrix
    - `GET /account/notifications`; render 5 event types × 4 channels as toggle grid
    - Each toggle calls `PUT /account/notifications` with the changed cell; optimistic update (toggle instantly, revert on error with error toast — Req 6.2)
    - Skeleton loader; 2s display target (Req 6.1)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 15.1_

- [x] 11. React frontend — orders pages and return entry point
  - [x] 11.1 Build `OrdersListPage` (`/orders`)
    - `GET /orders`; render `<OrderCard>` per order, sorted newest-first
    - Each `<OrderCard>`: last-8-chars order id, placed date, overall status badge, first product image + name, item count
    - Skeleton loaders while fetching (Req 7.5 — no full-screen block); error state with retry (Req 7 implied)
    - Empty state: "You have no orders yet" with link to home (Req 7.4)
    - Each card is a link to `/orders/:orderId` (Tap 1 of the ≤3-tap path)
    - Mobile-first; all product images have `alt="{productName}"` (Req 15.2); WCAG AA contrast (Req 15.3)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3_

  - [x] 11.2 Build `OrderDetailPage` (`/orders/:orderId`) and `OrderItemRow` component with return button
    - `GET /orders/:orderId`; if 404 display not-found message (no data leak — Req 8.5)
    - Order header: full order id, placed date, payment type badge, overall status
    - Per item: `<OrderItemRow>` with product image (alt=`"{productName}"`, Req 15.2), name, qty, unit price (₹), delivery date, delivery status badge, refund badge when `refundStatus.code === 'refund_issued'` (shows amount with `₹` symbol — Req 10.2)
    - Skeleton loader per item section while data loads (Req 8.6)
    - Not-found message for cross-customer access (Req 8.5)
    - Fire `GET /orders/items/:id/eligibility` in **parallel** for all items (Req 9.4) — show per-item skeleton while loading
    - `<OrderItemRow>` renders "Return or replace items" button **only** when `eligibility.eligible === true` (Req 9.1); no placeholder for ineligible items (Req 9.3); on error → no button (Req 9.5)
    - Button `aria-label="Return or replace {productName}"` for screen reader distinction (Req 15.5)
    - Button tap navigates to `/returns/eligibility?orderItemId={id}` (Tap 3 of ≤3-tap path — Req 9.2, 9.6)
    - Visible focus state on return button (Req 15.5); keyboard navigable (Req 15.4)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.2, 10.5, 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 12. Checkpoint — Demo hero path works end-to-end locally
  - Run `vitest --run`; all tests must pass
  - Manually verify the full hero path in a browser:
    1. Navigate to `/orders` unauthenticated → redirected to `/login?returnTo=/orders`
    2. Send OTP with demo email; enter demo OTP; redirected back to `/orders`
    3. See demo prepaid order card (Wireless Headphones + Phone Case)
    4. Click order → Order Detail shows both items; headphones have "Return or replace items" button; phone case does NOT (ineligible)
    5. Click "Return or replace items" → navigates to Returns eligibility screen with `?orderItemId=order-item-001`
  - Verify `RefundIssued` reflection: manually publish event via test script; reload Order Detail; confirm refund badge appears on the item

- [x] 13. Property-based tests for ordering domain correctness properties
  - [x] 13.1 Write PBT for customer isolation invariant
    - **Property B: Customer isolation** — generate N customers each with M orders; assert `getOrdersByCustomer(C.id)` contains only orders where `customerId === C.id`
    - **Validates: Requirement 7 correctness property**

  - [x] 13.2 Write PBT for idempotent refund reflection
    - **Property C: Idempotent refund reflection** — generate random `(orderItemId, amount)` pairs; call `updateOrderItemRefundStatus` 1×, 2×, 5× with the same values; assert final state is identical after all repetitions
    - **Validates: Requirement 10 correctness properties**

  - [x] 13.3 Write PBT for seed idempotence
    - **Property D: Seed idempotence** — construct repositories from seed data multiple times; assert identical state each time (no duplication)
    - **Validates: Requirement 13 correctness property**

  - [x] 13.4 Write PBT for address book single-default invariant
    - **Property A: Single-default invariant** — generate arbitrary sequences of add/remove/setDefault operations; assert `addresses.filter(a => a.isDefault).length` is always 0 or 1 after every operation
    - **Validates: Requirement 4 correctness property**

- [x] 14. Optional/Stretch — Cognito live adapter
  - [x] 14.1 Implement `CognitoAuthAdapter` for `IAuthService`
    - Verify Cognito JWT tokens via `CognitoIdentityProviderClient.getUser()`
    - Map Cognito `sub` claim to `customerId`; delegate ownership/order-item queries to `DynamoOrderRepository`
    - Config toggle: `COGNITO_ENABLED=true` swaps in this adapter at the composition root
    - _Requirements: 1.7, 2.3, 2.7_

- [x] 15. Optional/Stretch — DynamoDB adapters for customer and order data
  - [x] 15.1 Implement `DynamoCustomerRepository`
    - Implements `ICustomerRepository` using DynamoDB per the table design in design.md
    - Upsert via `PutItem` with `updatedAt` condition for optimistic locking
    - `findByContact`: Query on GSI1 (`email` PK)
    - _Requirements: 12.2, 12.6_

  - [x] 15.2 Implement `DynamoOrderRepository`
    - Implements `IOrderRepository` using Orders + OrderItems tables per the design
    - `findByCustomerId`: Query on GSI1 (`customerId` PK, `placedDate` SK) — returns sorted result
    - `findOrderItemById`: Query on OrderItems GSI1 (`orderItemId` PK)
    - `updateOrderItemRefundStatus`: `UpdateItem` on the item; no-op (log) if item not found (conditional expression)
    - _Requirements: 12.1, 12.5_

## Notes

- Tasks marked with `*` are optional stretch goals — skip for the demo
- Tasks 1–12 deliver the full working demo with zero AWS credentials
- The key wiring constraint in Task 7.1: `IdentityService` must be registered under `'authService'` in the container so `ReturnsFacade` (already built) receives the new implementation — no changes to `ReturnsFacade` itself
- Existing `ReturnsFacade.test.ts` and `hero-path-wiring.test.ts` continue to use their own mock auth service and are unaffected by the container change (Task 7.2 verifies this)
- `OrdersService.checkReturnEligibility` wraps `IReturnsFacade` in a try/catch so a Returns-feature error never propagates to the ordering module (module boundary safety)
- Seed demo IDs preserve `customer-001` / `order-item-001` to avoid breaking existing Returns feature tests
- Property-based tests in Tasks 4.3, 5.3, 6.3, 13.x validate the correctness properties from requirements
- All new files follow the existing project conventions: `.ts` extension, ESM imports with `.js` suffix, Vitest for tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 8, "tasks": ["9.0", "9.1", "9.2"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["12"] },
    { "id": 12, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 13, "tasks": ["14.1", "15.1", "15.2"] }
  ]
}
```
