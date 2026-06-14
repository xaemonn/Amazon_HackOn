/**
 * DispositionDecision — the output of the Disposition Engine for a single item.
 *
 * Produced by the Chain of Responsibility evaluation, persisted via
 * IDispositionDecisionRepository, and surfaced to the customer as
 * a refund estimate + plain-language explanation.
 *
 * Requirements: 10.13, 12.1, 12.2, 13.1, 13.2
 */

import type { DispositionRoute, RefundEstimate } from '../shared/index.js';

export type { DispositionRoute };

/**
 * DispositionDecision — immutable result of routing a graded returned item.
 */
export interface DispositionDecision {
  /** References the ReturnRequest this decision belongs to. */
  returnRequestId: string;

  /** The routing outcome selected by the chain of responsibility. */
  route: DispositionRoute;

  /**
   * Estimated refund amount, currency, timing, and method.
   * For fault reasons this will always be 100% / immediate regardless of route.
   */
  refundEstimate: RefundEstimate;

  /**
   * One-sentence, customer-friendly explanation of the routing decision.
   * MUST NOT exceed 160 characters or contain internal jargon / route codes
   * (Requirement 13.1, 13.2).
   */
  explanation: string;

  /** Wall-clock time when the disposition was evaluated. */
  evaluatedAt: Date;

  /**
   * Name of the handler that claimed the item (for audit / ops analytics).
   * e.g. "GradeAInstantMatchHandler", "FraudCheckHandler"
   */
  handlerName: string;

  /**
   * True when no primary handler matched and the DefaultFallbackHandler
   * assigned the `manual_inspection` route (Requirement 10.11).
   */
  fallbackTriggered: boolean;

  /**
   * Labels for any input signals that were unavailable during evaluation.
   * e.g. ["demand_signal_unavailable", "distance_data_unavailable"]
   * (Requirement 10.12)
   */
  degradedInputs: string[];
}
