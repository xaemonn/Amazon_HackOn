import { describe, it, expect } from 'vitest';
import { FraudScoreCalculator } from './FraudScoreCalculator.js';
import type { FraudScoreInputs } from './FraudScoreCalculator.js';

describe('FraudScoreCalculator', () => {
  const calculator = new FraudScoreCalculator();

  // ─── Identity mismatch → score ≥ 0.9 (Req 7.3) ────────────────────────

  it('returns score >= 0.9 when identity verdict is mismatch', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'mismatch',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it('returns score >= 0.9 for mismatch regardless of other signals being favorable', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'mismatch',
      identityConfidence: 0.99,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it('returns score >= 0.9 for mismatch even with all other signals missing', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'mismatch',
      identityConfidence: 0.95,
      reconciliationStatus: null,
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: null,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  // ─── Genuine identity with no issues → low score ───────────────────────

  it('returns a low score for genuine identity with all signals favorable', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeLessThan(0.3);
    expect(result.requiresManualReview).toBe(false);
  });

  it('returns score of 0.0 for genuinely clean return', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 1,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBe(0.0);
  });

  // ─── Each unsupported claim increments score (Req 6.3) ─────────────────

  it('adds 0.15 per unsupported claim by default', () => {
    const base: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'partially_aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const withClaims: FraudScoreInputs = {
      ...base,
      unsupportedClaimCount: 2,
    };
    const baseResult = calculator.compute(base);
    const claimsResult = calculator.compute(withClaims);
    expect(claimsResult.score - baseResult.score).toBeCloseTo(0.30, 5);
  });

  it('uses configurable increment for unsupported claims', () => {
    const customCalc = new FraudScoreCalculator({ unsupportedClaimIncrement: 0.2 });
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 3,
      returnHistoryCount90Days: 0,
    };
    const result = customCalc.compute(inputs);
    // 3 claims * 0.2 = 0.6
    expect(result.score).toBeCloseTo(0.6, 5);
  });

  // ─── Missing signals set requires_manual_review (Req 7.6) ──────────────

  it('sets requires_manual_review when identity signal is missing', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: null,
      identityConfidence: null,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.requiresManualReview).toBe(true);
    expect(result.missingSignals).toContain('identity_verification');
    expect(result.manualReviewReasons).toContain('identity_verification_unavailable');
  });

  it('sets requires_manual_review when reconciliation signal is missing', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: null,
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.requiresManualReview).toBe(true);
    expect(result.missingSignals).toContain('reason_reconciliation');
  });

  it('sets requires_manual_review when return history signal is missing', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: null,
    };
    const result = calculator.compute(inputs);
    expect(result.requiresManualReview).toBe(true);
    expect(result.missingSignals).toContain('return_history');
  });

  it('reports all missing signals when multiple are unavailable', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: null,
      identityConfidence: null,
      reconciliationStatus: null,
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: null,
    };
    const result = calculator.compute(inputs);
    expect(result.requiresManualReview).toBe(true);
    expect(result.missingSignals).toHaveLength(3);
    expect(result.missingSignals).toContain('identity_verification');
    expect(result.missingSignals).toContain('reason_reconciliation');
    expect(result.missingSignals).toContain('return_history');
  });

  it('does not set requires_manual_review when all signals are present', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.requiresManualReview).toBe(false);
    expect(result.missingSignals).toHaveLength(0);
  });

  // ─── Score clamped to [0.0, 1.0] (Req 7.1) ────────────────────────────

  it('clamps score to 1.0 when inputs would exceed upper bound', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'mismatch',
      identityConfidence: 0.95,
      reconciliationStatus: 'contradicts',
      unsupportedClaimCount: 10, // 10 * 0.15 = 1.5 alone
      returnHistoryCount90Days: 5,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeLessThanOrEqual(1.0);
    expect(result.score).toBe(1.0);
  });

  it('never returns a score below 0.0', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.99,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeGreaterThanOrEqual(0.0);
  });

  // ─── Return history frequency adds weight ──────────────────────────────

  it('adds weight when return history count is at or above threshold', () => {
    const low: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 2,
    };
    const high: FraudScoreInputs = {
      ...low,
      returnHistoryCount90Days: 5,
    };
    const lowResult = calculator.compute(low);
    const highResult = calculator.compute(high);
    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  it('uses configurable history threshold', () => {
    const customCalc = new FraudScoreCalculator({
      highReturnHistoryThreshold: 2,
      highReturnHistoryWeight: 0.25,
    });
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 2,
    };
    const result = customCalc.compute(inputs);
    expect(result.score).toBeCloseTo(0.25, 5);
  });

  // ─── Reconciliation status impact ──────────────────────────────────────

  it('increases score when reconciliation status is contradicts', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'contradicts',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const result = calculator.compute(inputs);
    expect(result.score).toBeGreaterThan(0);
  });

  it('adds moderate weight for partially_aligns reconciliation', () => {
    const aligns: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const partial: FraudScoreInputs = {
      ...aligns,
      reconciliationStatus: 'partially_aligns',
    };
    const alignsResult = calculator.compute(aligns);
    const partialResult = calculator.compute(partial);
    expect(partialResult.score).toBeGreaterThan(alignsResult.score);
  });

  // ─── Inconclusive identity adds moderate weight ────────────────────────

  it('adds moderate weight for inconclusive identity verdict', () => {
    const genuine: FraudScoreInputs = {
      identityVerdict: 'genuine',
      identityConfidence: 0.95,
      reconciliationStatus: 'aligns',
      unsupportedClaimCount: 0,
      returnHistoryCount90Days: 0,
    };
    const inconclusive: FraudScoreInputs = {
      ...genuine,
      identityVerdict: 'inconclusive',
      identityConfidence: 0.95,
    };
    const genuineResult = calculator.compute(genuine);
    const inconclusiveResult = calculator.compute(inconclusive);
    expect(inconclusiveResult.score).toBeGreaterThan(genuineResult.score);
  });

  // ─── Computes with remaining signals when some are missing ─────────────

  it('computes score from available signals when identity is missing', () => {
    const inputs: FraudScoreInputs = {
      identityVerdict: null,
      identityConfidence: null,
      reconciliationStatus: 'contradicts',
      unsupportedClaimCount: 2,
      returnHistoryCount90Days: 5,
    };
    const result = calculator.compute(inputs);
    // Should still compute from reconciliation + claims + history
    expect(result.score).toBeGreaterThan(0);
    expect(result.requiresManualReview).toBe(true);
  });
});
