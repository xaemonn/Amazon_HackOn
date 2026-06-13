---
title: UX & HCI Principles (Customer-Satisfaction-First)
inclusion: always
---

# UX & HCI Principles — MUST FOLLOW

**Customer satisfaction is the #1 success metric of this product.** When a trade-off arises between "technically elegant" and "obviously easier for the customer," the customer wins. Apply Nielsen's 10 usability heuristics throughout, plus the product-specific commitments below.

## Nielsen's heuristics, applied to this product

1. **Visibility of system status** — the AI grading step shows live progress ("Checking the item… Assessing condition… Done"), never a frozen spinner. Every return/order always shows its status and next step.
2. **Match to the real world** — plain language, not jargon. "We'll send this straight to a buyer near you" beats "Disposition: P2P direct route."
3. **User control & freedom** — retake photos, undo, cancel a return, go back a step. No dead ends.
4. **Consistency & standards** — reuse familiar Amazon-like patterns (cart, product page, order list) so the UI needs no learning.
5. **Error prevention** — validate uploads (blurry/missing photo → prompt a retake); prevent wrong-size purchases up front (see fit guidance).
6. **Recognition over recall** — show saved addresses, recently viewed, the order's product image inside the return flow. Never make the user remember IDs.
7. **Flexibility & efficiency** — offer power paths (Buy Now, one-tap reorder) alongside guided ones.
8. **Aesthetic & minimal design** — progressive disclosure; ask for one thing at a time, never a wall of fields. The return capture screen requests one photo at a time.
9. **Help users recover from errors** — friendly, specific messages with a clear recovery action.
10. **Help & documentation** — contextual hints (a "Why this size?" expander), an accessible help center.

## Product-specific UX commitments

- **Starting a return takes ≤3 taps** from an order.
- **The refund estimate is shown instantly**, on-device, before pickup — never "we'll tell you later."
- **Every AI decision is explained in one plain sentence** ("Because this is like-new and someone nearby wants it…").
- **Mobile-first and fully responsive** — assume the primary device is a phone.
- **Trust by transparency on resale** — real photos of the actual unit, the AI condition report, the grade badge, and the warranty are always visible on a second-life listing.
- **Fast perceived performance** — optimistic UI and skeleton loaders; never block the whole screen on a single async call.
- **Accessibility (WCAG AA basics)** — alt text, keyboard navigation, sufficient contrast, visible focus states.
- **Sensible defaults to minimize decisions** — default address, recommended refund method pre-selected, suggested size pre-highlighted.
