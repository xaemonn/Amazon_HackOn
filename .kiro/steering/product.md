# Second Life Commerce — Build Brief

> **For:** Claude Code / Kiro AI (autonomous build agent)
> **What this is:** A complete, opinionated specification for an end-to-end web platform. Read it top to bottom before scaffolding. Sections 3 and 4 are **non-negotiable engineering and UX constraints** that apply to every line of code you write.

---

## 1. Project Overview

We are building **Second Life Commerce**, an Amazon-style e-commerce platform whose differentiator is an intelligent returns-and-resale engine. The thesis: today a return travels to a warehouse, waits 1–3 weeks for a human to inspect and grade it, then gets a disposition decision — by which point reverse-logistics and inspection cost often exceed the item's value, so usable goods get liquidated for pennies or scrapped.

**We move grading and the disposition decision to the customer's phone, at the moment they tap "Return."** A multimodal AI verifies the item is genuine, grades its condition, parses the return reason, and a decision engine instantly routes it to its best next life — frequently shipped **directly to the next buyer in the same city, never touching a warehouse**.

The platform has four pillars:
1. A believable Amazon-grade storefront (so the demo reads as a real product).
2. **Zero-Touch Returns** — on-device AI grading + instant disposition + refund.
3. **Reverse logistics** including **FlexRoute** (dynamic gig-style delivery dispatch).
4. A **Second Life Marketplace** where graded items find a second owner with full condition transparency, plus **FitGuard** return-prevention.

### Subsystem codenames (use these as module names)
- **Zero-Touch Returns** — the return capture + AI grading + disposition flow.
- **Disposition Engine** — decides each returned item's next life.
- **FlexRoute** — dynamic delivery-partner dispatch and route recalculation.
- **Second Life Marketplace** — the resale storefront + listing lifecycle.
- **FitGuard** — pre-purchase return prevention (fit/size/expectation guidance).
- **GreenLedger** — green-credit wallet + sustainability impact tracking.

---

## 2. Primary Goal & Priorities

**Customer satisfaction is the #1 success metric.** Every decision — UI, latency, copy, defaults — optimizes for a customer finding the platform effortless and trustworthy. When a trade-off arises between "technically elegant" and "obviously easier for the customer," the customer wins.

Secondary (the business case the product must visibly support): reduce reverse-logistics and inspection cost, raise recovery value on returns, cut waste, and create resale revenue.

---

## 5. System Modules (feature inventory)

Priority tags: **[DEMO]** = hero path, build first and flawless · **[MVP]** = needed for a believable end-to-end · **[STRETCH]** = breadth/polish, may be stubbed.

### 5.1 Platform Shell & Identity
- [MVP] Nav bar (logo, category menu, search, account, cart), footer, responsive layout, breadcrumbs, global loading/toast states, empty/404 states
- [MVP] Sign up / login (email or phone + OTP), logout, profile, **address book** (multi, default), saved payment methods (mockable), notification preferences
- [STRETCH] Password reset, social login, pincode serviceability check, EN/Hindi toggle, role switch (customer/seller/partner/admin)

### 5.2 Catalog & Discovery
- [MVP] Home (categories, deals, recommendations, second-life rail), category pages, search with autocomplete, results page with filters (price, brand, rating, **condition**) + sort
- [MVP] PDP — gallery + zoom, specs, price, delivery estimate, seller, Add to Cart / Buy Now, ratings & reviews
- [DEMO] **Condition variants on PDP** — New / Certified Renewed / Open Box / Used–Like New, each priced, each "X available" (storefront proof of the resale loop)
- [DEMO] **FitGuard size/fit guidance on PDP** (see §6.5)
- [STRETCH] Q&A, review photos + helpful votes, wishlist, recently viewed, share

### 5.3 Cart, Checkout & Orders
- [MVP] Cart (add/remove/qty, move to wishlist), checkout (address → delivery → payment → review → place), prepaid + **COD**, order confirmation, My Orders, order detail with **"Return or replace"** entry point
- [STRETCH] Coupons, **green-credit redemption at checkout**, order tracking timeline, GST invoice, cancel order, EMI/BNPL (mock)

### 5.4 Zero-Touch Returns — see §6.1 (CORE)
### 5.5 Disposition Engine — see §6.2 (CORE)
### 5.6 Reverse Logistics & FlexRoute — see §6.3 and §6.4 (CORE)
### 5.7 Second Life Marketplace & resale lifecycle — see §6.3 (CORE)
### 5.8 FitGuard return prevention — see §6.5
### 5.9 GreenLedger — see §6.6

