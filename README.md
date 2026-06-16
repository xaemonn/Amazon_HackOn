# Second Life Commerce — Zero-Touch Returns Platform

> Amazon HackOn submission · branch `main`
> Repository: https://github.com/xaemonn/Amazon_HackOn

An AI-driven returns platform that grades a returned item from photos, routes it to the best next destination (resell, refurbish, peer-to-peer match, returnless refund, donate, or manual review), and re-lists resale-grade items on an in-app marketplace.

---

## Problem being addressed

Returns of lower-value and long-tail items are often uneconomic to process: the reverse-logistics and manual re-inspection cost can exceed the item's value, so usable goods get written off or sit unused. The platform replaces manual inspection and disposition with an automated grade-and-route pipeline, and gives resale buyers a verified condition summary so second-hand items are trustworthy to buy.

---

## What the system does

- **AI condition grading** — assesses returned-item photos and assigns a condition grade (A / B / C / D) with reasoning, a list of detected defects, and a confidence score. Backed by Amazon Bedrock when enabled, with a deterministic mock grader for offline/demo runs.
- **Reason reconciliation** — for `wrong_item` / `not_as_described` returns, an AI reason parser checks whether the photos are consistent with the customer's stated reason.
- **Fraud scoring** — a pure domain service combines the identity-verification verdict, reconciliation status, unsupported-claim count, and the customer's recent return-history frequency into a single 0.0–1.0 score.
- **Smart routing** — a Chain-of-Responsibility disposition engine maps the grade, return reason, item value, fraud score, confidence, and nearby-buyer demand to one disposition route and a refund estimate.
- **Resale marketplace** — resale-grade items (A / B / C) are listed for purchase. Same-city Grade-A purchases can be a direct transfer; otherwise the item ships from the warehouse. Grade-A listings have a transfer window; lapsed Grade-C listings convert to a gift-card "keep offer" to the original owner.
- **Size & fit advisor (returns prevention)** — a frontend brand-fit knowledge base plus a saved shopper size profile suggests the right size up-front to reduce size-related returns.

---

## Architecture

The backend follows a layered Domain-Driven Design / Clean Architecture split. Dependencies point inward; infrastructure implementations are chosen at startup by a dependency-injection container.

```
src/
├── domain/             Business rules, no framework dependencies
│   ├── account/        Customer, Address, PaymentMethod, NotificationPreferences
│   ├── disposition/    DispositionChainFactory, RoutingContext, RefundCalculator,
│   │   └── handlers/   ExplanationGenerator + the 10 chain handlers
│   ├── grading/        ConditionAssessment, FraudScoreCalculator, IConditionGrader,
│   │                   IIdentityVerifier, IReasonParser interfaces
│   ├── identity/       OtpRecord, Session, IOtpStore (OTP/session domain model)
│   ├── ordering/       Order, OrderItem, RefundStatus, IOrderRepository
│   ├── resale/         ResaleListing, ResalePricingPolicy, SellerBuyerMatch
│   ├── returns/        ReturnRequest, ReturnStateMachine, ReturnReason,
│   │                   ReturnEligibilityService, ReturnAbusePolicy, MediaCompleteness
│   └── shared/         Cross-cutting types, IEventBus, IAuthService
│       └── events/     Domain event definitions
├── application/        Use-case orchestrators
│   ├── account/        AccountService
│   ├── disposition/    DispositionOrchestrator
│   ├── grading/        GradingOrchestrator
│   ├── identity/       IdentityService
│   ├── ordering/       OrdersService
│   ├── resale/         ResaleService, ResaleListingHandler
│   ├── returns/        ReturnsFacade
│   └── hero-path-wiring.ts   Event-handler wiring for the grade→dispose path
├── infrastructure/     Adapters (interface implementations)
│   ├── ai/             Bedrock{ConditionGrader,IdentityVerifier,ReasonParser}
│   │                   and Mock equivalents
│   ├── auth/           MockAuthService, MongoUser
│   ├── config/         Typed config (DEFAULT_CONFIG + env overrides), DI container
│   ├── db/             ProductModel, ReviewModel, seedProducts
│   ├── events/         InProcessEventBus
│   ├── persistence/    In-memory repositories + InMemoryOtpStore
│   ├── seed/           Demo users, demo orders, InMemoryDemandSignalProvider
│   └── storage/        LocalFilesystemMediaStorage
├── presentation/
│   ├── api/            Express server + route modules
│   └── web/            React + Vite + TypeScript frontend
└── index.ts            Entry point (starts the API server)
```

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| Domain | Pure business logic and invariants. No Express, no AWS, no DB. |
| Application | Orchestrates domain objects and coordinates via the event bus. |
| Infrastructure | Concrete adapters for AI, persistence, storage, auth, events. Swapped at container init. |
| Presentation | Express HTTP API and the React web client. |

