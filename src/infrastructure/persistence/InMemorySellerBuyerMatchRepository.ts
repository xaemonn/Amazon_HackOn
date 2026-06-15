/**
 * InMemorySellerBuyerMatchRepository — stores internal P2P seller↔buyer
 * mappings created when a marketplace purchase completes.
 *
 * These records are NEVER exposed to customers. They exist so that the
 * delivery-routing layer can add both the seller's and buyer's addresses
 * as stops on the same route without disclosing either party's details.
 *
 * In production this would be backed by an internal DB table with strict
 * access controls (ops/logistics only, no customer-facing APIs).
 */

import { randomUUID } from 'crypto';
import type { SellerBuyerMatch } from '../../domain/resale/SellerBuyerMatch.js';

export interface CreateMatchInput {
  listingId: string;
  returnRequestId: string;
  sellerCustomerId: string;
  sellerCity: string;
  buyerCustomerId: string;
  buyerCity: string;
  productId: string;
  productName: string;
  listedPrice: number;
  currency: string;
  fulfilmentMode: 'direct_transfer' | 'warehouse_ship';
  deliveryPartner: string | null;
}

export class InMemorySellerBuyerMatchRepository {
  private readonly store = new Map<string, SellerBuyerMatch>();

  async create(input: CreateMatchInput): Promise<SellerBuyerMatch> {
    const match: SellerBuyerMatch = {
      id: randomUUID(),
      ...input,
      matchedAt: new Date(),
    };
    this.store.set(match.id, match);
    console.log('[SellerBuyerMatch] P2P route node created', {
      matchId: match.id,
      seller: match.sellerCustomerId,
      buyer: match.buyerCustomerId,
      mode: match.fulfilmentMode,
      cities: `${match.sellerCity} → ${match.buyerCity}`,
    });
    return match;
  }

  async findByListingId(listingId: string): Promise<SellerBuyerMatch | null> {
    for (const m of this.store.values()) {
      if (m.listingId === listingId) return m;
    }
    return null;
  }

  /** Ops/logistics only — returns all matches for routing manifests. */
  async findAll(): Promise<SellerBuyerMatch[]> {
    return Array.from(this.store.values()).sort(
      (a, b) => b.matchedAt.getTime() - a.matchedAt.getTime(),
    );
  }
}
