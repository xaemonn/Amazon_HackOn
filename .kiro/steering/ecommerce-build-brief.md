---
title: E-Commerce Storefront Build Brief
inclusion: manual
---

# E-Commerce Storefront — Build Brief

> **Companion to the Zero-Touch Returns spec.** This is the Amazon-like storefront the returns feature plugs into. It is generated and built the same way: feed the kickoff prompts (companion file) into Kiro as **New feature → Requirements-first** specs, under the same steering files you already have.

---

## 0. Read this first — scope reality check

**What this is:** the believable shell around the returns star — not a full Amazon clone. With the returns feature already eating most of your 48 hours, the storefront exists to (a) let a judge browse a credible site and reach the **Return** button on a real order, and (b) show graded returns reappearing as **Open Box / Renewed** listings (the second-life payoff). That's the bar. Everything else is breadth you stub or seed.

**Priority tags (same as the returns spec):**
- **[DEMO]** — on the browse → order → return critical path. Build for real, first.
- **[MVP]** — makes the storefront feel like a genuine product. Build after the demo path.
- **[STRETCH]** — breadth/polish. Stub, seed, or skip under time pressure.

**Existing steering applies unchanged — do NOT redo it.** The `engineering-principles`, `ux-hci-principles`, `module-boundaries`, and `tech` (AWS-native) steering files already in `.kiro/steering/` govern this storefront too: SOLID, layered architecture, modules talk only via facades + the event bus, TypeScript end-to-end, React/Vite frontend, Lambda/API Gateway/DynamoDB/S3/Cognito/EventBridge, every external service behind an adapter with a deterministic mock so it runs locally with no AWS keys.

---

## 1. How this composes with the returns feature (the most important section)

The storefront and the returns feature are separate modules that share a domain and communicate through the event bus and shared repository interfaces. Get this seam right and integration is a swap, not a rewrite.

### 1.1 Shared domain entities — storefront OWNS, returns CONSUMES
The returns spec currently seeds stub versions of these. At integration, the storefront becomes the **source of truth** and the returns feature reads them through the shared repository interfaces. Keep these exact fields, because the returns logic depends on them:

| Entity | Fields the returns feature depends on | Why |
|---|---|---|
| `Customer` | `id`, `addresses[]`, `paymentMethods[]` | Ownership check (R1.7), refund destination (R12/R17), return-history for fraud |
| `Product` | `id`, `title`, `brand`, `catalogImageUrl`, `category` | Identity verification matches return photos against `catalogImageUrl` (R4); brand feeds FitGuard later |
| `ProductVariant` (condition listing) | `condition` (New / OpenBox / Renewed / Used-grade), `price`, `stock`, `sourceReturnId?`, `conditionReportUrl?`, `unitPhotos?` | This is where graded returns become sellable second-life items |
| `Order` | `id`, `customerId`, `placedDate`, `status`, `paymentType` (prepaid/COD) | Order context; COD matters to the RTO/returns narrative |
| `OrderItem` | `id`, `orderId`, `productId`, `variantId`, `unitPrice`, `quantity`, `deliveryDate` | Eligibility window is computed from `deliveryDate` (R1); `unitPrice` is the **item value** in disposition routing (R10) |
| `Address` | standard fields | Delivery and return pickup |
| `PaymentMethod` | `id`, `type`, masked ref | Refund destination |

### 1.2 Event seam (uses the shared event bus from the module-boundaries steering)
- **Storefront publishes** → `OrderPlaced`, `OrderShipped`, `OrderDelivered`. The returns feature's eligibility depends on delivery; these are already in the returns design's event list.
- **Returns publishes** → `ListingRequested` (Catalog consumes it), `DeliveryJobCreated` (Logistics/FlexRoute), `RefundIssued` (Payments/Orders update the order + refund the payment method).
- **Catalog consumes `ListingRequested`** → creates an **Open Box / Renewed `ProductVariant`** for the source product, attaching the return's AI condition report and the actual unit photos. This is the visible "item reappears in the store" moment in your demo.

### 1.3 UI seam
- The **Order Detail** page renders a **"Return or replace items"** button on each eligible item → launches the returns flow's first screen (eligibility). The returns frontend already lives under `presentation/web`; the storefront's order-detail page is the entry point into it.

### 1.4 Integration note
Build the storefront so `Customer`, `Product`, `Order`, `OrderItem` are exposed through the same repository interfaces the returns feature already depends on. At integration you delete the returns spec's mock seeds and point its repositories at the storefront's data. No returns logic should change.

---

## 2. Modules

