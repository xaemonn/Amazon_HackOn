// Disposition domain module — DispositionDecision, routing handlers, repositories

import type { DispositionRoute, RefundEstimate } from '../shared/types.js';
import type { ConditionAssessment } from '../grading/index.js';

// ─── Disposition Decision ────────────────────────────────────────────────────

/**
 * The output of the Disposition Engine for a graded return item.
 * Determines the item's next life (route), refund estimate, and a
 * plain-language explanation for the customer.
 */
export interface DispositionDecision {
  /** The return request this decision applies to. */
  returnRequestId: string;
  /** The assigned disposition route (instant_match, list_for_resale, etc.). */
  route: DispositionRoute;
  /** Refund estimate shown to the customer before pickup. */
  refundEstimate: RefundEstimate;
  /** One-sentence plain-language explanation of the decision (max 160 chars). */
  explanation: string;
  /** Timestamp when the disposition was evaluated. */
  evaluatedAt: Date;
  /** Name of the handler in the chain that made the decision. */
  handlerName: string;
  /** Whether a fallback handler was triggered (e.g. AI degraded). */
  fallbackTriggered: boolean;
  /** List of inputs that were degraded/unavailable during evaluation. */
  degradedInputs: string[];
}

// ─── Disposition Decision Repository ─────────────────────────────────────────

/**
 * Repository interface for persisting and querying disposition decisions.
 */
export interface IDispositionDecisionRepository {
  /** Persist a disposition decision. */
  save(decision: DispositionDecision): Promise<void>;
  /** Find the disposition decision for a return request. */
  findByReturnRequestId(returnRequestId: string): Promise<DispositionDecision | null>;
}

// ─── Condition Assessment Repository ─────────────────────────────────────────

/**
 * Repository interface for persisting and querying condition assessments.
 * Separated from the grading module to maintain repository pattern consistency
 * in the disposition/persistence layer.
 */
export interface IConditionAssessmentRepository {
  /** Persist a condition assessment. */
  save(assessment: ConditionAssessment): Promise<void>;
  /** Find the condition assessment for a return request. */
  findByReturnRequestId(returnRequestId: string): Promise<ConditionAssessment | null>;
}
