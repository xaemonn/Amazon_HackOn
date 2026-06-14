/**
 * ConditionAssessment — the aggregate output of a full grading run.
 *
 * Produced by the Grading Module after invoking IConditionGrader,
 * IIdentityVerifier, IReasonParser, and the FraudScoreCalculator in sequence.
 * Persisted via IConditionAssessmentRepository.
 *
 * Requirements: 5.5, 6.4, 7.1, 7.2, 7.3, 9.1, 9.2
 */

import type { ConditionGrade, Defect, IdentityVerdict } from '../shared/index.js';
import type { ReasonReconciliation } from './IReasonParser.js';

export interface ConditionAssessment {
  /** References the ReturnRequest this assessment belongs to. */
  returnRequestId: string;

  /**
   * Condition grade assigned by IConditionGrader.
   * `null` when grading failed and the fallback assessment was produced
   * (confidence will be 0.0 and `requiresManualReview` will be true).
   */
  grade: ConditionGrade | null;

  /** Detected defects (max 10, empty on grading failure). */
  defects: Defect[];

  /**
   * Human-readable reasoning for the grade (max 500 chars).
   * May be an empty string on grading failure.
   */
  reasoning: string;

  /**
   * Certainty of the condition assessment, 0.0–1.0.
   * Set to 0.0 on grading failure (Requirement 9.2).
   */
  confidence: number;

  /** Verdict from IIdentityVerifier (or `inconclusive` on verifier failure). */
  identityVerdict: IdentityVerdict;

  /**
   * Certainty of the identity verdict, 0.0–1.0.
   * Set to 0.0 when the verifier timed out or returned an error.
   */
  identityConfidence: number;

  /**
   * Aggregated fraud score, 0.0–1.0.
   * Derived from identity verdict, reason reconciliation, and return history.
   * A score >= configurable threshold (default 0.7) triggers FraudFlagged.
   */
  fraudScore: number;

  /** Reconciliation of the customer's free-text reason against photo evidence. */
  reconciliation: ReasonReconciliation;

  /**
   * True when the assessment cannot be trusted for automated routing and
   * the Disposition Engine MUST assign the manual-inspection route.
   *
   * Set by: low confidence, inconclusive identity, unparseable reason,
   * grading failure, or missing fraud-score signals.
   */
  requiresManualReview: boolean;

  /**
   * Human-readable reasons explaining why manual review was triggered.
   * e.g. ["identity inconclusive", "grading timeout", "demand_signal_unavailable"]
   */
  manualReviewReasons: string[];

  /** Wall-clock time when the grading run completed (or fallback was produced). */
  gradedAt: Date;
}