### 5.10 Seller Portal
- [MVP] Dashboard; **returns dashboard** (each return's AI grade + disposition + reason, live); **recovery analytics** (recovered via resale/refurb vs lost to liquidation)
- [STRETCH] Inventory/listings, disposition preferences (grade-&-resell opt-in, returnless thresholds, SKU exclusions), account-health view

### 5.11 Admin / Ops Console
- [MVP] Returns ops overview (volume, dispositions, recovery rate, fraud caught); **fraud/manual-review queue** (flagged items + photos + reason → approve/reject)
- [STRETCH] AI confidence monitoring, multi-channel inventory view, demand-matching view, savings/sustainability aggregates

### 5.12 Cross-cutting
- [MVP] **Notifications** across the journey (placed, shipped, delivered, return submitted, grade ready, refund issued, item relisted, sold, pickup offered) via in-app + email/SMS/push (channels behind adapters); image upload/storage/serving; form validation; auth/session security
- [STRETCH] Help center/FAQ, support chat/ticket, post-delivery rating prompt, analytics/telemetry, admin roles, photo-data consent notice

---

## 6. Key Flows (detailed)

### 6.1 Zero-Touch Returns (the core capture + grading flow)

**6.1.1 Initiation**
- [DEMO] Eligibility check (return window? show per-item policy) → select item(s) → structured reason picker (defective / damaged in transit / wrong item / size-fit / not as described / changed mind / …) + free-text
- [DEMO] **Guided media capture** — request 3 photos (front, back, defect/label) + a short video with on-screen framing guides; retake supported
- [MVP] **Upload-from-gallery fallback** so the demo never depends on a live camera

**6.1.2 AI grading (multimodal, behind `IConditionGrader`/`IIdentityVerifier` adapters)**
- [DEMO] **Identity verification** — match photos to catalog image → genuine vs wrong/counterfeit (fraud + "box of rocks" defense)
- [DEMO] **Condition grade** A/B/C/D with reasoning
- [DEMO] **Defect detection** — locate & describe damage
- [DEMO] **Reason parsing** — NLP on free-text, reconciled with what photos show
- [MVP] Confidence score; fraud/anomaly signal (identity mismatch + reason mismatch + return-history → risk flag)
- [STRETCH] Auto condition summary, reused verbatim as the resale listing's condition report

**Acceptance:** given seeded item photos, the flow returns a grade + identity verdict + refund estimate in a few seconds, with a visible progress UI and a graceful fallback if the AI call fails.

### 6.2 Disposition Engine (instant routing — Strategy + Chain of Responsibility)

A returned item enters an ordered chain; each handler decides or passes:
- [DEMO] **Instant decision** from grade + item value + **local buyer demand** + distance + fraud score:
  - Grade A **and** a buyer exists nearby → **Instant Match: ship direct to that buyer, skip the warehouse** (§6.3 "instant-match" path)
  - Grade A, no buyer yet → **list for resale, hold-at-home** (§6.3 "listed-resale" path)
  - Grade B → route to nearest Renewed/refurb partner
  - Low-value Grade C/D → **returnless "keep it + refund"** or donation pickup
  - Recyclable/unsellable → recycling route
  - Fraud-flagged → route to warehouse for manual inspection
- [DEMO] **Instant refund estimate** shown on-device before pickup
- [MVP] One-sentence plain-language explanation of the decision

**Two complementary resale paths** (important conceptual split):
- **Instant match** — demand exists *now* → the return becomes the buyer's delivery directly.
- **Listed resale** — no buyer yet → hold-at-home listing (next section). This is what your earlier question was about.

### 6.3 Second Life Marketplace + Resale Lifecycle (the hold-at-home answer)

Two entry points, one lifecycle: (a) a return the engine routed to "resell," and (b) a customer's own item listed P2P.

**State machine (ResaleListing):** `Draft → Listed → Reserved → AwaitingPickup → InTransit → Sold` with side-branches `Expired` and `Cancelled`.

1. **List & snapshot** — AI grades the item, generates a condition report + real photos, and freezes a **Condition Snapshot** (photos + grade + timestamp). The item **physically stays with the seller** (zero warehousing — preserves the core cost advantage). Listing goes live with a **listing window** (default 10 days, configurable).
2. **Browse & trust** — listing shows the actual unit's photos, the AI condition report, the grade badge, price-vs-new, and warranty. (Marketplace UI: dedicated Second Life storefront, filter by grade/discount, personalized refurb recommendations.)
3. **On purchase** —
   - Listing → `Reserved` (lock to prevent double-sell).
   - **FlexRoute dispatches a pickup-and-deliver job** (§6.4) — offered to a delivery partner already near the seller.
   - At pickup, agent does a **quick re-verification scan**; AI compares to the snapshot:
     - **Match** → deliver to buyer; seller paid; `Sold`; GreenLedger updates; buyer can rate.
     - **Mismatch / item missing** → buyer auto-refunded **or** re-matched to another unit; listing `Cancelled`; seller reliability score decreases. (This is how condition-drift and "seller lost/sold it elsewhere" are handled.)
4. **If the window expires unsold → Fallback Ladder (Chain of Responsibility), each step seller-notified:**
   1. Auto **price-drop + re-promote** (dynamic pricing); optionally extend window (re-grade if extended significantly).
   2. Offer to move item to a **local hub/consignment** for broader reach.
   3. Route to **liquidation** partner (bulk recovery).
   4. Offer **donation** (green credits) or **recycling**.
   5. **De-list**, return the decision to the seller.

**Edge cases to implement:** double-sell prevention via `Reserved` + locking; snapshot expiry/re-grade on window extension; buyer protection on mismatch; seller reliability score; configurable window length.

**P2P specifics [STRETCH]:** "Sell your item" capture → AI grade → suggested price → listing; escrow/payment-hold; seller payout/wallet.

### 6.4 FlexRoute — Dynamic Delivery-Partner Dispatch (the new feature)

Gig-style dispatch: partners run a base route of normal forward deliveries and can opt into nearby reverse jobs for extra pay.

**Entities:** `DeliveryPartner` (current location, ordered route of `Stop`s, vehicle/capacity, rating), `DeliveryJob` (pickup, drop, item, time window, priority), `DeliveryOffer` (job + partner + proposed compensation + detour estimate + expiry).

**Offer state machine (`DeliveryOffer` / partner status):** `Idle → OnRoute → OfferPending → (Accepted → EnRouteToPickup → AtPickup → EnRouteToDrop → Delivered)` or `(Rejected/Expired → OnRoute)`.

**Process:**
1. A reverse `DeliveryJob` is created (instant-match return, or resale pickup-on-sale).
2. **Dispatch** finds candidates near the job; for each, compute **insertion cost** (extra distance/time) of slotting pickup+drop into the partner's current route — use a **cheapest-insertion heuristic** (full VRP is out of scope).
3. Rank candidates by insertion cost (+ rating/availability). **Offer** to the best one (or broadcast to top-K via a Mediator). Offer shows the partner: extra ₹ earned, extra distance/time, and the impact on their ETAs. Offer has a short expiry.
4. **Accept** → route recalculated (stops inserted optimally), all ETAs updated, **compensation locked**, job assigned; affected customers see updated tracking. **Reject/timeout** → next candidate; after K rounds with no taker, **escalate** (raise compensation / fall back to a dedicated pickup / queue).
5. Partner executes: navigate → pickup (scan/verify) → drop (deliver). **Earnings credited.**

**Compensation (Strategy, configurable):** `base_bonus + per_km_rate × extra_distance + urgency_multiplier (+ optional surge by local supply/demand)`.

**Routing (Adapter):** `IRoutingProvider` → Google Directions / Mapbox / OpenRouteService for real distance + ETA; **haversine straight-line fallback** for offline/demo determinism.

**Partner-facing UI [MVP]:** "On route" view, incoming offer card (map + extra pay + detour + accept/reject + countdown), active-job navigation, earnings tally.

**Why it matters in the pitch:** this is the mechanism that makes "skip the warehouse" physically real, turns idle delivery capacity into return capacity (cost efficiency), and gives partners new earnings (a fairness/ecosystem story). It films well — show an offer pop, an accept, and a route redraw.

### 6.5 FitGuard — Return Prevention (the size-tip feature)

Stops the return before it happens by guiding the purchase. Three stacked signals feed one recommendation.

1. **Brand/category fit prior** — a per-(brand × category) offset learned from aggregate size/fit return data and catalog metadata. e.g., "Adidas footwear runs ~1 size small." Cold-start friendly (works with zero personal history).
2. **Personal fit profile** — per customer, per category: the size they actually **keep** (not just order) across past purchases. e.g., learns the user is a true 8 in most footwear.
3. **Cohort signal** — customers with a similar profile and what they kept for this exact product. e.g., "82% of customers with your fit kept size 9 for this shoe."

**Recommendation engine** combines all three → a recommended size + a one-line, plain-language tip, surfaced **inline at the size selector** with the suggested size pre-highlighted and an optional "Why?" expander. **Never blocks purchase.** (Canonical demo: usual size 8, but FitGuard recommends 9 for these Adidas with the reason shown.)

**Other prevention signals [STRETCH]:** color/material expectation notes ("appears darker in person"), "commonly returned for: runs small" transparency, electronics compatibility/spec checks, and an anti-**bracketing** nudge (give enough confidence in one size that the user doesn't order three).

**Cold start & data:** lean on brand priors + cohort when personal history is thin; optionally bootstrap with a quick fit survey (usual size / height / weight). **Feedback loop:** track whether a shown tip reduced returns; feed outcomes back to tune priors.

**Acceptance:** on a configured "runs small" product, an unauthenticated user sees the brand-prior tip; a user with purchase history sees a personalized recommendation; the tip is dismissible and does not block checkout.

### 6.6 GreenLedger — Green Credits & Impact

- [DEMO] **Green-credit wallet** (balance + earn/spend history); customer earns credits for choosing donate / recycle / keep-it / resale-friendly options (credits worth slightly more than cash to nudge the sustainable choice)
- [DEMO] **Personal impact dashboard** — "You diverted N items from landfill / saved ~X kg CO₂"
- [MVP] Redeem credits at checkout
- [STRETCH] Badges/tiers; platform-wide impact counter on the home page

---

## 7. Domain Model (core entities & relationships)

- **User** (roles: `Customer`, `Seller`, `DeliveryPartner`, `Admin`) — has `Address[]`, `PaymentMethod[]`, `reliabilityScore`, `FitProfile`
- **Product** — has `ProductVariant[]` (each with a **condition**: New / OpenBox / Renewed / Used-grade, price, stock)
- **Order** → `OrderItem[]` — references variants; `paymentType` (prepaid/COD); lifecycle state
- **ReturnRequest** — order item ref, `reason`, `media[]`, state; produces one **ConditionAssessment** (grade, defects[], identityMatch, confidence, fraudScore) and one **DispositionDecision** (route, refundEstimate, explanation)
- **Refund** — method (original / store-credit / green-credit), status
- **ConditionSnapshot** — photos[], grade, report, timestamp (frozen at listing)
- **ResaleListing** — sourceItem ref, `conditionSnapshot`, `windowExpiresAt`, price, state machine (§6.3)
- **DeliveryJob** — pickup, drop, item, timeWindow, priority, state
- **DeliveryPartner** — currentLocation, `Route` (`Stop[]`), vehicle/capacity, rating, earnings
- **DeliveryOffer** — job ref, partner ref, compensation, detourEstimate, expiresAt, state
- **EarningsRecord** — partner ref, job ref, amount
- **FitProfile** (per user/category) · **BrandFitPrior** (per brand/category) · **FitRecommendation** (transient)
- **GreenCreditTransaction** · **ImpactRecord**
- **Notification** · **AuditEvent** · **Review**

---

## 9. Build Sequencing (48-hour milestones)

Stay demo-ready at every checkpoint:
1. **Skeleton + seed** — layered project scaffold, DI/composition root, event bus, one seeded product + one seeded delivered order. (Modules: Identity, Catalog, Ordering — mocked thin.)
2. **Return capture** — §6.1.1 flow with gallery-upload fallback.
3. **AI grading + disposition** — §6.1.2 + §6.2 behind adapters with deterministic mocks; **over-invest here**, it's the hero.
4. **Resale relist** — §6.3 listing creation + Second Life storefront showing the just-returned unit with its condition report.
5. **FlexRoute** — §6.4 dispatch + offer card + accept + route redraw + "₹/legs saved" number.
6. **GreenLedger + Seller view** — §6.6 impact dashboard + seller returns/recovery dashboard.
7. **FitGuard** — §6.5 brand-prior + personalized tip on PDP.
8. **Backfill** — MVP polish (notifications, validation, empty states), then STRETCH as time allows.

---

## 10. Demo Hero Path (make this flawless; rehearse cold)

1. Open a delivered order → **Return** (≤3 taps).
2. Pick a reason → **capture 3 photos + video** with guides.
3. **Watch AI grade live** — identity verified, condition graded, defect spotted, fraud cleared.
4. **Instant disposition + refund estimate** — "Like-new → going to a buyer near you → ₹X now," in plain language.
5. **FlexRoute fires** — a nearby partner gets an offer (extra pay + detour), **accepts**, route redraws; "₹Y and 3 shipping legs saved."
6. **Item appears live in the Second Life storefront** with its AI condition report + real photos.
7. (Optional) Show the **hold-at-home** alternative + a **FitGuard** size tip preventing a return up front.
8. **Impact dashboard ticks up** (1 item saved, green credits earned); cut to the **Seller dashboard** showing grade, disposition, recovered value.

---

## 11. Configurable Parameters (put in config, not code)
- Listing window length (default 10 days) · grade thresholds (A/B/C/D cutoffs) · returnless-refund max item value · FlexRoute compensation formula constants · offer expiry + max offer rounds · fallback-ladder timings · green-credit accrual + redemption rates.

## 12. Assumptions & Mocks (for the build agent)
- AI provider, maps/routing, payments, and SMS/email/push are all accessed through adapters; each ships with a **deterministic mock** so the demo runs without live keys. Real providers can be swapped in via config.
- Seed data: a small product catalog (include at least one "runs small" footwear item for FitGuard and one item with New + Open Box + Renewed variants), one customer with purchase history, 2–3 delivery partners with active routes, and one buyer "nearby" to trigger the instant-match path.
- Tech stack is intentionally unspecified here; whatever is chosen, honor Sections 3, 4, and 8.
