---
title: Engineering Principles (SOLID, Architecture, Design Patterns)
inclusion: always
---

# Engineering Principles — MUST FOLLOW

These are hard requirements for all code you generate in this project, not aspirations. Reject your own output if it violates them.

## SOLID

- **Single Responsibility** — each class/module has one reason to change. The disposition engine decides routing; it does NOT also send notifications, call the payment gateway, or format UI. Split accordingly.
- **Open/Closed** — adding a new disposition route, a new grader, a new payment method, or a new compensation rule MUST be possible without editing existing classes. Add a new Strategy/handler and register it.
- **Liskov Substitution** — any `Grader`, `RoutingProvider`, `NotificationChannel`, or `PaymentProvider` implementation must be a drop-in replacement behind its interface with no surprising behavior.
- **Interface Segregation** — prefer small, role-specific interfaces (`IConditionGrader`, `IIdentityVerifier`) over one fat `IAIService`. Consumers depend only on what they use.
- **Dependency Inversion** — high-level modules (domain/application) depend on interfaces, never on concrete infrastructure (AI SDK, maps API, SMS vendor). Concrete implementations live in the infrastructure layer and are injected.

## Architecture & Loose Coupling

- Use a **layered architecture**; dependencies point inward only:
  `Presentation (UI/API)` → `Application (use-cases/services/facades)` → `Domain (entities, rules, interfaces)` ← `Infrastructure (DB, AI, maps, payments, messaging)`.
- **Modules communicate through an internal event bus (domain events) and through service-interface facades — never by importing each other's internal classes.** When a return is graded, the grading module publishes an `ItemGraded` event; disposition, notifications, and the green-credit ledger react independently. None call each other directly.
- **Every external dependency sits behind an Adapter** (e.g. `BedrockGraderAdapter implements IConditionGrader`, `MapboxRoutingAdapter implements IRoutingProvider`). Each adapter MUST ship with a deterministic mock/fallback implementation so the app runs without live API keys.
- Use **dependency injection** for all wiring via a single composition root. No `new ConcreteService()` inside domain/application code.
- **Configuration over hard-coding** — listing-window length, grade thresholds, the delivery-compensation formula, refund rules, etc. live in config, not literals.

## Design-Pattern Map (apply where indicated; do not over-engineer elsewhere)

| Pattern | Where | Why |
|---|---|---|
| **Strategy** | Disposition routing options; resale pricing; refund methods; delivery compensation calc | Swap algorithms without if/else sprawl; satisfies Open/Closed |
| **Chain of Responsibility** | Disposition decision ladder; unsold-listing fallback ladder; return-eligibility checks | Ordered, escalating handlers each decide or pass on |
| **State** | Lifecycle of ReturnRequest, Order, ResaleListing, DeliveryJob, DeliveryOffer | Enforce legal transitions; no invalid state jumps |
| **Observer / Pub-Sub (event bus)** | Cross-module reactions: notifications, dashboards, green credits, relisting | The core loose-coupling mechanism |
| **Adapter** | AI provider, maps/routing, payments, SMS/email/push | Swappable, mockable external services (Dependency Inversion) |
| **Repository** | Data access per aggregate root | Domain depends on `IRepository`, not the DB |
| **Factory** | Creating graders, notification channels, listing objects | Centralized, testable construction |
| **Specification** | Fraud rules, eligibility rules, buyer–item matching rules | Composable, reusable boolean rules |
| **Facade** | One application-service entry point per subsystem (`ReturnsService`, `MarketplaceService`) | UI/API talks to simple interfaces, not internals |
| **Command** | User/system actions (InitiateReturn, AcceptOffer) | Queueable, auditable, undo-friendly |
| **Mediator** | Delivery-offer coordination among partners | Partners never know about each other |

## Quality Bar

- Write unit tests for domain rules (grading thresholds, disposition routing, compensation calc, fallback ladder, fit recommendation). Mock all adapters.
- Consistent error handling: never leak raw exceptions to the UI; every failed AI/network call has a graceful fallback and a clear user-facing message.
- Structured logging on domain events (feeds the ops console).
- Folder structure must mirror the architecture layers above.
