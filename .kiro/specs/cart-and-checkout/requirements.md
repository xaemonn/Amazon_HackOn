# Requirements Document

## Introduction

Cart & Checkout provides the purchase flow for Second Life Commerce. Customers add product variants to a cart, manage quantities and saved-for-later items, then proceed through a streamlined checkout (address → delivery → payment → review → place order → confirmation). On successful placement the module creates an Order + OrderItems conforming to the shared ordering domain shapes and publishes an `OrderPlaced` domain event. Payment is handled via an `IPaymentProvider` adapter (mock for demo; real gateway swappable via DI). Cash on Delivery is supported alongside prepaid (UPI/card).

This module operates entirely within `src/domain/cart`, `src/application/cart`, and `src/presentation/web/src/pages/checkout` — it imports but never modifies the shared Customer, Address, PaymentMethod, Order, OrderItem entities or the IOrderRepository interface defined by the Accounts & Orders spec.

## Glossary

- **Cart_Service**: The application-layer facade that manages the shopping cart (add, remove, update quantity, subtotal calculation, save-for-later).
- **Checkout_Service**: The application-layer facade that orchestrates the checkout flow (address selection, delivery option, payment processing, order creation, event publication).
- **IPayment_Provider**: The adapter interface for processing prepaid payments; implementations include a mock (demo) and a live gateway (stretch).
- **Cart**: A per-customer collection of Cart_Items representing intended purchases.
- **Cart_Item**: A line in the cart referencing a ProductVariant with a chosen quantity.
- **Save_For_Later_List**: A secondary list where customers can park items removed from the active cart for future consideration.
- **Event_Bus**: The shared IEventBus through which domain events are published and consumed across modules.
- **Order**: The existing entity from `src/domain/ordering/Order.ts` (id, customerId, placedDate, status, paymentType, items).
- **Order_Item**: The existing entity from `src/domain/ordering/OrderItem.ts` (id, orderId, customerId, productId, variantId, productName, productImage, unitPrice, quantity, deliveryDate, deliveryStatus, refundStatus).
- **Product_Variant**: The existing entity from `src/domain/catalog/ProductVariant.ts` (id, productId, condition, price, stock).
- **Customer**: The existing entity from `src/domain/account/Customer.ts` (id, name, email, addresses, paymentMethods).
- **Address**: The existing entity from `src/domain/account/Address.ts`.
- **Payment_Method**: The existing entity from `src/domain/account/PaymentMethod.ts` (UPI | Card | COD union).
- **High_RTO_Pincode**: A pincode historically associated with a high Return-to-Origin rate for Cash on Delivery orders.
- **Checkout_Step**: One discrete screen in the checkout flow — Address, Delivery, Payment, Review, or Confirmation.

## Requirements

### Requirement 1: Add Item to Cart

**User Story:** As a customer, I want to add a product variant to my cart, so that I can purchase it later during checkout.

#### Acceptance Criteria

1. WHEN a customer requests to add a Product_Variant to the Cart, THE Cart_Service SHALL create a new Cart_Item with quantity 1 if the variant is not already present in the Cart.
2. WHEN a customer requests to add a Product_Variant that already exists in the Cart, THE Cart_Service SHALL increment the existing Cart_Item quantity by 1, up to a maximum of 10 units per Cart_Item.
3. IF the Product_Variant has zero stock at the time of the add request, THEN THE Cart_Service SHALL reject the addition and return an error indicating the item is out of stock.
4. IF incrementing the Cart_Item quantity would exceed the available stock of the Product_Variant, THEN THE Cart_Service SHALL cap the Cart_Item quantity at the available stock and return a notice indicating the quantity was capped to available stock.
5. THE Cart_Service SHALL store each Cart_Item with a reference to the Product_Variant id, product id, product name, product image URL, unit price, and condition.
6. IF the customer requests to add a Product_Variant that does not exist, THEN THE Cart_Service SHALL reject the addition and return an error indicating the variant was not found.
7. IF incrementing the Cart_Item quantity would exceed 10 units, THEN THE Cart_Service SHALL reject the addition and return an error indicating the maximum quantity per item has been reached.

