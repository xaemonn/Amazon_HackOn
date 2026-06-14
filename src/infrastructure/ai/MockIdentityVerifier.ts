/**
 * MockIdentityVerifier — deterministic, seeded identity verifier for dev/demo.
 *
 * Returns predictable verdicts based on the productId passed in:
 *   item-genuine / item-grade-a   → genuine, confidence 0.95
 *   item-mismatch / item-fraud    → mismatch, confidence 0.95
 *   item-ambiguous / item-inconclusive → inconclusive, confidence 0.95
 *   (anything else)               → inconclusive, confidence 0.50 (default fallback)
 *
 * All outputs satisfy the invariant:
 *   - confidence ∈ [0.0, 1.0]
 *
 * Requirements: 4.7, 16.4, 16.6
 */

import type { IIdentityVerifier, IdentityVerificationResult } from '../../domain/grading/IIdentityVerifier.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { IdentityVerdict } from '../../domain/shared/types.js';

// ─── Seeded result map ────────────────────────────────────────────────────────

interface SeededResult {
  verdict: IdentityVerdict;
  confidence: number;
}

const SEEDED_RESULTS: Record<string, SeededResult> = {
  'item-genuine': {
    verdict: 'genuine',
    confidence: 0.95,
  },
  'item-grade-a': {
    verdict: 'genuine',
    confidence: 0.95,
  },
  'item-mismatch': {
    verdict: 'mismatch',
    confidence: 0.95,
  },
  'item-fraud': {
    verdict: 'mismatch',
    confidence: 0.95,
  },
  'item-ambiguous': {
    verdict: 'inconclusive',
    confidence: 0.95,
  },
  'item-inconclusive': {
    verdict: 'inconclusive',
    confidence: 0.95,
  },
};

// ─── Default fallback (unknown productId) ────────────────────────────────────

const DEFAULT_RESULT: SeededResult = {
  verdict: 'inconclusive',
  confidence: 0.50,
};

// ─── Implementation ───────────────────────────────────────────────────────────

export class MockIdentityVerifier implements IIdentityVerifier {
  /**
   * Compare submitted media against a catalog image using the seeded deterministic map.
   *
   * @param _submittedMedia  - Ignored in mock; real media not required for demo.
   * @param _catalogImageRef - Ignored in mock; catalog reference not used for demo.
   * @param productId        - Drives the seeded result lookup.
   */
  async verifyIdentity(
    _submittedMedia: MediaReference[],
    _catalogImageRef: string,
    productId: string
  ): Promise<IdentityVerificationResult> {
    const seed = SEEDED_RESULTS[productId] ?? DEFAULT_RESULT;

    // Defensive copy so callers cannot mutate the seeded data.
    return {
      verdict: seed.verdict,
      confidence: seed.confidence,
    };
  }
}
