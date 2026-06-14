/**
 * Repository interface for persisting and reading audit log records.
 *
 * Every state-machine transition on a ReturnRequest produces an AuditRecord
 * that is written here for compliance, ops review, and fraud investigation.
 *
 * Implementations:
 *  - DynamoAuditLogRepository    (infrastructure/persistence) — DynamoDB (append-only)
 *  - InMemoryAuditLogRepository  (infrastructure/persistence) — dev/test
 *
 * Requirements: 14.6, 16.1, 16.2
 */

import type { ReturnState } from './ReturnRequest.js';

/**
 * A single immutable audit entry recording one state transition.
 */
export interface AuditRecord {
  /** Unique identifier for this audit entry. */
  id: string;
  /** The ReturnRequest whose state changed. */
  returnRequestId: string;
  /** State the ReturnRequest was in before the transition. */
  previousState: ReturnState;
  /** State the ReturnRequest moved into. */
  newState: ReturnState;
  /** Wall-clock time of the transition. */
  timestamp: Date;
  /**
   * Identity of the actor that triggered the transition.
   * Values: a `customerId`, `"system"` (automated), or an admin/operator identifier.
   */
  actor: string;
  /**
   * Human-readable description of the event or command that caused the transition.
   * e.g. "completeMediaCapture", "ItemGraded event", "admin override"
   */
  trigger: string;
}

/**
 * IAuditLogRepository — append-only storage contract for audit records.
 *
 * Implementations MUST NOT allow deletion or mutation of existing records.
 */
export interface IAuditLogRepository {
  /**
   * Persist a new audit record.
   *
   * @param record - The fully-populated AuditRecord to store.
   */
  save(record: AuditRecord): Promise<void>;

  /**
   * Retrieve all audit records for a return request, ordered by timestamp ascending
   * (oldest first — preserves the causal chain of events).
   *
   * @param returnRequestId - The parent ReturnRequest identifier.
   * @returns               All audit records for that return (empty array if none).
   */
  findByReturnRequestId(returnRequestId: string): Promise<AuditRecord[]>;
}