### Requirement 2: Remove Item from Cart

**User Story:** As a customer, I want to remove an item from my cart, so that I no longer intend to purchase it.

#### Acceptance Criteria

1. WHEN a customer requests to remove a Cart_Item identified by variant_id from their Cart, THE Cart_Service SHALL delete that Cart_Item from the Cart and return a confirmation indicating successful removal.
2. WHEN a Cart_Item is removed from the Cart, THE Cart_Service SHALL recalculate the Cart total to reflect the remaining items.
3. IF the specified Cart_Item does not exist in the customer's Cart, THEN THE Cart_Service SHALL return a not-found error without modifying the Cart.
4. IF the customer requests to remove a Cart_Item from a Cart that does not belong to them, THEN THE Cart_Service SHALL return an authorization error without modifying any Cart.

### Requirement 3: Update Cart Item Quantity

**User Story:** As a customer, I want to change the quantity of an item in my cart, so that I can buy more or fewer units.

#### Acceptance Criteria

1. WHEN a customer sets a Cart_Item quantity to a positive integer between 1 and 99 (inclusive), THE Cart_Service SHALL update the Cart_Item quantity to min(requested quantity, available stock, maxQuantityPerItem=10) and return the updated Cart reflecting the new quantity.
2. WHEN a customer sets a Cart_Item quantity to zero, THE Cart_Service SHALL remove the Cart_Item from the Cart and return the updated Cart without that item.
3. WHEN a customer sets a Cart_Item quantity exceeding available stock or maxQuantityPerItem (10) for that Product_Variant, THE Cart_Service SHALL cap the quantity at min(available stock, 10), persist that capped value, and return a response that includes both the requested quantity and the capped quantity so the customer understands the adjustment.
4. IF the specified Cart_Item does not exist in the Cart, THEN THE Cart_Service SHALL return a not-found error indicating which Cart_Item identifier was not found.
5. IF a customer provides a quantity that is negative, non-integer, or exceeds 99, THEN THE Cart_Service SHALL reject the request with a validation error indicating the quantity must be an integer between 0 and 99.

### Requirement 4: Calculate Cart Subtotal

**User Story:** As a customer, I want to see the subtotal of my cart, so that I know how much I will pay before checkout.

#### Acceptance Criteria

1. THE Cart_Service SHALL compute the cart subtotal as the sum of (unit price × quantity) for every Cart_Item in the Cart, rounding the result to 2 decimal places using half-up rounding, where unit price is the current price from the referenced Product_Variant.
2. WHEN a Cart_Item is added, removed, or its quantity changes, THE Cart_Service SHALL recompute and return the updated subtotal and item count synchronously within the same operation response.
3. IF the Cart contains no Cart_Items, THEN THE Cart_Service SHALL return a subtotal of 0.00 and an item count of 0.
4. THE Cart_Service SHALL return an item count representing the total number of units (sum of quantities) across all Cart_Items, where the count ranges from 0 to the maximum cart capacity.
5. THE Cart_Service SHALL enforce a maximum of 50 distinct Cart_Items per Cart, with each Cart_Item quantity between 1 and 10 inclusive.
6. IF a Cart_Item references a Product_Variant that is no longer available or is out of stock, THEN THE Cart_Service SHALL exclude that Cart_Item from the subtotal calculation and indicate to the caller which items are unavailable.

### Requirement 5: Move Item to Save-for-Later

**User Story:** As a customer, I want to move a cart item to a save-for-later list, so that I can keep it for future consideration without cluttering my active cart.

#### Acceptance Criteria

