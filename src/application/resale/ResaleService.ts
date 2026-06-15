/**
 * ResaleService — application service for the circular-commerce relisting
 * marketplace. Orchestrates the ResaleListing aggregate, pricing policy and
 * repository; contains no transport/HTTP concerns.
 *
 * Responsibilities:
 *   - create a listing from a graded return (A/B/C)
 *   - browse active listings (optionally biased to the buyer's city)
 *   - purchase a listing (direct transfer vs warehouse ship is decided by the
 *     aggregate based on grade, city and window)
 *   - sweep expired windows (Grade A → warehouse, Grade C → keep-offer)
 *   - accept a Grade C keep-offer
 */

import { randomUUID } from 'crypto';
import type { IResaleListingRepository } from '../../domain/resale/IResaleListingRepository.js';
import type {
  ResaleListing,
  TransferAllocation,
} from '../../domain/resale/ResaleListing.js';
import type { InMemorySellerBuyerMatchRepository } from '../../infrastructure/persistence/InMemorySellerBuyerMatchRepository.js';
import {
  sellListing,
  expireListing,
  acceptKeepOffer,
} from '../../domain/resale/ResaleListing.js';
import {
  priceForGrade,
  keepOfferAmount,
  type ResalePricingConfig,
} from '../../domain/resale/ResalePricingPolicy.js';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateListingInput {
  returnRequestId: string;
  grade: 'A' | 'B' | 'C';
  productId: string;
  productName: string;
  /** Primary display image — should be the customer's actual front-facing return photo. */
  imageUrl: string | null;
  /** All return photo URLs for the gallery view. */
  returnPhotoUrls: string[];
  /** AI condition summary from the grading assessment. */
  conditionReasoning: string | null;
  /** Defects detected during grading. */
  defects: Array<{ location: string; severity: string; description: string }>;
  originalPrice: number;
  currency: string;
  sellerCustomerId: string;
  sellerCity: string;
}

export interface PurchaseInput {
  listingId: string;
  buyerCustomerId: string;
  buyerCity: string;
}

export interface PurchaseResult {
  listing: ResaleListing;
  fulfilment: TransferAllocation;
  directTransfer: boolean;
}

export interface ExpirySweepResult {
  scanned: number;
  returnedToWarehouse: number;
  keepOffersExtended: number;
}

// A small pool of delivery partners for same-city direct transfers (demo).
const DELIVERY_PARTNERS = [
  'Aarav (Local Flex)',
  'Meera (City Rider)',
  'Rohan (QuickMove)',
  'Sana (Metro Courier)',
];

// ─── Service ───────────────────────────────────────────────────────────────

export class ResaleService {
  constructor(
    private readonly repo: IResaleListingRepository,
    private readonly config: ResalePricingConfig & {
      directTransferEtaHours: number;
      warehouseShipEtaHours: number;
    },
    private readonly matchRepo?: InMemorySellerBuyerMatchRepository,
  ) {}

  /**
   * Create (or return the existing) resale listing for a graded return.
   * Idempotent per returnRequestId so duplicate disposition events are safe.
   */
  async createListingFromReturn(
    input: CreateListingInput,
    now: Date = new Date(),
  ): Promise<ResaleListing> {
    const existing = await this.repo.findByReturnRequestId(input.returnRequestId);
    if (existing) return existing;

    const pricing = priceForGrade(input.grade, input.originalPrice, this.config);
    const expiresAt = pricing.hasWindow
      ? new Date(now.getTime() + this.config.transferWindowDays * 24 * 60 * 60 * 1000)
      : null;

    const listing: ResaleListing = {
      id: randomUUID(),
      returnRequestId: input.returnRequestId,
      productId: input.productId,
      productName: input.productName,
      imageUrl: input.imageUrl,
      returnPhotoUrls: input.returnPhotoUrls,
      conditionReasoning: input.conditionReasoning,
      defects: input.defects,
      grade: input.grade,
      conditionLabel: pricing.conditionLabel,
      listingType: pricing.listingType,
      originalPrice: input.originalPrice,
      listedPrice: pricing.listedPrice,
      currency: input.currency,
      sellerCustomerId: input.sellerCustomerId,
      sellerCity: input.sellerCity,
      status: 'active',
      listedAt: now,
      expiresAt,
      buyerCustomerId: null,
      buyerCity: null,
      soldAt: null,
      fulfilment: null,
      keepOffer: null,
    };

    await this.repo.save(listing);
    return listing;
  }

