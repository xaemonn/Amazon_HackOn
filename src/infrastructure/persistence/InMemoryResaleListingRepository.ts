/**
 * InMemoryResaleListingRepository — dev/demo implementation of
 * IResaleListingRepository. Swapped for a DynamoDB-backed implementation in
 * production (the query methods map cleanly onto GSIs:
 * status-index, returnRequestId-index, expiresAt-index).
 */

import type { IResaleListingRepository } from '../../domain/resale/IResaleListingRepository.js';
import type { ResaleListing } from '../../domain/resale/ResaleListing.js';
import { normalizeCity } from '../../domain/resale/ResaleListing.js';

export class InMemoryResaleListingRepository implements IResaleListingRepository {
  private readonly store = new Map<string, ResaleListing>();

  async save(listing: ResaleListing): Promise<void> {
    this.store.set(listing.id, listing);
  }

  async findById(id: string): Promise<ResaleListing | null> {
    return this.store.get(id) ?? null;
  }

  async findByReturnRequestId(returnRequestId: string): Promise<ResaleListing | null> {
    for (const listing of this.store.values()) {
      if (listing.returnRequestId === returnRequestId) return listing;
    }
    return null;
  }

  async findActive(city?: string): Promise<ResaleListing[]> {
    const active = Array.from(this.store.values()).filter(
      (l) => l.status === 'active',
    );

    // Most-recent first; if a city is given, surface same-city listings first
    // (these are the ones eligible for instant direct transfer).
    active.sort((a, b) => b.listedAt.getTime() - a.listedAt.getTime());
    if (city) {
      const target = normalizeCity(city);
      active.sort((a, b) => {
        const aSame = normalizeCity(a.sellerCity) === target ? 0 : 1;
        const bSame = normalizeCity(b.sellerCity) === target ? 0 : 1;
        return aSame - bSame;
      });
    }
    return active;
  }

  async findExpirable(now: Date): Promise<ResaleListing[]> {
    return Array.from(this.store.values()).filter(
      (l) =>
        l.status === 'active' &&
        l.expiresAt !== null &&
        now.getTime() >= l.expiresAt.getTime(),
    );
  }

  async findAll(): Promise<ResaleListing[]> {
    return Array.from(this.store.values()).sort(
      (a, b) => b.listedAt.getTime() - a.listedAt.getTime(),
    );
  }

  clear(): void {
    this.store.clear();
  }
}
