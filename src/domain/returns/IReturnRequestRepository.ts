/**
 * Repository interface for persisting and retrieving ReturnRequest aggregates.
 *
 * Implementations:
 *  - DynamoReturnRequestRepository    (infrastructure/persistence) — DynamoDB
 *  - InMemoryReturnRequestRepository  (infrastructure/persistence) — dev/test
 *
 * Requirements: 16.1, 16.2
 */

import type { ReturnRequest } from './ReturnRequest.js';

/**
 * IReturnRequestRepository — storage contract for ReturnRequest aggregates.
 *
 * All writes are upserts; concurrent writes MUST use optimistic locking or
 * DynamoDB conditional expressions to prevent lost updates.
 */
export interface IReturnRequestRepository {
  /**
   * Persist a new or updated ReturnRequest.
   *
   * @param returnRequest - The aggregate root to store.
   */
  save(returnRequest: ReturnRequest): Promise<void>;

  /**
   * Retrieve a ReturnRequest by its unique identifier.
   *
   * @param id - The ReturnRequest's UUID.
   * @returns  The matching aggregate, or `null` if not found.
   */
  findById(id: string): Promise<ReturnRequest | null>;

  /**
   * Retrieve all ReturnRequests belonging to a customer, ordered by creation
   * date descending (most recent first).
   *
   * @param customerId - The customer's identifier.
   * @returns          All return requests for that customer (empty array if none).
   */
  findByCustomerId(customerId: string): Promise<ReturnRequest[]>;

  /**
   * Retrieve the single active ReturnRequest for a given order-item, if any.
   *
   * One order-item can only have one non-cancelled return at a time
   * (enforced by a uniqueness constraint at the persistence layer).
   *
   * @param orderItemId - The order-item identifier.
   * @returns           The matching ReturnRequest, or `null` if none exists.
   */
  findByOrderItemId(orderItemId: string): Promise<ReturnRequest | null>;

  /**
   * Count the number of returns a customer has initiated within the last N days.
   *
   * Used by the fraud-score calculator to detect high-frequency return behaviour
   * (Requirement 7.1).
   *
   * @param customerId - The customer's identifier.
   * @param days       - The lookback window in calendar days (e.g. 90).
   * @returns          The count of return requests initiated in that window.
   */
  countByCustomerInDays(customerId: string, days: number): Promise<number>;

  /**
   * Permanently remove a ReturnRequest. Used when a customer abandons a return
   * (e.g. after an item-mismatch verdict) and restarts the flow from scratch.
   *
   * @param id - The ReturnRequest's UUID.
   * @returns  `true` if a record was removed, `false` if none existed.
   */
  delete(id: string): Promise<boolean>;
}