1. WHEN a customer moves a Cart_Item to the Save_For_Later_List, THE Cart_Service SHALL remove the Cart_Item from the Cart and add it to the Save_For_Later_List, storing the Product_Variant id, product id, product name, product image URL, unit price, and condition.
2. WHEN a customer moves an item from the Save_For_Later_List back to the Cart, THE Cart_Service SHALL remove the item from the Save_For_Later_List and add it to the Cart with quantity 1.
3. IF the Product_Variant referenced by a Save_For_Later_List item has zero stock at the time of move-back, THEN THE Cart_Service SHALL reject the move and return an out-of-stock error indicating the affected product name.
4. IF the specified Cart_Item does not exist in the Cart when a move-to-save is requested, THEN THE Cart_Service SHALL return a not-found error without modifying the Save_For_Later_List.
5. IF the specified item does not exist in the Save_For_Later_List when a move-back is requested, THEN THE Cart_Service SHALL return a not-found error without modifying the Cart.
6. IF the Save_For_Later_List already contains an entry for the same Product_Variant when a move-to-save is requested, THEN THE Cart_Service SHALL remove the Cart_Item from the Cart without creating a duplicate entry in the Save_For_Later_List.

### Requirement 6: Checkout — Address Selection

**User Story:** As a customer, I want to select a delivery address during checkout, so that my order ships to the correct location.

#### Acceptance Criteria

1. WHEN a customer begins checkout, THE Checkout_Service SHALL retrieve the customer's saved addresses from the Customer entity and display them as a selectable list ordered by isDefault first, then by most recently created.
2. WHEN a customer begins checkout AND the Customer entity contains an Address with isDefault=true, THE Checkout_Service SHALL pre-select that default Address.
3. WHEN a customer selects a different Address from the list, THE Checkout_Service SHALL associate the selected Address with the current order and display the selected address details (recipientName, streetLine1, city, state, pincode) as the confirmed delivery address.
4. IF the customer has no saved addresses, THEN THE Checkout_Service SHALL prompt the customer to add an address and SHALL prevent advancement to the next checkout step until at least one address is saved.
5. WHEN a customer adds a new address from the checkout address prompt, THE Checkout_Service SHALL automatically select the newly added Address for the order and allow the customer to proceed to the next checkout step.
6. IF the Checkout_Service fails to retrieve the customer's saved addresses, THEN THE Checkout_Service SHALL display an error message indicating that addresses could not be loaded and provide a retry option without losing other checkout state.

### Requirement 7: Checkout — Delivery Option Selection

**User Story:** As a customer, I want to choose a delivery speed, so that I can balance cost and delivery time.

#### Acceptance Criteria

1. WHEN a customer reaches the delivery step, THE Checkout_Service SHALL present each available delivery option (Standard, Express) displaying the option name, the estimated delivery date range (calculated from the current date plus the configured minimum and maximum days for that option), and the delivery cost (where Standard cost is ₹0 and Express cost is the configured express delivery fee).
2. THE Checkout_Service SHALL pre-select the Standard delivery option as the default.
3. WHEN a customer selects a delivery option, THE Checkout_Service SHALL update the displayed order total to include the cost of the selected delivery option and visually indicate which option is currently selected.
4. WHEN a customer confirms a delivery option selection, THE Checkout_Service SHALL record the chosen option, the associated delivery date range estimate, and the delivery cost against the order.
5. IF delivery options cannot be retrieved, THEN THE Checkout_Service SHALL display an error message indicating that delivery options are temporarily unavailable and prevent the customer from proceeding to the next checkout step until options are successfully loaded.

### Requirement 8: Checkout — Payment Selection

**User Story:** As a customer, I want to choose a payment method during checkout, so that I can pay using my preferred option.

#### Acceptance Criteria