### AI adapter selection

The DI container reads `ZTR_BEDROCK_ENABLED`. When `true`, it wires the live Bedrock grader, identity verifier, and reason parser. Otherwise it wires the mock implementations so the system runs end-to-end with no AWS credentials. The default Bedrock model id is `us.anthropic.claude-haiku-4-5-20251001-v1:0` (overridable via `ZTR_BEDROCK_MODEL_ID`).

---

## The grading → disposition flow

1. A return is initiated against an order item (eligibility is checked first).
2. The customer submits a structured reason and uploads media references.
3. `complete-capture` triggers the `GradingOrchestrator`, which runs identity verification and condition grading (each with a configurable timeout and retry), optionally reconciles the stated reason, computes a fraud score, persists the `ConditionAssessment`, and publishes an `ItemGraded` event.
4. The `DispositionOrchestrator` (subscribed to `ItemGraded`) builds a `RoutingContext` and runs the disposition chain, persists a `DispositionDecision`, and publishes the route-specific event.
5. If the route lists the item, `ResaleListingHandler` creates a marketplace listing.

### ReturnRequest states

`Initiated → MediaCaptured → Grading → Graded → DispositionAssigned → {AwaitingPickup | Listed | Completed}`, with `ManualReview` and `Cancelled` as branch states. (Transitions are enforced by `ReturnStateMachine`.)

### Disposition chain (strict priority order)

The chain is wired in `DispositionChainFactory` in this exact order; the first handler whose condition matches assigns the route:

1. `WrongItemHandler`
2. `ManualReviewFlagHandler`
3. `FraudCheckHandler`
4. `LowConfidenceHandler`
5. `GradeAInstantMatchHandler`
6. `GradeAResaleHandler`
7. `GradeBRefurbishmentHandler`
8. `GradeCDLowValueHandler`
9. `GradeCDHighValueHandler`
10. `DefaultFallbackHandler`

### Disposition routes (`DispositionRoute`)

`instant_match`, `list_for_resale`, `refurbishment`, `returnless_refund`, `donate_or_recycle`, `manual_inspection`, `wrong_item_refund`, `wrong_item_unverified`.

### Domain events

`ReturnInitiated`, `ItemGraded`, `FraudFlagged`, `DispositionAssigned`, `DeliveryJobCreated`, `ListingRequested`, `ManualReviewInitiated`, `ReturnCompleted`, `ReturnCancelled`.

---

## Tech stack

| Area | Technology |
|---|---|
| Backend runtime | Node.js ≥ 18, TypeScript (ESM), run via `tsx` |
| HTTP | Express 5, `cors` |
| AI | `@aws-sdk/client-bedrock-runtime` (Bedrock Converse), with mock adapters |
| Image processing | `sharp` (downscaling photos before Bedrock calls) |
| Database | MongoDB via `mongoose` (users, products, reviews) |
| Auth | `jsonwebtoken` (JWT) + `bcryptjs` |
| Frontend | React 18, React Router 6, Vite 6, TypeScript |
| Testing | Vitest + `fast-check` (property-based tests) |
| Lint | ESLint |

Persistence note: orders, returns, condition assessments, disposition decisions, resale listings, audit logs, OTP store, and demand signals use **in-memory repositories**. MongoDB is used for users, products, and reviews.

---

## API

Base path `/api`. Default port `3001` (`ZTR_API_PORT`). Mounted in `server.ts`.

**Health**
- `GET /api/health`

**Auth** (`/api/auth`)
- `POST /signup`
- `POST /login`
- `POST /demo` — one-click judge sign-in (no credentials, no DB needed)
- `GET /me`
- `PATCH /profile`
- `POST /logout`

**Products** (`/api/products`)
- `GET /`
- `GET /:id`