### 2.1 Identity & Accounts
- [DEMO] Login / signup (email or phone + OTP) via **Amazon Cognito** (formalizes the returns spec's MockAuth → Cognito); session handling
- [DEMO] Seeded demo customer with a delivered order (so the return path works on day one)
- [MVP] Profile; **address book** (multi, default); saved payment methods (UPI / card / COD, mockable)
- [MVP] Notification preferences
- [STRETCH] Password reset, social login, order-history-driven personalization

### 2.2 Catalog & Product
- [DEMO] Product Detail Page — image gallery + zoom, title, price, specs, delivery estimate, Add to Cart / Buy Now
- [DEMO] **Condition variants on the PDP** — New / Certified Renewed / Open Box / Used–Like New, each priced, each "X available," each linking to its `ProductVariant`. This is the storefront side of the second-life loop.
- [DEMO] **Second-life listing ingestion** — a `ListingRequested` event from returns creates an Open Box/Renewed variant with the AI condition report + real unit photos
- [MVP] Category / department pages; product catalog data model with `catalogImageUrl` per product
- [MVP] Inventory/stock per variant
- [STRETCH] Product Q&A, comparison, recently-viewed

### 2.3 Search & Discovery
- [MVP] Search bar with autocomplete; results page with filters (price, brand, rating, **condition**) and sort
- [MVP] Home rails: deals, categories, recommendations, **a "Second Life / Renewed" rail**
- [STRETCH] Real relevance ranking, personalized recommendations (a simple keyword/category match is plenty for the demo)

### 2.4 Cart
- [MVP] Add / remove / update quantity; cart page; subtotal; move to wishlist/save-for-later
- [STRETCH] Persisted cart across sessions, coupon entry

### 2.5 Checkout & Payments
- [MVP] Checkout flow — address select → delivery option → payment → review → place order → confirmation
- [MVP] Payment options: prepaid (UPI/card mock) and **COD**; publishes `OrderPlaced`
- [STRETCH] Real payment-gateway integration, EMI/BNPL, gift cards, **green-credit redemption** (the returns/GreenLedger seam)
- *Note:* for the demo you can seed delivered orders directly, so a fully working checkout is **[MVP], not [DEMO]** — the return path doesn't require it.

### 2.6 Orders (the return entry point)
- [DEMO] My Orders list; **Order Detail** page with item images, status, delivery date, and the **"Return or replace items"** button (the seam into the returns flow)
- [DEMO] A seeded **delivered** order on the demo account
- [MVP] Order status timeline; cancel order (pre-shipment); invoice/GST download
- [MVP] Consume `RefundIssued` → reflect refund + return status on the order
- [STRETCH] Live tracking map, reorder

### 2.7 Reviews & Ratings
- [MVP] Star ratings + written reviews on PDP, verified-purchase badge
- [STRETCH] Review photos, helpful votes, review submission flow

### 2.8 Home / Landing
- [DEMO] A credible Amazon-like home page (nav, search, category tiles, a deals rail, the Second-Life rail) — this is the first thing a judge sees, so it carries the "looks real" impression
- [MVP] Footer (About, Help, Returns Policy, Sustainability, T&C), responsive shell

### 2.9 Cross-cutting
- [MVP] Notifications (order placed/shipped/delivered, refund issued) via in-app + the channel adapter from the returns design
- [MVP] Global nav/footer, breadcrumbs, loading/empty/404 states, form validation, image upload/serving, auth/session security
- [STRETCH] Help center/FAQ, support chat, accessibility pass beyond WCAG AA basics, analytics

---

## 3. Shared Domain Model (build these in the storefront)

Beyond §1.1's shared entities, the storefront owns: `Category`, `CartItem`/`Cart`, `Review`, `Wishlist`, `Coupon` (stretch), `DeliveryOption`. Model `ProductVariant` as the unit that carries condition + price + stock, so a "New" product and its "Open Box" second-life sibling are two variants of the same `Product` — that's what makes the returns loop visible on a single PDP.

---

## 4. Demo-critical path through the storefront (build this first)

The minimal storefront slice that makes the returns demo land:
1. **Home page** — credible Amazon-like landing (the "looks real" first impression).
2. **PDP** — a product showing New + Open Box + Renewed condition variants (the second-life payoff visible up front).
3. **Account + My Orders** — logged-in demo customer with a **seeded delivered order**.
4. **Order Detail** — the eligible item with the **"Return or replace"** button → hands off to the returns flow.
5. **Second-Life rail / listing** — after a return is processed, the relisted unit appears here with its condition report (closes the loop on camera).

Everything else (full search, cart, checkout, reviews) is breadth you build only after this path is solid.

---

## 5. Recommended Kiro specs (don't make one giant spec)

Group the storefront into **two to three** feature-scoped specs, generated the same way as returns. Suggested grouping, in build priority order:

1. **Storefront Browsing** — Catalog & Product (incl. condition variants + second-life ingestion), Search & Discovery, Home/Landing. *(Highest priority: the "looks like Amazon" surface + the second-life loop.)*
2. **Accounts & Orders** — Identity/Cognito, account/addresses/payments, My Orders, Order Detail **with the return entry point**, `RefundIssued` consumption. *(Second priority: the path to the Return button.)*
3. **Cart & Checkout** — Cart, Checkout, Payments, `OrderPlaced`. *(Lowest priority — orders can be seeded, so build this only if the first two are solid.)*

Kickoff prompts for all three are in the companion file. Build sequence: Browsing → Accounts & Orders → (Cart & Checkout if time) → then integrate the returns feature by pointing its repositories at the storefront's real `Customer`/`Product`/`Order` data and deleting the returns mock seeds.

---

## 6. What to stub vs build (the honest cut for 48 hours)

- **Build for real:** home page, PDP with condition variants, account + seeded delivered order, order detail + Return button, the second-life rail, basic search.
- **Seed instead of build:** orders (seed delivered orders rather than relying on a full checkout), product catalog (a handful of well-chosen products, including one with New/Open-Box/Renewed variants and one "runs small" item for FitGuard later).
- **Stub or skip:** real payment processing, real search relevance, reviews submission, wishlist, recommendations engine, tracking maps, help center. Static or hard-coded is fine — judges look at the hero path, not whether your wishlist persists.
