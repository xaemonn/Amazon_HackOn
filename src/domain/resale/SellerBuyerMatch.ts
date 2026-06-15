/**
 * SellerBuyerMatch — internal record that links a return seller (A) to the
 * buyer (B) who purchased that item from the marketplace.
 *
 * This mapping is NEVER exposed to either party via any customer-facing API.
 * It exists solely so the delivery-routing layer can add both the seller's
 * address and the buyer's address as stops on the same route, enabling
 * peer-to-peer direct transfer without disclosing identities.
 *
 * The delivery team (internal ops / logistics API) can query this via an
 * ops-only endpoint when building the delivery manifest.
 */

export type FulfilmentMode = 'direct_transfer' | 'warehouse_ship';

export interface SellerBuyerMatch {
  /** Unique match ID */
  id: string;
  /** The listing that was purchased */
  listingId: string;
  /** Return request that generated the listing */
  returnRequestId: string;
  /** Customer who returned the item (the "seller" in P2P) */
  sellerCustomerId: string;
  /** City where the seller / item currently is */
  sellerCity: string;
  /** Customer who bought the item */
  buyerCustomerId: string;
  /** City the buyer is in */
  buyerCity: string;
  /** Product details for the routing manifest */
  productId: string;
  productName: string;
  listedPrice: number;
  currency: string;
  /** How the item will move: seller→buyer directly, or via warehouse */
  fulfilmentMode: FulfilmentMode;
  /** Delivery partner assigned (for direct transfers) */
  deliveryPartner: string | null;
  /** When the match was created */
  matchedAt: Date;
}
