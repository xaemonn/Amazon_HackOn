/**
 * InMemoryAuditLogRepository — dev/test implementation of IAuditLogRepository.
 *
 * Stores audit records in-memory, keyed by returnRequestId.
 * Records are append-only (no deletion or mutation).
 *
 * Sorted by timestamp ascending on retrieval to preserve causal ordering.
 *
 * Requirements: 14.5
 */

import type { AuditRecord, IAuditLogRepository } from '../../domain/returns/IAuditLogRepository.js';

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  /** Storage: returnRequestId → ordered list of audit records */
  private readonly store = new Map<string, AuditRecord[]>();

  /**
   * Persist a new audit record.
   * Appends to the list for the given returnRequestId (creates the list if absent).
   */
  async save(record: AuditRecord): Promise<void> {
    const existing = this.store.get(record.returnRequestId);
    if (existing) {
      existing.push(record);
    } else {
      this.store.set(record.returnRequestId, [record]);
    }
  }

  /**
   * Retrieve all audit records for a return request, ordered by timestamp ascending.
   * Returns an empty array if no records exist for the given id.
   */
  async findByReturnRequestId(returnRequestId: string): Promise<AuditRecord[]> {
    const records = this.store.get(returnRequestId);
    if (!records || records.length === 0) {
      return [];
    }
    // Return a copy sorted by timestamp to preserve causal chain
    return [...records].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Return total number of stored records across all return requests.
   * Useful for tests.
   */
  get size(): number {
    let total = 0;
    for (const records of this.store.values()) {
      total += records.length;
    }
    return total;
  }

  /**
   * Clear all records (useful in tests for teardown).
   */
  clear(): void {
    this.store.clear();
  }
}
