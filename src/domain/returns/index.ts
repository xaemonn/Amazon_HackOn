// Returns domain module — ReturnRequest entity, state machine, value objects, repositories

import type { MediaReference, ReturnReason } from '../shared/types.js';
import type { ConditionAssessment } from '../grading/index.js';
import type { DispositionDecision } from '../disposition/index.js';

// ─── Return State Machine ────────────────────────────────────────────────────

/**
 * All possible states in the ReturnRequest lifecycle.
 * Transitions are enforced by the state machine — no invalid jumps allowed.
 */
export type ReturnState =
  | 'Initiated'
  | 'MediaCaptured'
  | 'Grading'
  | 'Graded'
  | 'DispositionAssigned'
  | 'AwaitingPickup'
  | 'Listed'
  | 'Completed'
  | 'Cancelled'
  | 'ManualReview';

// ─── Return Request Props ────────────────────────────────────────────────────

/**
 * Properties composing a ReturnRequest entity.
 */
export interface ReturnRequestProps {
  /** Unique identifier for this return request. */
  id: string;
  /** The customer who initiated the return. */
  customerId: string;
  /** The specific order item being returned. */
  orderItemId: string;
  /** The parent order. */
  orderId: string;
  /** The product being returned. */
  productId: string;
  /** Current lifecycle state. */
  state: ReturnState;
  /** Structured return reason, or null if not yet submitted. */
  reason: ReturnReason | null;
  /** Free-text reason details (trimmed, 1–500 chars), or null. */
  reasonDetails: string | null;
  /** Captured media assets (photos/video). */
  media: MediaReference[];
  /** AI condition assessment result, or null if not yet graded. */
  conditionAssessment: ConditionAssessment | null;
  /** Disposition decision, or null if not yet assigned. */
  dispositionDecision: DispositionDecision | null;
  /** When the return was initiated. */
  createdAt: Date;
  /** Last modification timestamp. */
  updatedAt: Date;
}

// ─── Return Request Repository ───────────────────────────────────────────────

/**
 * Repository interface for persisting and querying ReturnRequest aggregates.
 * Infrastructure implements this with DynamoDB (live) or in-memory (local).
 */
export interface IReturnRequestRepository {
  /** Persist a return request (create or update). */
  save(returnRequest: ReturnRequestProps): Promise<void>;
  /** Find a return request by its unique ID. */
  findById(id: string): Promise<ReturnRequestProps | null>;
  /** Find all return requests for a given customer. */
  findByCustomerId(customerId: string): Promise<ReturnRequestProps[]>;
  /** Find the return request for a specific order item. */
  findByOrderItemId(orderItemId: string): Promise<ReturnRequestProps | null>;
  /** Count returns by a customer within the last N days (for fraud heuristics). */
  countByCustomerInDays(customerId: string, days: number): Promise<number>;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

/**
 * A record of a state transition in the return lifecycle.
 */
export interface AuditRecord {
  /** Unique identifier for this audit entry. */
  id: string;
  /** The return request this audit belongs to. */
  returnRequestId: string;
  /** State before the transition. */
  previousState: ReturnState;
  /** State after the transition. */
  newState: ReturnState;
  /** When the transition occurred. */
  timestamp: Date;
  /** Who or what triggered the transition (customerId, "system", adminId). */
  actor: string;
  /** What caused the transition (e.g. "media_submitted", "grading_complete"). */
  trigger: string;
}

/**
 * Repository interface for persisting and querying audit log entries.
 */
export interface IAuditLogRepository {
  /** Persist an audit record. */
  save(record: AuditRecord): Promise<void>;
  /** Find all audit records for a return request, ordered chronologically. */
  findByReturnRequestId(returnRequestId: string): Promise<AuditRecord[]>;
}

// ─── Media Storage ───────────────────────────────────────────────────────────

/**
 * Result of media validation (format, size, corruption checks).
 */
export interface MediaValidationResult {
  /** Whether the media passed all validation checks. */
  valid: boolean;
  /** List of issues found (empty if valid). */
  issues: string[];
}

/**
 * Adapter interface for media storage operations.
 * Implementations: S3 adapter (live), local filesystem adapter (dev/demo).
 */
export interface IMediaStorage {
  /**
   * Generate a presigned URL for the client to upload media directly.
   * @param storageKey - The target storage key/path.
   * @param contentType - MIME type of the upload (e.g. "image/jpeg").
   * @param expiresInSeconds - URL validity duration.
   * @returns The presigned upload URL.
   */
  getPresignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<string>;

  /**
   * Generate a presigned URL for downloading/viewing stored media.
   * @param storageKey - The storage key of the asset.
   * @param expiresInSeconds - URL validity duration.
   * @returns The presigned download URL.
   */
  getPresignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number
  ): Promise<string>;

  /**
   * Validate uploaded media (format, size, corruption).
   * @param storageKey - The storage key of the uploaded asset.
   * @returns Validation result indicating pass/fail with issues.
   */
  validateMedia(storageKey: string): Promise<MediaValidationResult>;

  /**
   * Delete a media asset from storage.
   * @param storageKey - The storage key to delete.
   */
  deleteMedia(storageKey: string): Promise<void>;
}