1. WHEN a customer reaches the payment step, THE Checkout_Service SHALL present all saved Payment_Methods from the Customer entity (max 10) plus a Cash on Delivery option, ordered with prepaid methods (UPI, Card) listed before the COD option.
2. IF the Customer has a Payment_Method with isPreferred=true, THEN THE Checkout_Service SHALL pre-select that Payment_Method.
3. IF the Customer has no Payment_Method with isPreferred=true, THEN THE Checkout_Service SHALL pre-select the Cash on Delivery option.
4. WHEN a customer selects a prepaid Payment_Method (UPI or Card), THE Checkout_Service SHALL record the selected method's id and type for payment processing.
5. WHEN a customer selects Cash on Delivery, THE Checkout_Service SHALL record the payment type as 'cod'.
6. WHEN a customer selects Cash on Delivery and the selected Address pincode is in the High_RTO_Pincode list, THE Checkout_Service SHALL display a warning indicating high RTO risk for this pincode within 1 second of selection, without blocking the order.
7. IF a customer attempts to proceed from the payment step without a Payment_Method selected, THEN THE Checkout_Service SHALL prevent navigation to the review step and display an error indicating that a payment method must be chosen.

### Requirement 9: Checkout — Order Review

**User Story:** As a customer, I want to review my complete order before placing it, so that I can verify items, address, delivery, and payment are correct.

#### Acceptance Criteria

1. WHEN a customer reaches the review step, THE Checkout_Service SHALL display a summary including all Cart_Items with names, images, quantities, and prices, the selected Address, the selected delivery option, and the selected Payment_Method.
2. WHEN a customer reaches the review step, THE Checkout_Service SHALL display the order total as a breakdown showing the cart subtotal and the delivery charge separately, followed by the combined total (subtotal + delivery charge).
3. THE Checkout_Service SHALL allow the customer to navigate back to any previous Checkout_Step to make changes, preserving all selections made in other steps.
4. WHEN a customer returns to the review step after navigating back, THE Checkout_Service SHALL recompute the order total reflecting any changes made during the back-navigation and display the updated summary.
5. IF any Cart_Item becomes out-of-stock or its price has changed since the customer entered the review step, THEN THE Checkout_Service SHALL display an indication identifying the affected item(s) and the nature of the change, and SHALL prevent order placement until the customer acknowledges or resolves the discrepancy.

### Requirement 10: Place Order — Prepaid Payment

**User Story:** As a customer, I want to place a prepaid order, so that I pay upfront and my order is confirmed immediately.

#### Acceptance Criteria

1. WHEN a customer confirms a prepaid order, THE Checkout_Service SHALL invoke the IPayment_Provider to process the payment for the order total (subtotal + delivery charge), the currency associated with the Cart, and the selected Payment_Method details.
2. WHEN the IPayment_Provider returns a successful payment result, THE Checkout_Service SHALL create an Order entity with status 'placed', paymentType 'prepaid', the customer's id, and the current timestamp as placedDate.
3. WHEN the IPayment_Provider returns a successful payment result, THE Checkout_Service SHALL create Order_Item entities for each Cart_Item with deliveryStatus 'pending' and refundStatus { code: 'none', amount: null, currency: null, issuedAt: null }.
4. WHEN the IPayment_Provider returns a payment failure, THE Checkout_Service SHALL preserve all Cart_Items in the Cart unchanged, display a payment-failed error indicating the failure reason, and allow the customer to retry or choose a different Payment_Method.
5. IF the IPayment_Provider throws an unexpected error or does not respond within 30 seconds, THEN THE Checkout_Service SHALL preserve all Cart_Items in the Cart unchanged, display a generic payment error message that does not expose internal failure details, and allow retry.
6. WHILE a payment attempt is in progress, THE Checkout_Service SHALL disable the place-order action to prevent duplicate payment submissions.

### Requirement 11: Place Order — Cash on Delivery

**User Story:** As a customer, I want to place a Cash on Delivery order, so that I can pay when the item arrives.

#### Acceptance Criteria

1. WHEN a customer confirms a COD order, THE Checkout_Service SHALL create an Order entity with status 'placed' and paymentType 'cod' without invoking the IPayment_Provider, and SHALL create Order_Item entities for each Cart_Item with deliveryStatus 'pending' and refundStatus { code: 'none', amount: null, currency: null, issuedAt: null }.
2. WHEN the Order and all Order_Items have been persisted successfully, THE Checkout_Service SHALL clear all items from the customer's Cart.
3. IF the cart contains zero items when the customer confirms a COD order, THEN THE Checkout_Service SHALL reject the request and display an error message indicating the cart is empty.
4. IF persisting the Order or Order_Items via the IOrderRepository fails, THEN THE Checkout_Service SHALL not clear the Cart, SHALL display an error message indicating the order could not be placed, and SHALL allow the customer to retry.

