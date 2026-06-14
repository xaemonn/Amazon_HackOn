# Requirements Document

## Introduction

Accounts & Orders is the storefront foundation of Second Life Commerce. It owns the customer identity
lifecycle (sign-up, login, session), the customer profile (addresses, payment methods, notification
preferences), the My Orders list, and the Order Detail page. Critically, the Order Detail page is the
seam through which a customer enters the Zero-Touch Returns feature: a "Return or replace items" button
is rendered per eligible item and navigates into the Returns feature's eligibility screen. This feature
also owns `IAuthService` — the shared interface already consumed by the Returns feature — and must
provide both a live Amazon Cognito adapter and a deterministic mock that replaces the existing
`MockAuthService`. A `RefundIssued` domain event subscription keeps the order view up to date with
refund status and amounts issued by the Returns feature.

---

## Glossary

- **Identity_Module**: The module responsible for customer authentication, session management, and
  ownership verification. Owns and implements `IAuthService`.
- **Ordering_Module**: The module responsible for order list retrieval, order detail display, and
  refund status reflection. Exposes `OrdersService` facade backed by `IOrderRepository`.
- **Account_Module**: The module responsible for customer profile, address book, saved payment methods,
  and notification preferences. Exposes `AccountService` facade backed by `ICustomerRepository`.
- **IAuthService**: The shared adapter interface for authentication and ownership verification,
  located at `src/domain/shared/IAuthService.ts`. Owned by this feature; consumed by the Returns
  feature.
- **IOrderRepository**: The repository interface for Order and OrderItem persistence. Implementations
  include an in-memory repository for local/demo and a DynamoDB adapter as a stretch goal.
- **ICustomerRepository**: The repository interface for Customer persistence. Implementations include
  an in-memory repository for local/demo and a DynamoDB adapter as a stretch goal.
- **IReturnsFacade**: The facade interface exposed by the Zero-Touch Returns feature. The Order Detail
  page calls `IReturnsFacade.checkEligibility` to determine per-item button visibility.
- **Customer**: A registered user of the platform with a unique identifier, name, email, address book,
  and saved payment methods.
- **Order**: A record of a completed purchase, containing one or more Order Items, a placed date, a
  payment type, and a lifecycle status.
- **OrderItem**: A single product variant within an Order, carrying a delivery date, unit price,
  quantity, and product reference. The delivery date drives return eligibility.
- **Address**: A named delivery address belonging to a Customer. One address in the book is designated
  as the default.
- **PaymentMethod**: A stored payment instrument belonging to a Customer, typed as UPI, card, or COD.
- **Return_Window**: The configurable number of days after an item's delivery date during which a
  return may be initiated. Owned by the Returns feature; the Order Detail page queries it via
  `IReturnsFacade.checkEligibility`.
- **RefundIssued**: A domain event published by the Returns feature when a refund is issued. The
  Ordering_Module subscribes to this event to update the order's refund status and amount.
- **Demo_Customer**: A seeded Customer record used for local/demo runs, pre-loaded with at least one
  Order containing a DELIVERED item whose delivery date falls within the configured Return_Window.
- **Event_Bus**: The internal pub-sub mechanism used for cross-module communication via domain events.
- **OTP**: A one-time passcode delivered to a customer's email or phone for identity verification
  during sign-up and login.
- **Session_Token**: An opaque bearer token issued after successful authentication, used to identify
  the caller in subsequent requests.

---

## Requirements

### Requirement 1: Customer Sign-Up

**User Story:** As a new visitor, I want to create an account using my email address or phone number
and a one-time passcode, so that I have a secure identity on the platform without needing a password.

#### Acceptance Criteria

1. WHEN a visitor submits a valid email address or a valid phone number, THE Identity_Module SHALL
   send an OTP to that contact and display a passcode entry screen within 5 seconds.
2. WHEN the visitor enters the correct OTP within a configurable validity window (default 10 minutes),
   THE Identity_Module SHALL create a Customer record with a unique identifier, store the verified
   contact, and issue a Session_Token.
3. IF the visitor enters an incorrect OTP, THEN THE Identity_Module SHALL display an inline error
   message indicating the code is invalid and allow the visitor to re-enter the OTP without
   restarting the flow, up to a configurable maximum attempt count (default 3).
4. IF the OTP validity window expires before the visitor submits a code, THEN THE Identity_Module
   SHALL display an expiry message and offer the visitor an option to request a new OTP without
   re-entering their contact details.
