---
title: Module Boundaries & Domain Events (Loose Coupling)
inclusion: always
---

# Module Boundaries & Events — MUST FOLLOW

**Modules:** `Identity`, `Catalog`, `Ordering`, `Returns`, `Grading`, `Disposition`, `Logistics/FlexRoute`, `Marketplace`, `P2P`, `FitGuard`, `GreenLedger`, `Seller`, `Admin`, `Notifications`.

## The rule

Each module exposes a **Facade service** and reacts to **domain events** published on a shared event bus. **No module may import another module's internal classes.** If module A needs something to happen in module B, A either calls B's facade interface or publishes an event that B subscribes to — never reaches into B's internals.

## Canonical domain events

`OrderPlaced` · `OrderShipped` · `OrderDelivered` · `ReturnInitiated` · `ItemGraded` · `DispositionAssigned` · `RefundIssued` · `ListingCreated` · `ListingReserved` · `ListingSold` · `ListingExpired` · `DeliveryJobCreated` · `OfferIssued` · `OfferAccepted` · `OfferRejected` · `DeliveryCompleted` · `GreenCreditsAwarded` · `FraudFlagged`

## Example reaction fan-out

When `ItemGraded` is published:
- `Disposition` decides the item's route.
- `Notifications` tells the customer.
- (if resell) `Marketplace` drafts a listing.
- `Admin` ops console updates its counts.

Each subscriber is independent and individually testable. Adding a new reaction to an event must NOT require modifying existing subscribers or the publisher.
