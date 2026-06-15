/**
 * IResaleListingRepository — storage contract for ResaleListing aggregates.
 *
 * Implementations:
 *   - InMemoryResaleListingRepository (dev/demo)
 *   - (future) DynamoResaleListingRepository
 *
 * Queries are intentionally explicit (findActive, findExpirable, …) rather than
 * exposing a generic query API, so the access patterns stay obvious and a
 * production key-value/GSI design can implement each one efficiently.
 */

import type { ResaleListing } from './ResaleListing.js';

export interface IResaleListingRepository {
  /** Upsert a listing. */
  save(listing: ResaleListing): Promise<void>;

  /** Find a single listing by id, or null. */
  findById(id: string): Promise<ResaleListing | null>;

  /** Find the listing originating from a given return request, or null. */
  findByReturnRequestId(returnRequestId: string): Promise<ResaleListing | null>;

  /**
   * Browsable listings (status 'active'), most-recent first.
   * When `city` is provided, results may be ordered to surface same-city items.
   */
  findActive(city?: string): Promise<ResaleListing[]>;

  /**
   * Active listings whose local-buyer window has lapsed at `now`
   * (expiresAt !== null && now >= expiresAt). Used by the expiry sweeper.
   */
  findExpirable(now: Date): Promise<ResaleListing[]>;

  /** All listings (admin/debug). */
  findAll(): Promise<ResaleListing[]>;

  /** Remove every listing (dev/test reset). */
  clear(): void;
}
