/**
 * Adapter interface for AI-powered condition grading.
 *
 * Implementations:
 *  - BedrockConditionGrader  (infrastructure/ai) — live Amazon Bedrock multimodal
 *  - MockConditionGrader     (infrastructure/ai) — deterministic mock, no API keys
 *
 * Requirements: 5.2, 5.3, 5.5
 */

import type { ConditionGrade, Defect, MediaReference } from '../shared/index.js';

export type { ConditionGrade, Defect };

/**
 * The full output of a single condition-grading invocation.
 *
 * Constraints enforced by implementations:
 *  - `reasoning` MUST NOT exceed 500 characters
 *  - `defects` MUST contain at most 10 items
 *  - `confidence` MUST be in the closed interval [0.0, 1.0]
 */
export interface ConditionGradeResult {
  /** Condition grade assigned to the item. */
  grade: ConditionGrade;
  /** Human-readable reasoning for the grade (max 500 chars). */
  reasoning: string;
  /** Detected defects with location and severity (max 10 items). */
  defects: Defect[];
  /** Certainty of the assessment, 0.0 (no confidence) to 1.0 (certain). */
  confidence: number;
}

/**
 * IConditionGrader — contract for any condition-assessment provider.
 *
 * The adapter MUST complete within 10 seconds (see Requirement 5.1).
 * Callers are responsible for the retry-and-fallback strategy described
 * in Requirements 5.6 / 9.1–9.2.
 */
export interface IConditionGrader {
  /**
   * Assess the physical condition of a returned item from its media.
   *
   * @param mediaReferences - Photos and video captured during guided media capture.
   * @param productId       - Catalog product identifier for context / catalog lookup.
   * @returns               A `ConditionGradeResult` or rejects with an error on failure.
   */
  assessCondition(
    mediaReferences: MediaReference[],
    productId: string
  ): Promise<ConditionGradeResult>;
}
