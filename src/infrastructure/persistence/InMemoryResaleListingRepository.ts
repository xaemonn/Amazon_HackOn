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
    let active = Array.from(this.store.values()).filter(
      (l) => l.status === 'active',
    );

    // When a city is provided, only show listings from that city.
    // Without a city filter every shopper would see every city's returns.
    if (city) {
      const target = normalizeCity(city);
      active = active.filter((l) => normalizeCity(l.sellerCity) === target);
    }

    active.sort((a, b) => b.listedAt.getTime() - a.listedAt.getTime());
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
