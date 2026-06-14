/**
 * Adapter interface for NLP-based return-reason parsing and reconciliation.
 *
 * Implementations:
 *  - BedrockReasonParser  (infrastructure/ai) — live Amazon Bedrock text model
 *  - MockReasonParser     (infrastructure/ai) — deterministic mock, no API keys
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import type { Defect } from '../shared/index.js';

/**
 * Semantic category of a parsed customer claim.
 *
 * Used to group and compare claims against observed photo evidence.
 */
export type ClaimType =
  | 'damage_description'
  | 'missing_component'
  | 'cosmetic_issue'
  | 'functional_defect';

/**
 * Per-claim verdict after comparing the claim against photographic evidence.
 *
 *  - `supported`     — the defect or situation the customer describes is visible in photos.
 *  - `unsupported`   — photos contradict the customer's claim (fraud indicator).
 *  - `inconclusive`  — photos do not provide enough signal to confirm or deny.
 */
export type ClaimVerdict = 'supported' | 'unsupported' | 'inconclusive';

/**
 * Overall reconciliation status for the entire free-text reason.
 *
 *  - `aligns`           — all parsed claims are supported by photographic evidence.
 *  - `partially_aligns` — at least one claim is supported and at least one is not.
 *  - `contradicts`      — no claims are supported (strong fraud signal).
 *  - `unparseable`      — the free-text could not be parsed into structured claims.
 */
export type ReconciliationStatus =
  | 'aligns'
  | 'partially_aligns'
  | 'contradicts'
  | 'unparseable';

/**
 * A single structured claim extracted from the customer's free-text reason.
 */
export interface ParsedClaim {
  /** Semantic category of this claim. */
  claimType: ClaimType;
  /** The part of the item being referenced (e.g. "screen", "charging port"). */
  itemArea: string;
  /** Normalised description of what the customer claims about that area. */
  description: string;
  /** Whether this claim is supported, unsupported, or inconclusive from photo evidence. */
  verdict: ClaimVerdict;
}

/**
 * The complete output of a reason-parsing and reconciliation pass.
 *
 * When `status` is `unparseable`, `claims` will be empty and `rawText` is
 * the only available signal. The Grading Module MUST set `requires_manual_review`
 * and MUST NOT increase the fraud score (Requirement 6.5).
 */
export interface ReasonReconciliation {
  /** Overall alignment between the stated reason and the photographic evidence. */
  status: ReconciliationStatus;
  /** Individual structured claims extracted from the free-text. Empty when unparseable. */
  claims: ParsedClaim[];
  /** The original, unmodified customer free-text (retained for audit and fallback). */
  rawText: string;
}

/**
 * IReasonParser — contract for any reason-parsing / NLP provider.
 *
 * The parser receives both the raw text and the already-detected defects so
 * it can cross-reference claims against observed evidence.
 */
export interface IReasonParser {
  /**
   * Parse the customer's free-text return reason and reconcile each extracted claim
   * against the photographic defects detected during condition grading.
   *
   * @param freeText  - Customer-supplied return detail text (1–500 chars after trimming).
   * @param defects   - Defects observed in submitted photos (from IConditionGrader result).
   * @param productId - Catalog product identifier for domain-specific parsing context.
   * @returns         A `ReasonReconciliation` or rejects with an error on failure.
   */
  parseReason(
    freeText: string,
    defects: Defect[],
    productId: string
  ): Promise<ReasonReconciliation>;
}
