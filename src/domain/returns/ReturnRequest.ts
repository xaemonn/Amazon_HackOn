/**
 * ReturnRequest — aggregate root for the return lifecycle.
 *
 * Defines ReturnState, ReturnRequestProps, and the ReturnRequest entity class.
 * The entity wraps its props with read-only getters and exposes a toProps()
 * snapshot for persistence. State transitions are enforced externally by
 * ReturnStateMachine — this class is intentionally free of transition logic.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import type { ReturnReason, MediaReference } from '../shared/index.js';
import type { ConditionAssessment } from '../grading/ConditionAssessment.js';
import type { DispositionDecision } from '../disposition/DispositionDecision.js';

// ─── ReturnState ─────────────────────────────────────────────────────────────

/**
 * All valid states in the ReturnRequest lifecycle state machine.
 *
 * Legal transitions are enforced by ReturnStateMachine.
 *
 * Requirement 14.1
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

// ─── ReturnRequestProps ───────────────────────────────────────────────────────

/**
 * Plain-data snapshot of a ReturnRequest aggregate.
 * Used for persistence, serialisation, and constructing the entity class.
 */
export interface ReturnRequestProps {
  /** Unique identifier for this return request (UUID). */
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
  /**
   * Free-text reason details (trimmed, 1–500 chars), or null if not provided.
   * Whitespace-only input is normalised to null before storage.
   */
  reasonDetails: string | null;
  /** Captured media assets (photos and video). */
  media: MediaReference[];
  /** AI condition assessment result, or null if not yet graded. */
  conditionAssessment: ConditionAssessment | null;
  /** Disposition decision, or null if not yet assigned. */
  dispositionDecision: DispositionDecision | null;
  /** When the return was initiated. */
  createdAt: Date;
  /** Last modification timestamp. Updated on every successful transition. */
  updatedAt: Date;
}

// ─── ReturnRequest entity ─────────────────────────────────────────────────────

/**
 * ReturnRequest — domain entity / aggregate root.
 *
 * Wraps ReturnRequestProps with read-only getters to prevent accidental
 * mutation of the props bag. State transitions produce a new ReturnRequest
 * instance via ReturnStateMachine.transition().
 */
export class ReturnRequest {
  private readonly _props: Readonly<ReturnRequestProps>;

  constructor(props: ReturnRequestProps) {
    // Shallow-freeze the props to guard against external mutation.
    this._props = Object.freeze({ ...props });
  }

  // ── Identity ────────────────────────────────────────────────────────────────

  get id(): string {
    return this._props.id;
  }

  get customerId(): string {
    return this._props.customerId;
  }

  get orderItemId(): string {
    return this._props.orderItemId;
  }

  get orderId(): string {
    return this._props.orderId;
  }

  get productId(): string {
    return this._props.productId;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  get state(): ReturnState {
    return this._props.state;
  }

  // ── Reason ──────────────────────────────────────────────────────────────────

  get reason(): ReturnReason | null {
    return this._props.reason;
  }

  get reasonDetails(): string | null {
    return this._props.reasonDetails;
  }

  // ── Media ───────────────────────────────────────────────────────────────────

  /** Returns a shallow copy of the media array to prevent external mutation. */
  get media(): MediaReference[] {
    return [...this._props.media];
  }

  // ── Grading & Disposition ───────────────────────────────────────────────────

  get conditionAssessment(): ConditionAssessment | null {
    return this._props.conditionAssessment;
  }

  get dispositionDecision(): DispositionDecision | null {
    return this._props.dispositionDecision;
  }

  // ── Timestamps ──────────────────────────────────────────────────────────────

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  // ── Serialisation ───────────────────────────────────────────────────────────

  /**
   * Return a plain-data snapshot of this entity suitable for persistence.
   * The returned object is a shallow copy — safe to pass to repositories.
   */
  toProps(): ReturnRequestProps {
    return { ...this._props };
  }
}
