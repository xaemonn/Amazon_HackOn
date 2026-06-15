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
  /**
   * Whether the submitted photos appear to be AI-generated, rendered, or
   * digitally manipulated rather than genuine camera photos of the item.
   * Used as an anti-fraud signal. Optional for backwards compatibility.
   */
  authenticity?: ImageAuthenticity;
}

/**
 * Anti-fraud assessment of whether submitted photos are genuine camera
 * captures or AI-generated / digitally manipulated.
 */
export interface ImageAuthenticity {
  /** True when the photos appear AI-generated, CGI/rendered, or manipulated. */
  aiGenerated: boolean;
  /** Certainty of the aiGenerated verdict, 0.0–1.0. */
  confidence: number;
  /** Brief explanation of the indicators observed (max 300 chars). */
  note: string;
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
   * @param mediaReferences  - Photos captured during guided media capture.
   * @param productId        - Catalog product identifier for context / catalog lookup.
   * @param catalogImageRef  - Storage key of the catalog reference image (item when new).
   *                           Implementations should include this image in the AI prompt
   *                           so the model can compare condition AND verify item identity.
   * @param returnReason     - The reason the customer stated for the return (optional).
   *                           Used as an additional signal: the grader should attempt to
   *                           verify whether the stated reason is visually consistent with
   *                           the submitted photos and incorporate that into its reasoning.
   * @returns                A `ConditionGradeResult` or rejects with an error on failure.
   */
  assessCondition(
    mediaReferences: MediaReference[],
    productId: string,
    catalogImageRef: string,
    returnReason?: string,
  ): Promise<ConditionGradeResult>;
}