### Requirement 12: Publish OrderPlaced Event

**User Story:** As the system, I want to publish an OrderPlaced domain event on successful order placement, so that other modules (notifications, logistics) can react.

#### Acceptance Criteria

1. WHEN an Order is successfully created (prepaid or COD) and persisted via the IOrderRepository, THE Checkout_Service SHALL publish exactly one OrderPlaced event to the Event_Bus containing the order id, customer id, payment type, and the list of order item ids.
2. IF the IOrderRepository save succeeds but the Event_Bus publish call fails, THEN THE Checkout_Service SHALL retry publication up to 3 times before logging the failure, without rolling back the persisted Order.
3. IF the IOrderRepository save fails, THEN THE Checkout_Service SHALL NOT publish an OrderPlaced event to the Event_Bus.

### Requirement 13: Order Confirmation

**User Story:** As a customer, I want to see an order confirmation after placing my order, so that I know my purchase was successful.

#### Acceptance Criteria

1. WHEN an order is successfully placed, THE Checkout_Service SHALL display a confirmation screen showing the order id, estimated delivery date, and a summary of purchased items including each item's product name, product image, quantity, and unit price.
2. WHEN an order is successfully placed, THE Cart_Service SHALL clear all Cart_Items from the Cart.
3. IF order placement fails, THEN THE Checkout_Service SHALL display an error message indicating the reason for failure and SHALL preserve the Cart contents so the customer can retry without re-adding items.
4. IF the Cart_Service fails to clear Cart_Items after a successful order placement, THEN THE Checkout_Service SHALL still display the order confirmation screen and SHALL retry the cart-clear operation up to 3 times before logging the failure for reconciliation.

### Requirement 14: Empty Cart Checkout Prevention

**User Story:** As a customer, I want to be prevented from checking out an empty cart, so that I do not accidentally place a blank order.

#### Acceptance Criteria

1. WHEN a customer attempts to begin checkout with an empty Cart (zero Cart_Items), THE Checkout_Service SHALL reject the request and return an error indicating that the cart contains no items, without creating an order.
2. WHILE the Cart contains zero Cart_Items, THE Cart_Service SHALL disable the checkout action in the presentation layer so that it is visible but non-interactive, indicating that items must be added before checkout.
3. WHEN a Cart_Item is added to a previously empty Cart, THE Cart_Service SHALL enable the checkout action within 1 second without requiring a page reload.
4. IF all Cart_Items are removed from the Cart during an active checkout session, THEN THE Checkout_Service SHALL halt the checkout flow, return the customer to the Cart view, and display an error indicating that the cart is now empty.

### Requirement 15: Stock Validation at Checkout

**User Story:** As a customer, I want to know if an item went out of stock before I place my order, so that I am not surprised by a failed order.

#### Acceptance Criteria

1. WHEN a customer initiates the Place Order action, THE Checkout_Service SHALL validate that every Cart_Item's Product_Variant has a stock value greater than or equal to the requested quantity before proceeding with order placement.
2. IF any Cart_Item references a Product_Variant with stock less than the requested quantity at order placement time, THEN THE Checkout_Service SHALL reject the entire order, preserve all Cart_Items in the cart, and display an out-of-stock error listing each affected product name and its current available quantity.
3. IF stock validation has failed, THEN THE Checkout_Service SHALL allow the customer to remove affected items or reduce their quantity to at most the current available stock (minimum 1), and retry the Place Order action without re-entering checkout details.
4. WHEN stock validation is performed, THE Checkout_Service SHALL complete the validation and return a result within 3 seconds.
5. IF a Cart_Item's Product_Variant has zero available stock, THEN THE Checkout_Service SHALL indicate that the item is unavailable and permit only removal (not quantity reduction) for that item.