5. IF a visitor attempts to sign up with a contact that already has a registered Customer record,
   THEN THE Identity_Module SHALL treat the request as a login attempt and proceed to the login
   OTP flow rather than creating a duplicate Customer.
6. WHEN a Customer record is successfully created, THE Identity_Module SHALL seed the new Customer
   with an empty address book and an empty payment method list.
7. THE Identity_Module SHALL expose a deterministic mock implementation that accepts a pre-configured
   contact and OTP pair, always issues the same Session_Token for that pair, and never makes a
   network call to an external authentication provider.

---

### Requirement 2: Customer Login and Session Management

**User Story:** As a returning customer, I want to log in with my email or phone and a one-time
passcode and stay logged in across page loads, so that I can access my orders without signing in
repeatedly.

#### Acceptance Criteria

1. WHEN a returning customer submits a registered email or phone number, THE Identity_Module SHALL
   send an OTP to that contact and display a passcode entry screen within 5 seconds.
2. WHEN the customer enters the correct OTP within the validity window, THE Identity_Module SHALL
   issue a Session_Token and redirect the customer to the page they were attempting to access, or
   to the home page if no destination was recorded.
3. WHILE a valid Session_Token is present in the customer's session, THE Identity_Module SHALL
   authenticate the customer on each request without requiring a new OTP.
4. WHEN a customer explicitly logs out, THE Identity_Module SHALL invalidate the Session_Token and
   redirect the customer to the home page.
5. IF a request arrives with an expired or invalid Session_Token, THEN THE Identity_Module SHALL
   reject the request with an unauthenticated status and redirect the customer to the login screen,
   preserving the originally requested URL as the post-login destination.
6. IF the OTP for login is entered incorrectly more than the configurable maximum attempt count
   (default 3), THEN THE Identity_Module SHALL lock the login attempt for a configurable cooldown
   period (default 15 minutes) and display the remaining wait time to the customer.
7. THE Identity_Module SHALL accept a Session_Token via `IAuthService.authenticate(token)` and
   return the corresponding Customer, or null if the token is invalid or expired.

#### Correctness Properties

- **Round-trip authentication**: FOR ALL valid Session_Tokens T issued by the Identity_Module,
  `IAuthService.authenticate(T)` SHALL return a Customer whose identifier matches the Customer for
  whom T was issued.
- **Idempotent authentication**: FOR ALL valid Session_Tokens T, calling
  `IAuthService.authenticate(T)` twice in sequence SHALL return the same Customer both times.

---

### Requirement 3: Customer Profile

**User Story:** As a logged-in customer, I want to view and update my name and contact details on my
profile page, so that my account information stays current.

#### Acceptance Criteria

1. WHEN an authenticated customer navigates to the profile page, THE Account_Module SHALL display
   the customer's current name and verified contact (email or phone) within 2 seconds.
2. WHEN an authenticated customer submits a profile update with a non-empty name (1 to 100 characters,
   trimmed), THE Account_Module SHALL persist the updated name and display the new value immediately
   without requiring a page reload.
3. IF a customer submits a profile update with an empty or whitespace-only name, THEN THE
   Account_Module SHALL reject the update and display an inline validation message indicating the
   name field is required.
4. THE Account_Module SHALL expose `AccountService.getCustomer(customerId)` which retrieves the
   Customer record via `ICustomerRepository`, returning null if the identifier is not found.
5. THE Account_Module SHALL expose `AccountService.updateProfile(customerId, fields)` which persists
   the updated fields via `ICustomerRepository` and returns the updated Customer record.

#### Correctness Properties

- **Round-trip profile update**: FOR ALL valid non-empty name strings N, calling
  `AccountService.updateProfile(id, { name: N })` followed by `AccountService.getCustomer(id)`
  SHALL return a Customer with name equal to N.

---

### Requirement 4: Address Book

**User Story:** As a logged-in customer, I want to add, edit, remove, and designate a default delivery
address, so that checkout and return flows can pre-select the right address without asking me every
time.

#### Acceptance Criteria

1. WHEN an authenticated customer adds a new Address with all required fields (recipient name,
   street line 1, city, state, pincode, country), THE Account_Module SHALL persist the Address and
   include it in the customer's address book list.
2. WHEN a customer designates an Address as the default, THE Account_Module SHALL mark that Address
   as the default and remove the default designation from any previously defaulted Address in the
   same customer's book.
