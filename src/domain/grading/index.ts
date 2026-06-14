// Grading domain module — ConditionAssessment, IConditionGrader, IIdentityVerifier, IReasonParser

import type {
  ConditionGrade,
  Defect,
  IdentityVerdict,
  MediaReference,
} from '../shared/types.js';

// ─── Condition Grading ───────────────────────────────────────────────────────

/**
 * Result of AI-powered condition assessment on submitted media.
 * Confidence ranges from 0.0 to 1.0; reasoning is capped at 500 characters;
 * defects list is capped at 10 items.
 */
export interface ConditionGradeResult {
  /** Assigned condition grade (A–D). */
  grade: ConditionGrade;
  /** Plain-language reasoning for the grade (max 500 chars). */
  reasoning: string;
  /** Detected defects on the item (max 10). */
  defects: Defect[];
  /** Model confidence in the grade (0.0–1.0). */
  confidence: number;
}

/**
 * Adapter interface for AI-powered condition grading.
 * Implementations: BedrockGraderAdapter (live), MockConditionGrader (deterministic).
 */
export interface IConditionGrader {
  /**
   * Assess the condition of a returned item from its submitted media.
   * @param mediaReferences - Photos/video of the returned item.
   * @param productId - The product being returned (for catalog comparison).
   * @returns Condition grade result with reasoning, defects, and confidence.
   */
  assessCondition(
    mediaReferences: MediaReference[],
    productId: string
  ): Promise<ConditionGradeResult>;
}

// ─── Identity Verification ───────────────────────────────────────────────────

/**
 * Result of identity verification comparing submitted media against
 * catalog reference imagery.
 */
export interface IdentityVerificationResult {
  /** Verdict: genuine, mismatch, or inconclusive. */
  verdict: IdentityVerdict;
  /** Model confidence in the verdict (0.0–1.0). */
  confidence: number;
}

/**
 * Adapter interface for AI-powered identity verification.
 * Verifies that the submitted item matches the expected product (guards
 * against wrong-item or "box of rocks" fraud).
 * Implementations: BedrockVerifierAdapter (live), MockIdentityVerifier (deterministic).
 */
export interface IIdentityVerifier {
  /**
   * Verify that the submitted media depicts the expected product.
   * @param submittedMedia - Customer-submitted photos/video.
   * @param catalogImageRef - Storage key of the catalog reference image.
   * @param productId - The product ID for additional context.
   * @returns Identity verification verdict with confidence.
   */
  verifyIdentity(
    submittedMedia: MediaReference[],
    catalogImageRef: string,
    productId: string
  ): Promise<IdentityVerificationResult>;
}

// ─── Reason Parsing & Reconciliation ─────────────────────────────────────────

/** The type of claim a customer makes in free-text return reasons. */
export type ClaimType =
  | 'damage_description'
  | 'missing_component'
  | 'cosmetic_issue'
  | 'functional_defect';

/** Whether a parsed claim is supported by visual evidence. */
export type ClaimVerdict = 'supported' | 'unsupported' | 'inconclusive';

/** How well the customer's stated reason aligns with observed defects. */
export type ReconciliationStatus =
  | 'aligns'
  | 'partially_aligns'
  | 'contradicts'
  | 'unparseable';

/**
 * A single claim extracted from the customer's free-text reason.
 */
export interface ParsedClaim {
  /** Category of the claim. */
  claimType: ClaimType;
  /** Area of the item the claim references (e.g. "screen", "left sole"). */
  itemArea: string;
  /** The customer's description of the issue. */
  description: string;
  /** Whether this claim is supported by observed defects. */
  verdict: ClaimVerdict;
}

/**
 * Full reconciliation output: how the free-text reason maps to visual evidence.
 */
export interface ReasonReconciliation {
  /** Overall alignment status between stated reason and evidence. */
  status: ReconciliationStatus;
  /** Individual parsed claims with verdicts. */
  claims: ParsedClaim[];
  /** The original free-text input. */
  rawText: string;
}

/**
 * Adapter interface for NLP-based reason parsing and reconciliation.
 * Parses customer free-text, extracts claims, and reconciles them
 * against visually-observed defects.
 */
export interface IReasonParser {
  /**
   * Parse a customer's free-text reason and reconcile with observed defects.
   * @param freeText - The customer's free-text return reason.
   * @param observedDefects - Defects detected by the condition grader.
   * @returns Reconciliation result with parsed claims and overall status.
   */
  parseAndReconcile(
    freeText: string,
    observedDefects: Defect[]
  ): Promise<ReasonReconciliation>;
}

// ─── Condition Assessment Aggregate ──────────────────────────────────────────

/**
 * The complete condition assessment output produced by the grading pipeline.
 * Combines identity verification, condition grading, reason parsing, and fraud
 * scoring into a single aggregate attached to the ReturnRequest.
 */
export interface ConditionAssessment {
  /** The return request this assessment belongs to. */
  returnRequestId: string;
  /** Assigned condition grade, or null if grading failed/degraded. */
  grade: ConditionGrade | null;
  /** Detected defects (max 10). */
  defects: Defect[];
  /** Plain-language reasoning for the grade (max 500 chars). */
  reasoning: string;
  /** Model confidence in the condition grade (0.0–1.0). */
  confidence: number;
  /** Identity verification verdict. */
  identityVerdict: IdentityVerdict;
  /** Confidence in the identity verdict (0.0–1.0). */
  identityConfidence: number;
  /** Computed fraud risk score (0.0–1.0). */
  fraudScore: number;
  /** Reconciliation of customer's stated reason vs observed evidence. */
  reconciliation: ReasonReconciliation;
  /** Whether this item needs human review. */
  requiresManualReview: boolean;
  /** Reasons manual review was triggered (empty if not required). */
  manualReviewReasons: string[];
  /** Timestamp when grading completed. */
  gradedAt: Date;
}