**Catalog** (`/api/catalog`)
- `GET /`
- `GET /:id`
- `GET /images/list`
- `PUT /images/:productId` (image upload)
- `GET /images/:productId`

**Orders** (`/api/orders`)
- `GET /`
- `GET /:id`
- `POST /checkout`

**Returns** (`/api/returns`)
- `GET /eligibility`
- `GET /policy`
- `POST /` — initiate a return
- `POST /:id/reason`
- `POST /:id/media`
- `POST /:id/complete-capture` — trigger grading
- `GET /:id`
- `GET /:id/progress`
- `DELETE /dev/clear`

**Resale** (`/api/resale`)
- `GET /listings`
- `GET /listings/:id`
- `POST /listings/:id/purchase`
- `POST /listings/:id/accept-keep-offer`
- `POST /listings/:id/regrade`
- `POST /listings/:id/force-expire`
- `POST /expire`
- `DELETE /dev/clear`

**Reviews** (`/api/reviews`)
- `POST /`
- `GET /`

**Judge harness** (`/api/judge`)
- `POST /products`

**Media** (registered directly on the app in `server.ts`)
- `PUT /api/media/:returnId/:filename` — upload raw image/video bytes
- `GET /api/media/:returnId/:filename` — serve uploaded return media

**Frontend routes** (`App.tsx`): `/`, `/login`, `/catalog`, `/catalog/:productId`, `/marketplace`, `/marketplace/:id`, `/judge`, `/cart`, `/orders`, `/orders/:orderId`, `/account`, and the returns flow `/returns/{eligibility,reason,media,grading,result}`.

---

## Configuration

All business parameters live in `src/infrastructure/config/index.ts` as `DEFAULT_CONFIG`, each overridable with a `ZTR_<SECTION>_<PARAM>` environment variable. Selected defaults as they exist in the repo:

| Parameter | Default |
|---|---|
| Return window | 10 days |
| Condition / identity grader timeout | 90,000 ms each |
| Grading max retries | 0 |
| Fraud threshold | 0.7 |
| Unsupported-claim increment | 0.15 |
| Fraud history window | 90 days |
| Low-confidence threshold | 0.6 |
| Returnless-refund max value | ₹500 |
| Instant-match radius | 25 km |
| Refund % (instant_match / returnless_refund / list_for_resale) | 100 |
| Refund % (refurbishment / manual_inspection / donate_or_recycle) | 80 / 60 / 0 |
| Required photos / videos | 3 / 1 |
| Resale grade discount (A / B / C) | 0% / 25% / 40% |
| Resale transfer window | 4 days |
| Grade-C keep-offer gift card | 30% of original |
| Return-abuse warn / block thresholds | 3 / 5 recent returns |

Runtime env vars used by `server.ts`: `ZTR_API_PORT` (default `3001`), `MONGODB_URI` (default `mongodb://localhost:27017/amazon2`), `ZTR_CORS_ORIGINS`, `ZTR_BEDROCK_ENABLED`, `ZTR_BEDROCK_MODEL_ID`.

---

## Running locally

Prerequisites: Node.js ≥ 18. MongoDB is optional — auth falls back to in-memory demo accounts and most data is in-memory.

```bash
git clone https://github.com/xaemonn/Amazon_HackOn.git
cd Amazon_HackOn
git checkout main

# Backend
npm install
npm run dev          # tsx --watch src/index.ts  (uses .env if present)
# or: npm run start

# Frontend (separate terminal)
cd src/presentation/web
npm install
npm run dev          # Vite
```

Optional scripts: `npm run seed` (seed products into MongoDB), `npm test` / `npm run test:watch` (Vitest), `npm run lint`, `npm run build` (`tsc --noEmit`).

### Demo accounts

Named demo logins work even without MongoDB (in-memory fallback in `authRoutes`):

| Name | Email | Password |
|---|---|---|
| Prince | `prince@gmail.com` | `prince123` |
| Priya | `priya@gmail.com` | `priya123` |

There is also `POST /api/auth/demo` for a one-click judge session.

---

## Testing

The repo includes unit tests and `fast-check` property-based tests across the domain and application layers (e.g. `ReturnStateMachine.property.test.ts`, `DispositionChain.property.test.ts`, `FraudScoreCalculator.property.test.ts`, `AccountService.property.test.ts`, `IdentityService.property.test.ts`). Run with `npm test`.