### Requirement 16: IPaymentProvider Adapter

**User Story:** As a developer, I want payment processing behind an adapter interface, so that I can swap between a mock and a real payment gateway without changing application code.

#### Acceptance Criteria

1. THE IPayment_Provider interface SHALL define a processPayment method accepting an amount (number, range 0.01 to 999,999,999.99), a currency (string, restricted to "INR"), and a Payment_Method (UPI, Card, or COD type as defined in the domain), returning a PaymentResult object containing: a success boolean, a transactionId (string, present when success is true), and a failureReason (string, present when success is false).
2. THE mock implementation of IPayment_Provider SHALL return a successful PaymentResult with a deterministic transactionId derived from the input amount and currency (format: "mock-txn-{amount}-{currency}") for any request where the amount is within the valid range and the Payment_Method type is "upi" or "card".
3. IF the processPayment amount is less than 0.01 or greater than 999,999,999.99, THEN THE mock implementation of IPayment_Provider SHALL return a failed PaymentResult with a failureReason indicating the amount is out of range.
4. IF the Payment_Method passed to processPayment contains a UPI id equal to "fail@test" or a Card lastFour equal to "0000", THEN THE mock implementation of IPayment_Provider SHALL return a failed PaymentResult with a failureReason indicating a declined payment, enabling deterministic failure-path testing.
5. THE Checkout_Service SHALL depend on the IPayment_Provider interface and receive the concrete implementation via dependency injection, with no direct reference to any concrete adapter class.

### Requirement 17: Cart Persistence per Customer

**User Story:** As a customer, I want my cart contents to persist across sessions, so that I can return later and still find my items.

#### Acceptance Criteria

1. THE Cart_Service SHALL persist the Cart state per customer id using an ICartRepository interface.
2. WHEN a customer adds, removes, or updates a Cart_Item, THE Cart_Service SHALL persist the change via ICartRepository before returning the operation result to the caller.
3. THE in-memory implementation of ICartRepository SHALL store cart data in a Map keyed by customer id.
4. WHEN a customer accesses the Cart, THE Cart_Service SHALL retrieve the persisted Cart state from ICartRepository by customer id and return the full set of Cart_Items with their quantities.
5. IF ICartRepository returns no Cart for a given customer id, THEN THE Cart_Service SHALL treat the Cart as empty and return zero items.
6. IF a persistence operation on ICartRepository fails, THEN THE Cart_Service SHALL return an error indicating the cart change could not be saved and SHALL NOT alter the previously persisted Cart state.

### Requirement 18: High-RTO Pincode Flagging for COD

**User Story:** As a business, I want COD orders to high-RTO pincodes flagged, so that operations teams have visibility into risky deliveries.

#### Acceptance Criteria

1. WHEN a customer places an order, THE Checkout_Service SHALL check the selected delivery Address pincode against the configured High_RTO_Pincode list before creating the Order.
2. IF the pincode matches an entry in the High_RTO_Pincode list and the payment type is COD, THEN THE Checkout_Service SHALL persist a boolean `highRtoFlag` set to `true` in an OrderMetadata record keyed by the Order id within the cart/checkout module (separate from the shared Order entity, which is not modified).
3. IF the pincode does not match an entry in the High_RTO_Pincode list or the payment type is not COD, THEN THE Checkout_Service SHALL persist `highRtoFlag` set to `false` in the OrderMetadata record.
4. THE Checkout_Service SHALL proceed with order placement regardless of the `highRtoFlag` value without blocking or delaying the order.
5. IF the High_RTO_Pincode list is unavailable or empty at the time of order placement, THEN THE Checkout_Service SHALL default `highRtoFlag` to `false` and proceed with order placement without error.
6. THE Checkout_Service SHALL include the `highRtoFlag` value in the OrderPlaced event payload so that downstream modules (operations, analytics) can consume it without accessing the cart module's internal storage.