3. WHEN a customer removes an Address that is not the default, THE Account_Module SHALL remove it
   from the address book without affecting the default designation.
4. WHEN a customer removes the currently designated default Address and at least one other Address
   remains, THE Account_Module SHALL designate the most recently added remaining Address as the new
   default.
5. WHEN a customer removes the last Address in the book, THE Account_Module SHALL leave the address
   book empty with no default.
6. IF a customer submits an Address with any required field empty or containing only whitespace, THEN
   THE Account_Module SHALL reject the address and display an inline validation message identifying
   each missing field.
7. THE Account_Module SHALL display the address book on the profile page, presenting the default
   Address first.

#### Correctness Properties

- **Single-default invariant**: FOR ALL customers C and after any sequence of add, remove, or
  set-default operations, the number of Addresses in C's book with the default flag set SHALL be
  either 0 (empty book) or exactly 1.
- **Add does not change default**: WHEN a customer with an existing default Address adds a new
  Address without explicitly setting it as default, the previously defaulted Address SHALL remain
  the default.

---

### Requirement 5: Saved Payment Methods

**User Story:** As a logged-in customer, I want to save and remove payment methods (UPI, card, or
Cash on Delivery), so that checkout pre-fills my preferred method without re-entry.

#### Acceptance Criteria

1. WHEN an authenticated customer adds a PaymentMethod of type UPI (with a valid UPI ID), card (with
   masked card number, expiry month, expiry year, and card-holder name), or COD, THE Account_Module
   SHALL persist the PaymentMethod and include it in the customer's payment method list.
2. WHEN a customer removes a PaymentMethod, THE Account_Module SHALL remove it from the list and
   no longer surface it at checkout.
3. IF a customer adds a UPI PaymentMethod with a UPI ID that is already saved in that customer's
   book, THEN THE Account_Module SHALL reject the duplicate and display an inline message indicating
   the UPI ID is already saved.
4. THE Account_Module SHALL store only a masked representation of card details (last four digits and
   expiry) and SHALL NOT persist full card numbers or CVVs.
5. WHEN an authenticated customer views the payment method list, THE Account_Module SHALL display
   each method with its type label and masked details within 2 seconds.

#### Correctness Properties

- **Add then list contains**: FOR ALL valid PaymentMethod values M added for customer C, the list
  returned by `AccountService.getPaymentMethods(C.id)` SHALL contain M.
- **Remove then list excludes**: FOR ALL PaymentMethod identifiers I removed for customer C, the
  list returned by `AccountService.getPaymentMethods(C.id)` SHALL not contain any method with
  identifier I.

---

### Requirement 6: Notification Preferences

**User Story:** As a logged-in customer, I want to control which notification channels (in-app, email,
SMS, push) are enabled for each event type (order updates, return status, refund status), so that I
receive only the communications I want.

#### Acceptance Criteria

1. WHEN an authenticated customer views the notification preferences page, THE Account_Module SHALL
   display the current on/off state for each combination of notification channel and event type
   within 2 seconds.
2. WHEN a customer toggles a notification preference, THE Account_Module SHALL persist the new
   state and reflect it in the UI without requiring a page reload.
3. THE Account_Module SHALL support the following event types for preference control: order placed,
   order shipped, order delivered, return status update, refund issued.
4. THE Account_Module SHALL support the following notification channels for preference control:
   in-app notification, email, SMS, push notification.
5. THE Account_Module SHALL default all notification channels to enabled for all event types when a
   new Customer record is created.

#### Correctness Properties

- **Round-trip preference toggle**: FOR ALL (channel, eventType) pairs, toggling the preference off
  and then back on SHALL result in the preference being enabled, matching the initial state.

---

### Requirement 7: My Orders List

**User Story:** As a logged-in customer, I want to see a list of all my orders with their current
status and key details, so that I can quickly find the order I want to act on.

#### Acceptance Criteria

1. WHEN an authenticated customer navigates to My Orders, THE Ordering_Module SHALL retrieve all
   Orders for the authenticated customer via `IOrderRepository` and display them within 3 seconds,
   ordered by placed date descending (most recent first).
2. THE Ordering_Module SHALL display for each Order: the order identifier (last 8 characters), the
   placed date, the overall order status, the first product image and name from the order's items,
   and the total item count.
