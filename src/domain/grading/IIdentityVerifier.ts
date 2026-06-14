/**
 * Adapter interface for AI-powered identity verification.
 *
 * Implementations:
 *  - BedrockIdentityVerifier  (infrastructure/ai) — live Amazon Bedrock multimodal
 *  - MockIdentityVerifier     (infrastructure/ai) — deterministic mock, no API keys
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import type { IdentityVerdict, MediaReference } from '../shared/index.js';

export type { IdentityVerdict };

/**
 * Result returned by a single identity-verification invocation.
 *
 * Constraints enforced by implementations:
 *  - `confidence` MUST be in the closed interval [0.0, 1.0]
 */
export interface IdentityVerificationResult {
  /**
   * The comparison verdict:
   *  - `genuine`      — submitted photos match the catalog item with high confidence.
   *  - `mismatch`     — submitted photos depict a different product (fraud indicator).
   *  - `inconclusive` — insufficient signal to determine a match.
   */
  verdict: IdentityVerdict;
  /** Certainty of the verdict, 0.0 (no confidence) to 1.0 (certain). */
  confidence: number;
}

/**
 * IIdentityVerifier — contract for any identity-verification provider.
 *
 * The adapter MUST complete within 5 seconds (see Requirement 4.6).
 * Callers are responsible for the retry-and-fallback strategy described
 * in Requirements 4.6 / 9.5.
 */
export interface IIdentityVerifier {
  /**
   * Compare the customer's submitted media against the catalog image for the ordered item.
   *
   * @param submittedMedia    - Customer-captured photos and video.
   * @param catalogImageRef   - Storage key / URL of the canonical catalog product image.
   * @param productId         - Catalog product identifier for context.
   * @returns                 An `IdentityVerificationResult` or rejects with an error.
   */
  verifyIdentity(
    submittedMedia: MediaReference[],
    catalogImageRef: string,
    productId: string
  ): Promise<IdentityVerificationResult>;
}
