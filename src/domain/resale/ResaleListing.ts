/**
 * ResaleListing — aggregate root for the circular-commerce relisting marketplace.
 *
 * When a returned item is graded, instead of always shipping it back to a
 * warehouse, it is relisted for resale close to where it already is:
 *
 *   - Grade A → "Like New" direct-transfer listing. If a buyer in the SAME city
 *     purchases within the transfer window, a delivery partner moves the item
 *     directly from the original owner to the new buyer (no warehouse hop).
 *     If the window lapses with no local buyer, it is returned to the warehouse.
 *
 *   - Grade B → "Returned" discounted listing that simply stays in the
 *     returned-items list until bought (ships from the holder).
 *
 *   - Grade C → "Refurbished" discounted listing with a local-buyer window.
 *     If the window lapses with no buyer, the platform extends a keep-offer
 *     (gift card to keep the item) rather than paying to warehouse a low-value
 *     refurb unit.
 *
 * The aggregate owns its own lifecycle transitions; callers mutate it only
 * through the exported pure transition functions so invariants stay centralized.
 */

import type { ConditionGrade } from '../shared/types.js';

// ─── Value types ────────────────────────────────────────────────────────────

/** How a relisted item is fulfilled. Derived from the condition grade. */
export type ListingType =
  | 'direct_transfer' // Grade A — same-city peer-to-peer transfer
  | 'returned_discounted' // Grade B — discounted returned-items list
  | 'refurbished_discounted'; // Grade C — discounted refurbished list

/** Lifecycle state of a listing. */
export type ListingStatus =
  | 'active' // listed and purchasable
  | 'sold' // a buyer purchased it
  | 'returned_to_warehouse' // window lapsed (Grade A) — shipped back
  | 'keep_offer_extended' // window lapsed (Grade C) — gift-card offer open
  | 'kept_by_customer' // original owner accepted the keep-offer
  | 'cancelled';

/** How a sold item reaches the buyer. */
export type FulfilmentMode =
  | 'direct_transfer' // delivery partner moves item owner → buyer
  | 'warehouse_ship'; // shipped via normal logistics

/** Delivery allocation captured when an item is sold via direct transfer. */
export interface TransferAllocation {
  deliveryPartner: string;
  mode: FulfilmentMode;
  etaHours: number;
  fromCustomerId: string;
  toCustomerId: string;
}

/** Keep-offer extended to the original owner when a Grade C item finds no buyer. */
export interface KeepOffer {
  giftCardAmount: number;
  currency: string;
  status: 'pending' | 'accepted';
  extendedAt: Date;
  acceptedAt: Date | null;
}

// ─── Aggregate ──────────────────────────────────────────────────────────────

export interface ResaleListing {
  id: string;
  /** The return request this listing originated from. */
  returnRequestId: string;
  productId: string;
  productName: string;
  /** Primary display image — uses the customer's actual return photo (front shot) if available. */
  imageUrl: string | null;
  /** All photo URLs submitted by the customer during the return — shown as a gallery. */
  returnPhotoUrls: string[];
  /** AI-generated condition summary shown to prospective buyers. */
  conditionReasoning: string | null;
  /** Specific defects detected, shown as bullet points on the listing. */
  defects: Array<{ location: string; severity: string; description: string }>;

  grade: Extract<ConditionGrade, 'A' | 'B' | 'C'>;
  conditionLabel: string; // "Like New" | "Good (Returned)" | "Refurbished"
  listingType: ListingType;

  originalPrice: number;
  listedPrice: number; // discounted price
  currency: string;

  /** The customer who currently holds the item (original returner). */
  sellerCustomerId: string;
  sellerCity: string;

  status: ListingStatus;
  listedAt: Date;
  /** Local-buyer window end (Grade A & C). Null for Grade B (no window). */
  expiresAt: Date | null;

  buyerCustomerId: string | null;
  buyerCity: string | null;
  soldAt: Date | null;
  fulfilment: TransferAllocation | null;

  keepOffer: KeepOffer | null;
}

// ─── Domain errors ──────────────────────────────────────────────────────────

export class ListingNotPurchasableError extends Error {
  constructor(listingId: string, status: ListingStatus) {
    super(`Listing '${listingId}' is not purchasable (status: ${status}).`);
    this.name = 'ListingNotPurchasableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Pure transitions ───────────────────────────────────────────────────────

/**
 * Decide how a purchase is fulfilled and produce the sold listing.
 *
 * Direct transfer (no warehouse) applies only when the listing supports it
 * (Grade A / C with an active local-buyer window) AND the buyer is in the same
 * city AND the window has not lapsed. Otherwise the sale ships via warehouse.
 */
export function sellListing(
  listing: ResaleListing,
  params: {
    buyerCustomerId: string;
    buyerCity: string;
    now: Date;
    deliveryPartner: string;
    directTransferEtaHours: number;
    warehouseShipEtaHours: number;
  },
): ResaleListing {
  if (listing.status !== 'active') {
    throw new ListingNotPurchasableError(listing.id, listing.status);
  }

  const windowOpen = listing.expiresAt === null || params.now < listing.expiresAt;
  const supportsDirect =
    listing.listingType === 'direct_transfer' ||
    listing.listingType === 'refurbished_discounted';
  const sameCity =
    normalizeCity(params.buyerCity) === normalizeCity(listing.sellerCity);

  const useDirectTransfer = supportsDirect && sameCity && windowOpen;

  const fulfilment: TransferAllocation = {
    deliveryPartner: params.deliveryPartner,
    mode: useDirectTransfer ? 'direct_transfer' : 'warehouse_ship',
    etaHours: useDirectTransfer
      ? params.directTransferEtaHours
      : params.warehouseShipEtaHours,
    fromCustomerId: listing.sellerCustomerId,
    toCustomerId: params.buyerCustomerId,
  };

  return {
    ...listing,
    status: 'sold',
    buyerCustomerId: params.buyerCustomerId,
    buyerCity: params.buyerCity,
    soldAt: params.now,
    fulfilment,
  };
}

/**
 * Resolve a listing whose local-buyer window has lapsed with no buyer.
 *
 *   - Grade A (direct_transfer)      → return to warehouse
 *   - Grade C (refurbished)          → extend a keep-offer (gift card)
 *   - Grade B (returned_discounted)  → unchanged (no window)
 */
export function expireListing(
  listing: ResaleListing,
  params: { now: Date; keepOfferGiftCardAmount: number },
): ResaleListing {
  if (listing.status !== 'active') return listing;
  if (listing.expiresAt === null || params.now < listing.expiresAt) return listing;

  if (listing.listingType === 'refurbished_discounted') {
    return {
      ...listing,
      status: 'keep_offer_extended',
      keepOffer: {
        giftCardAmount: params.keepOfferGiftCardAmount,
        currency: listing.currency,
        status: 'pending',
        extendedAt: params.now,
        acceptedAt: null,
      },
    };
  }

  // Grade A direct transfer with no local buyer → ship back to warehouse.
  return { ...listing, status: 'returned_to_warehouse' };
}

/** Original owner accepts the gift-card keep-offer and keeps the item. */
export function acceptKeepOffer(listing: ResaleListing, now: Date): ResaleListing {
  if (listing.status !== 'keep_offer_extended' || !listing.keepOffer) {
    throw new Error(
      `Listing '${listing.id}' has no pending keep-offer to accept.`,
    );
  }
  return {
    ...listing,
    status: 'kept_by_customer',
    keepOffer: { ...listing.keepOffer, status: 'accepted', acceptedAt: now },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}
