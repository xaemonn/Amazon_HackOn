/**
 * InMemoryReturnRequestRepository — dev/test implementation of IReturnRequestRepository.
 *
 * Stores ReturnRequest aggregates in-memory, keyed by id.
 * Used for local development and testing; swapped for DynamoDB in production.
 *
 * Requirements: 14.5, 7.1
 */

import type { IReturnRequestRepository } from '../../domain/returns/IReturnRequestRepository.js';
import type { ReturnRequest } from '../../domain/returns/ReturnRequest.js';

export class InMemoryReturnRequestRepository implements IReturnRequestRepository {
  /** Storage: returnRequest.id → ReturnRequest */
  private readonly store = new Map<string, ReturnRequest>();

  /**
   * Persist a new or updated ReturnRequest (upsert semantics).
   */
  async save(returnRequest: ReturnRequest): Promise<void> {
    this.store.set(returnRequest.id, returnRequest);
  }

  /**
   * Retrieve a ReturnRequest by its unique identifier.
   * Returns null if not found.
   */
  async findById(id: string): Promise<ReturnRequest | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Retrieve all ReturnRequests belonging to a customer, ordered by
   * createdAt descending (most recent first).
   */
  async findByCustomerId(customerId: string): Promise<ReturnRequest[]> {
    const results: ReturnRequest[] = [];
    for (const request of this.store.values()) {
      if (request.customerId === customerId) {
        results.push(request);
      }
    }
    return results.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /**
   * Retrieve the single active (non-cancelled) ReturnRequest for a given order-item.
   * Returns null if no active return exists for that order item.
   */
  async findByOrderItemId(orderItemId: string): Promise<ReturnRequest | null> {
    for (const request of this.store.values()) {
      if (request.orderItemId === orderItemId && request.state !== 'Cancelled') {
        return request;
      }
    }
    return null;
  }

  /**
   * Count the number of returns a customer has initiated within the last N days.
   * Used by the fraud-score calculator to detect high-frequency return behaviour.
   */
  async countByCustomerInDays(customerId: string, days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    let count = 0;
    for (const request of this.store.values()) {
      if (
        request.customerId === customerId &&
        request.createdAt.getTime() >= cutoff.getTime()
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Return total number of stored return requests.
   * Useful for tests.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all records (useful in tests for teardown).
   */
  clear(): void {
    this.store.clear();
  }
}