3. WHEN an unauthenticated visitor attempts to access My Orders, THE Ordering_Module SHALL redirect
   the visitor to the login screen, preserving the My Orders URL as the post-login destination.
4. WHEN the authenticated customer's order list is empty, THE Ordering_Module SHALL display an
   empty-state message inviting the customer to browse the catalog, with a link to the home page.
5. THE Ordering_Module SHALL display a skeleton loader while the order list is being fetched, so
   that no full-screen blocking state is presented to the customer.

#### Correctness Properties

- **Customer isolation invariant**: FOR ALL customers C, every Order returned by
  `OrdersService.getOrdersByCustomer(C.id)` SHALL have a customerId field equal to C.id — no
  order belonging to a different customer SHALL appear in the list.

---

### Requirement 8: Order Detail Page

**User Story:** As a logged-in customer, I want to view the full details of an order — including each
item's image, status, delivery date, and payment type — so that I have all the information I need to
decide whether to initiate a return.

#### Acceptance Criteria

1. WHEN an authenticated customer navigates to an Order Detail page, THE Ordering_Module SHALL
   retrieve the Order and its OrderItems via `IOrderRepository` and render the page within 3 seconds.
2. THE Ordering_Module SHALL display for the Order: the order identifier, placed date, payment type,
   and overall order status.
3. THE Ordering_Module SHALL display for each OrderItem: product image, product name, quantity, unit
   price, delivery date, and per-item delivery status.
4. WHEN an unauthenticated visitor attempts to access an Order Detail page, THE Ordering_Module SHALL
   redirect the visitor to the login screen, preserving the Order Detail URL as the post-login
   destination.
5. IF an authenticated customer navigates to an Order Detail page for an order whose customerId does
   not match the authenticated customer's identifier, THEN THE Ordering_Module SHALL display a
   not-found message and SHALL NOT reveal any order data.
6. THE Ordering_Module SHALL display a skeleton loader for each OrderItem section while data is
   being fetched.

---

### Requirement 9: Return Entry Point on Order Detail

**User Story:** As a customer who received a delivered item within its return window, I want to see
a "Return or replace items" button on that item in my order, so that I can start a return in ≤3 taps
from my order list.

#### Acceptance Criteria

1. WHEN the Order Detail page renders an OrderItem, THE Ordering_Module SHALL call
   `IReturnsFacade.checkEligibility(customerId, orderItemId)` and render a "Return or replace items"
   button on that item only when the eligibility result indicates the item is eligible.
2. WHEN the "Return or replace items" button is tapped, THE Ordering_Module SHALL navigate the
   customer directly to the Returns feature's eligibility screen for that order item, passing the
   orderItemId as a parameter.
3. WHEN an OrderItem is not within its Return_Window, THE Ordering_Module SHALL NOT render the
   "Return or replace items" button for that item and SHALL NOT display any button placeholder or
   disabled control in its place.
4. WHEN an Order contains multiple OrderItems where some are eligible and some are not, THE
   Ordering_Module SHALL render the "Return or replace items" button only on the eligible items,
   independently of the ineligible items on the same Order.
5. IF `IReturnsFacade.checkEligibility` returns an error for an OrderItem, THEN THE Ordering_Module
   SHALL treat that item as ineligible and SHALL NOT render the return button for it.
6. THE Ordering_Module SHALL complete the full path from My Orders list to the Returns eligibility
   screen in no more than 3 customer tap interactions.

#### Correctness Properties

- **Eligibility button invariant**: FOR ALL OrderItems, the return button is visible if and only if
  `IReturnsFacade.checkEligibility` returns eligible:true. No item outside its Return_Window SHALL
  show the button; no eligible item SHALL hide it.
- **Per-item independence**: FOR ALL Orders containing a mix of eligible and ineligible items, the
  button visibility on each item SHALL be determined independently — adding or removing an ineligible
  item SHALL NOT change the button state of the eligible items in the same order.

---

### Requirement 10: Refund Status Reflection

**User Story:** As a customer who has initiated a return, I want to see the refund status and amount
on my Order Detail page as soon as the refund is issued, so that I know the outcome without leaving
the platform.

#### Acceptance Criteria

1. WHEN the Ordering_Module receives a `RefundIssued` domain event from the Event_Bus, THE
   Ordering_Module SHALL update the corresponding OrderItem's refund status to "Refund Issued" and
   store the refund amount from the event payload.
