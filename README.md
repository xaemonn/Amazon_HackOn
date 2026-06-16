# Second Life Commerce — Zero-Touch Returns Platform

> Amazon HackOn submission · branch `main`
> Repository: https://github.com/xaemonn/Amazon_HackOn

An AI-driven returns platform that grades a returned item from photos, routes it to the best next destination (resell, refurbish, peer-to-peer match, returnless refund, donate, or manual review), and re-lists resale-grade items on an in-app marketplace.

The codebase was built spec-first with **Kiro** — the requirements, design, and task breakdown live under [.kiro/specs/](.kiro/) (`zero-touch-returns` and `accounts-and-orders`), alongside steering docs that capture the engineering and UX principles.

---

## Problem being addressed

Returns of lower-value and long-tail items are often uneconomic to process: the reverse-logistics and manual re-inspection cost can exceed the item's value, so usable goods get written off or sit unused. The platform replaces manual inspection and disposition with an automated grade-and-route pipeline, and gives resale buyers a verified condition summary so second-hand items are trustworthy to buy.

---

## What the system does

- **AI condition grading** — assesses returned-item photos and assigns a condition grade (A / B / C / D) with reasoning, a list of detected defects, and a confidence score. Backed by Amazon Bedrock when enabled, with a deterministic mock grader for offline/demo runs.
- **Reason reconciliation** — for `wrong_item` / `not_as_described` returns, an AI reason parser checks whether the photos are consistent with the customer's stated reason.
- **Fraud scoring** — a pure domain service combines the identity-verification verdict, reconciliation status, unsupported-claim count, and the customer's recent return-history frequency into a single 0.0–1.0 score.
- **Smart routing** — a Chain-of-Responsibility disposition engine maps the grade, return reason, item value, fraud score, confidence, and nearby-buyer demand to one disposition route and a refund estimate.
- **Resale marketplace** — resale-grade items (A / B / C) are listed for purchase at a grade-based discount, each with a local-buyer transfer window. Same-city Grade-A ("Like New") purchases are fulfilled as a direct peer-to-peer transfer via a local delivery partner; otherwise the item ships from the warehouse. When a window lapses without a buyer, each grade resolves differently — Grade A returns to the warehouse, **Grade B is marked down and re-opened for a re-grade** with fresh photos, and Grade C converts to a gift-card "keep offer" to the original owner (see [Resale lifecycle](#resale-lifecycle)).
- **Return-abuse guard** — before purchase and at return time, a policy flags customers with high recent-return frequency, warning them and (above a higher threshold) blocking returns on cheap, abuse-prone items.
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
│   ├── db/             ProductModel, ReviewModel, seedProducts (Mongo product seeder)
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

The DI container reads `ZTR_BEDROCK_ENABLED`. When `true`, it wires the live Bedrock grader, identity verifier, and reason parser (and needs AWS credentials + a region — see [Configuration](#configuration)). Otherwise it wires the mock implementations so the system runs end-to-end with no AWS account. The default Bedrock model id is `us.anthropic.claude-haiku-4-5-20251001-v1:0` (overridable via `ZTR_BEDROCK_MODEL_ID`). Before a Bedrock vision call, uploaded photos are downscaled with `sharp` (longest edge 768px) to keep latency down.

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

### Return reasons (`ReturnReason`)

`defective`, `damaged_in_transit`, `wrong_item`, `size_fit`, `not_as_described`, `changed_mind`.

### Domain events

`ReturnInitiated`, `ItemGraded`, `FraudFlagged`, `DispositionAssigned`, `DeliveryJobCreated`, `ListingRequested`, `ManualReviewInitiated`, `ReturnCompleted`, `ReturnCancelled`.

---

## Resale lifecycle

When a graded return is routed to resale, `ResaleService` creates a listing priced from the grade and opens a local-buyer transfer window (default 4 days).

| Grade | Listing type | Label | Discount | On purchase | If the window lapses unsold |
|---|---|---|---|---|---|
| A | `direct_transfer` | Like New | 0% | Same-city → direct P2P transfer via a delivery partner; else warehouse ship | Returned to warehouse |
| B | `returned_discounted` | Good (Returned) | 25% | Warehouse ship | Marked down a further 15%, flagged `needsRegrade`, window re-opened |
| C | `refurbished_discounted` | Refurbished | 40% | Warehouse ship | Converted to a gift-card "keep offer" (30% of original) to the owner |

- **Background sweeper** — the API runs an expiry sweep every 60s (also exposed as `POST /api/resale/expire`) that resolves lapsed windows. A `force-expire` endpoint lapses a single listing immediately for demos.
- **Re-grade** — a marked-down Grade B listing can be re-graded (`POST /api/resale/listings/:id/regrade`) with fresh photos: the AI grader re-assesses, the item is re-priced and the window re-opens — or, if it now grades D, it is pulled to the warehouse.
- **P2P match** — every sale records an ops-only seller↔buyer mapping (`SellerBuyerMatch`) used for delivery routing.

---

## Tech stack

| Area | Technology |
|---|---|
| Backend runtime | Node.js ≥ 18, TypeScript (ESM), run via `tsx` |
| HTTP | Express 5, `cors` |
| AI | `@aws-sdk/client-bedrock-runtime` (Bedrock Converse), with mock adapters |
| Image processing | `sharp` (downscaling photos before Bedrock calls) |
| Database | MongoDB via `mongoose` — users (auth) and reviews |
| Auth | `jsonwebtoken` (JWT) + `bcryptjs` |
| Frontend | React 18, React Router 6, Vite 6, TypeScript |
| Testing | Vitest + `fast-check` (property-based tests) |
| Lint | ESLint |

**Persistence note.** The product catalog is a **static in-code list** (~48 demo products in `catalogRoutes.ts`); both `/api/products` and `/api/catalog` serve from it, so the catalog needs no database. MongoDB is used for **users** (auth) and **reviews** (reviews fall back to an in-memory store when Mongo is unreachable). Orders, returns, condition assessments, disposition decisions, resale listings, audit logs, the OTP store, and demand signals all use **in-memory repositories**. The `ProductModel` + `npm run seed` script (which can populate a Mongo product catalog from the Rainforest API or static fallback data) is optional and **not wired to the live endpoints**.

---

## API

Base path `/api`. Default port `3001` (`PORT`, falling back to `ZTR_API_PORT`). Mounted in `server.ts`.

**Health**
- `GET /api/health`

**Auth** (`/api/auth`)
- `POST /signup`
- `POST /login` — supports MongoDB users and the named demo accounts (in-memory fallback)
- `POST /demo` — one-click judge sign-in (no credentials, no DB needed; sets the `demo`/`isJudge` flag)
- `GET /me`
- `PATCH /profile`
- `POST /logout`

**Products** (`/api/products`) — served from the static catalog
- `GET /` — supports `?search=` and `?category=`
- `GET /:id`

**Catalog** (`/api/catalog`)
- `GET /` — supports `?search=` and `?category=`
- `GET /:id`
- `GET /images/list`
- `PUT /images/:productId` — upload a catalog reference image (raw image bytes)
- `GET /images/:productId`

**Orders** (`/api/orders`)
- `GET /` — orders for the authenticated customer (lazily seeds a starter order)
- `GET /:id` — ownership-checked
- `POST /checkout`
- `DELETE /dev/reset` — DEV: wipe the customer's order history (re-seeds on next `GET`)

**Returns** (`/api/returns`)
- `GET /eligibility`
- `GET /policy` — pre-purchase return-abuse policy decision
- `POST /` — initiate a return
- `POST /:id/reason`
- `POST /:id/media`
- `POST /:id/complete-capture` — trigger grading
- `GET /:id`
- `GET /:id/progress`
- `DELETE /:id` — abandon a return (e.g. after a wrong-item verdict) so the item can be returned again
- `DELETE /dev/clear` — DEV: wipe all return data

**Resale** (`/api/resale`)
- `GET /listings` — supports `?city=` (bias to a city) and `?scope=all` (include sold/resolved)
- `GET /listings/:id`
- `POST /listings/:id/purchase`
- `POST /listings/:id/accept-keep-offer`
- `POST /listings/:id/regrade`
- `POST /listings/:id/force-expire`
- `POST /expire`
- `DELETE /dev/clear`

**Reviews** (`/api/reviews`)
- `POST /` — submit a product review (auth required)
- `GET /?productId=…` — reviews + average rating for a product

**Judge harness** (`/api/judge`) — judge login only
- `POST /products` — add a product (name + up to 3 images) and seed a delivered order for it, so a judge can run the full return → grading flow against their own images

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
| Grade-B markdown / re-grade window | 15% / 4 days |
| Grade-C keep-offer gift card | 30% of original |
| Direct-transfer / warehouse-ship ETA | 4 h / 72 h |
| Default seller city | Bengaluru |
| Return-abuse warn / block thresholds | 3 / 5 recent returns |
| OTP validity / max attempts / lockout | 10 min / 3 / 15 min |
| Manual-review SLA | 24 h |

### Runtime environment variables

Read by `server.ts` and the infrastructure adapters:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` / `ZTR_API_PORT` | HTTP port (`PORT` wins) | `3001` |
| `MONGODB_URI` | MongoDB connection string (auth + reviews) | `mongodb://localhost:27017/amazon2` |
| `ZTR_CORS_ORIGINS` | Comma-separated allowed origins | all origins |
| `JWT_SECRET` | Secret for signing JWTs | `dev-secret-please-change` |
| `ZTR_BEDROCK_ENABLED` | `true` → live Bedrock; else mock AI | `false` |
| `ZTR_BEDROCK_MODEL_ID` | Bedrock model id | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `AWS_REGION` | Region for Bedrock (when enabled) | `us-east-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS credentials (when Bedrock enabled) | — |
| `RAINFOREST_API_KEY` | Optional, for the `npm run seed` product seeder | — |

Frontend (`src/presentation/web`): `VITE_API_BASE_URL` points the SPA at a deployed API (empty by default → uses the dev proxy to `localhost:3001`).

---

## Running locally

Prerequisites: Node.js ≥ 18. MongoDB is optional — auth falls back to in-memory demo accounts, reviews fall back to an in-memory store, and the catalog plus most other data is in-memory.

```bash
git clone https://github.com/xaemonn/Amazon_HackOn.git
cd Amazon_HackOn
git checkout main

# Backend
npm install
npm run dev          # tsx --env-file=.env --watch src/index.ts
# or: npm start      # tsx src/index.ts  (no .env required)

# Frontend (separate terminal)
cd src/presentation/web
npm install
npm run dev          # Vite dev server (proxies /api → localhost:3001)
```

To use live AI grading, set `ZTR_BEDROCK_ENABLED=true` plus AWS credentials and `AWS_REGION` in `.env`; otherwise the deterministic mock graders run with no AWS account.

Other scripts: `npm run seed` (optional — seed a Mongo product catalog), `npm test` / `npm run test:watch` (Vitest), `npm run lint`, `npm run build` (`tsc --noEmit`).

### Demo accounts

Named demo logins work even without MongoDB (in-memory fallback in `authRoutes`):

| Name | Email | Password |
|---|---|---|
| Prince | `prince@gmail.com` | `prince123` |
| Priya | `priya@gmail.com` | `priya123` |

There is also `POST /api/auth/demo` for a one-click judge session (also reachable from the `/judge` page), which unlocks the judge product test harness.

---

## Deployment

The repo ships configs for a split deployment (API + static SPA):

- **Backend → Render** (`render.yaml`): a Node web service that runs `npm install` / `npm start`. Set `MONGODB_URI`, `JWT_SECRET`, `ZTR_CORS_ORIGINS`, and (for live AI) `ZTR_BEDROCK_ENABLED`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`. Render injects `PORT`, which the server honors first.
- **Frontend → Netlify / Vercel**: build with `npm run build` in `src/presentation/web`. SPA fallback routing is configured for both — `public/_redirects` (Netlify) and `vercel.json` rewrites (Vercel) — so client-side routes resolve to `index.html`. Set `VITE_API_BASE_URL` to the deployed API origin at build time.

---

## Testing

The repo includes unit tests and `fast-check` property-based tests across the domain and application layers (e.g. `ReturnStateMachine.property.test.ts`, `DispositionChain.property.test.ts`, `FraudScoreCalculator.property.test.ts`, `AccountService.property.test.ts`, `IdentityService.property.test.ts`). Run with `npm test`.