  async listActive(city?: string): Promise<ResaleListing[]> {
    return this.repo.findActive(city);
  }

  async getById(id: string): Promise<ResaleListing | null> {
    return this.repo.findById(id);
  }

  async getAll(): Promise<ResaleListing[]> {
    return this.repo.findAll();
  }

  /**
   * Purchase a listing. The aggregate decides direct-transfer vs warehouse-ship.
   */
  async purchase(input: PurchaseInput, now: Date = new Date()): Promise<PurchaseResult> {
    const listing = await this.repo.findById(input.listingId);
    if (!listing) {
      throw new Error(`Resale listing '${input.listingId}' not found.`);
    }

    const sold = sellListing(listing, {
      buyerCustomerId: input.buyerCustomerId,
      buyerCity: input.buyerCity,
      now,
      deliveryPartner: this.pickDeliveryPartner(),
      directTransferEtaHours: this.config.directTransferEtaHours,
      warehouseShipEtaHours: this.config.warehouseShipEtaHours,
    });

    await this.repo.save(sold);

    const fulfilment = sold.fulfilment!;

    // Record the internal P2P seller↔buyer mapping for delivery routing.
    // This is intentionally NOT returned to the caller — it's ops-only.
    if (this.matchRepo) {
      await this.matchRepo.create({
        listingId: listing.id,
        returnRequestId: listing.returnRequestId,
        sellerCustomerId: listing.sellerCustomerId,
        sellerCity: listing.sellerCity,
        buyerCustomerId: input.buyerCustomerId,
        buyerCity: input.buyerCity,
        productId: listing.productId,
        productName: listing.productName,
        listedPrice: listing.listedPrice,
        currency: listing.currency,
        fulfilmentMode: fulfilment.mode,
        deliveryPartner: fulfilment.deliveryPartner ?? null,
      });
    }

    return {
      listing: sold,
      fulfilment,
      directTransfer: fulfilment.mode === 'direct_transfer',
    };
  }

  /**
   * Sweep all listings whose local-buyer window has lapsed and resolve them.
   * Safe to call repeatedly (idempotent for already-resolved listings).
   */
  async expireDue(now: Date = new Date()): Promise<ExpirySweepResult> {
    const expirable = await this.repo.findExpirable(now);
    let returnedToWarehouse = 0;
    let keepOffersExtended = 0;

    for (const listing of expirable) {
      const resolved = expireListing(listing, {
        now,
        keepOfferGiftCardAmount: keepOfferAmount(listing.originalPrice, this.config),
      });
      if (resolved.status === listing.status) continue;
      await this.repo.save(resolved);
      if (resolved.status === 'returned_to_warehouse') returnedToWarehouse += 1;
      if (resolved.status === 'keep_offer_extended') keepOffersExtended += 1;
    }

    return { scanned: expirable.length, returnedToWarehouse, keepOffersExtended };
  }

  /** Force-resolve a single listing's window immediately (demo/ops helper). */
  async forceExpire(listingId: string, now: Date = new Date()): Promise<ResaleListing> {
    const listing = await this.repo.findById(listingId);
    if (!listing) throw new Error(`Resale listing '${listingId}' not found.`);
    // Force the window to be already lapsed so expiry logic resolves it.
    const resolved = expireListing(
      { ...listing, expiresAt: new Date(now.getTime() - 1) },
      { now, keepOfferGiftCardAmount: keepOfferAmount(listing.originalPrice, this.config) },
    );
    await this.repo.save(resolved);
    return resolved;
  }

  /** Original owner accepts the Grade C gift-card keep-offer. */
  async acceptKeepOffer(listingId: string, now: Date = new Date()): Promise<ResaleListing> {
    const listing = await this.repo.findById(listingId);
    if (!listing) throw new Error(`Resale listing '${listingId}' not found.`);
    const kept = acceptKeepOffer(listing, now);
    await this.repo.save(kept);
    return kept;
  }

  clear(): void {
    this.repo.clear();
  }

  private pickDeliveryPartner(): string {
    return DELIVERY_PARTNERS[Math.floor(Math.random() * DELIVERY_PARTNERS.length)]!;
  }
}