2. WHEN the Order Detail page renders an OrderItem whose refund status is "Refund Issued", THE
   Ordering_Module SHALL display the refund amount alongside the item with the currency symbol.
3. IF the Ordering_Module receives a `RefundIssued` event for an orderItemId that does not exist in
   `IOrderRepository`, THEN THE Ordering_Module SHALL log the unmatched event identifier and
   continue processing without throwing an error or affecting any other order records.
4. WHEN the Ordering_Module receives a `RefundIssued` event for an OrderItem that already has a
   refund status of "Refund Issued", THE Ordering_Module SHALL overwrite the stored refund amount
   with the value from the new event and update the display accordingly.
5. WHEN a customer views the Order Detail page for an order where no refund has been issued, THE
   Ordering_Module SHALL NOT display any refund status indicator on the OrderItems.

#### Correctness Properties

- **Idempotent refund reflection**: FOR ALL `RefundIssued` events E with the same orderItemId and
  amount, processing E once and processing E twice SHALL result in the same refund status and amount
  stored on the OrderItem — no double-recording of refund amounts.
- **Graceful unknown-order handling**: FOR ALL `RefundIssued` events E whose orderItemId does not
  match any OrderItem in the repository, the Ordering_Module SHALL complete event handling without
  throwing, and the repository state SHALL be unchanged for all other OrderItems.

---

### Requirement 11: IAuthService — Ownership Verification

**User Story:** As the platform, I want a single authoritative service that verifies a customer owns
a given order item before any return action is taken, so that customers cannot initiate returns on
items they did not purchase.

#### Acceptance Criteria

1. WHEN `IAuthService.verifyOwnership(customerId, orderItemId)` is called, THE Identity_Module SHALL
   return true if and only if the OrderItem with the given identifier has a customerId field equal to
   the provided customerId.
2. WHEN `IAuthService.getOrderItem(orderItemId)` is called, THE Identity_Module SHALL return the
   OrderItem matching the identifier, or null if no such item exists.
3. WHEN `IAuthService.getOrderItemsByCustomer(customerId)` is called, THE Identity_Module SHALL
   return all OrderItems whose customerId matches the provided identifier, and SHALL NOT include
   OrderItems belonging to other customers.
4. THE Identity_Module SHALL provide a deterministic mock implementation of `IAuthService` that
   returns predictable results for seeded order item identifiers, enabling the Returns feature to
   operate without a live database.
5. WHEN the deterministic mock `IAuthService` is used, `IAuthService.verifyOwnership(c, i)` SHALL
   return true if the seeded OrderItem with identifier i has customerId equal to c, and false
   otherwise.

#### Correctness Properties

- **Ownership correctness**: FOR ALL (customerId, orderItemId) pairs, `verifyOwnership(customerId,
  orderItemId)` SHALL return true if and only if `getOrderItem(orderItemId)` returns an item whose
  customerId equals customerId.
- **Customer isolation in getOrderItemsByCustomer**: FOR ALL customers C1 and C2 where C1 ≠ C2,
  the set of identifiers returned by `getOrderItemsByCustomer(C1.id)` and the set returned by
  `getOrderItemsByCustomer(C2.id)` SHALL be disjoint.

---

### Requirement 12: OrdersService and AccountService Facades

**User Story:** As a developer of a consuming module, I want to interact with orders and account data
exclusively through stable facade interfaces backed by repository interfaces, so that no module
imports internal persistence details of another module.

#### Acceptance Criteria

1. THE Ordering_Module SHALL expose an `OrdersService` facade with at minimum the operations:
   `getOrdersByCustomer(customerId)`, `getOrderDetail(customerId, orderId)`, and
   `updateRefundStatus(orderItemId, refundStatus, refundAmount)`.
2. THE Account_Module SHALL expose an `AccountService` facade with at minimum the operations:
   `getCustomer(customerId)`, `updateProfile(customerId, fields)`, `addAddress(customerId, address)`,
   `removeAddress(customerId, addressId)`, `setDefaultAddress(customerId, addressId)`,
   `addPaymentMethod(customerId, method)`, `removePaymentMethod(customerId, methodId)`,
   `getPaymentMethods(customerId)`, and `updateNotificationPreferences(customerId, preferences)`.
3. THE `OrdersService` facade SHALL depend on `IOrderRepository` and SHALL NOT import any concrete
   repository, database client, or infrastructure class directly.
4. THE `AccountService` facade SHALL depend on `ICustomerRepository` and SHALL NOT import any
   concrete repository, database client, or infrastructure class directly.
5. THE Ordering_Module SHALL ship an in-memory implementation of `IOrderRepository` for local and
   demo runs, seeded with the Demo_Customer's orders.
6. THE Account_Module SHALL ship an in-memory implementation of `ICustomerRepository` for local and
   demo runs, seeded with the Demo_Customer's profile.

#### Correctness Properties

- **Order repository round-trip**: FOR ALL valid Order values O saved via `IOrderRepository.save(O)`,
  `IOrderRepository.findById(O.id)` SHALL return an Order equal to O.
- **Customer repository round-trip**: FOR ALL valid Customer values C saved via
  `ICustomerRepository.save(C)`, `ICustomerRepository.findById(C.id)` SHALL return a Customer
  equal to C.

---

### Requirement 13: Demo Seed Data

**User Story:** As a demo presenter, I want the local/demo environment to start with a ready-made
customer and a delivered order whose item is inside its return window, so that the hero path into
the Returns feature works immediately without manual setup.

#### Acceptance Criteria

1. THE Identity_Module SHALL seed a Demo_Customer with a fixed identifier, name, and email address
   that are consistent across restarts of the local/demo environment.
2. THE Ordering_Module SHALL seed at least one Order for the Demo_Customer with a status of
   DELIVERED, containing at least one OrderItem whose delivery date is set such that the current
   date falls within the configured Return_Window.
3. THE Ordering_Module SHALL seed at least one additional OrderItem for the Demo_Customer whose
   delivery date is set such that the current date falls outside the configured Return_Window,
   enabling testing of the ineligible-item edge case.
4. WHEN the local/demo environment starts, THE Identity_Module SHALL ensure that authenticating with
   the Demo_Customer's pre-configured token via the deterministic mock `IAuthService` returns the
   Demo_Customer's record without any runtime configuration.
5. THE seed data SHALL include at least one Order for the Demo_Customer with a payment type of
   prepaid and at least one Order with a payment type of COD.

#### Correctness Properties

- **Seed idempotence**: Running the seed operation multiple times SHALL result in the same set of
  Customer and Order records — no duplicate Demo_Customer records or duplicate seeded Orders SHALL
  be created on repeated initialisation.

---

### Requirement 14: Unauthenticated Access Guard

**User Story:** As the platform, I want all order and account pages to be protected so that only
authenticated customers can view personal data, so that no visitor can access another person's
information.

#### Acceptance Criteria

1. WHEN an unauthenticated visitor attempts to access My Orders, an Order Detail page, or the
   Account profile page, THE Identity_Module SHALL redirect the visitor to the login screen and
   preserve the originally requested URL as the post-login destination.
2. WHEN an authenticated customer completes login after being redirected from a protected page,
   THE Identity_Module SHALL navigate the customer to the preserved destination URL.
3. IF an authenticated customer requests data for a customerId that does not match their own
   Session_Token identity, THEN THE Ordering_Module or Account_Module SHALL return a not-found
   response and SHALL NOT expose any data belonging to the other customer.
4. THE Identity_Module SHALL enforce authentication checks at the application boundary so that no
   protected page renders any personal data before authentication is confirmed.

---

### Requirement 15: Accessibility and Mobile-First Display

**User Story:** As a customer using a mobile device or assistive technology, I want the account,
orders, and order detail pages to be fully usable on a small screen and with a screen reader, so that
the platform is accessible to all customers.

#### Acceptance Criteria

1. THE Ordering_Module and Account_Module SHALL render all pages with a mobile-first responsive
   layout that is usable on viewport widths of 320 px and above without horizontal scrolling.
2. THE Ordering_Module SHALL provide descriptive alt text for every product image displayed on the
   My Orders list and Order Detail page.
3. THE Ordering_Module and Account_Module SHALL ensure all interactive controls (buttons, links,
   form inputs) meet WCAG AA minimum contrast ratio of 4.5:1 against their background.
4. THE Ordering_Module and Account_Module SHALL ensure all interactive controls are reachable and
   activatable via keyboard navigation in a logical tab order.
5. THE Ordering_Module SHALL ensure the "Return or replace items" button has a visible focus state
   and an accessible label that includes the product name, so that screen reader users can
   distinguish return buttons for different items on the same page.
