/**
 * Property-Based Test: Fraud Score Aggregation and Bounds (Property 9)
 *
 * **Validates: Requirements 7.1, 7.3, 7.6**
 *
 * Generates random combinations of identity verdicts, reconciliation statuses,
 * claim counts, and history counts to verify:
 * 1. Output is always in [0.0, 1.0]
 * 2. When identityVerdict is 'mismatch', output >= 0.9
 * 3. The calculator handles all valid input combinations without throwing
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { FraudScoreCalculator } from './FraudScoreCalculator.js';
import type { FraudScoreInputs } from './FraudScoreCalculator.js';
import type { IdentityVerdict } from '../shared/types.js';
import type { ReconciliationStatus } from './IReasonParser.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const identityVerdictArb: fc.Arbitrary<IdentityVerdict> = fc.constantFrom(
  'genuine' as const,
  'mismatch' as const,
  'inconclusive' as const
);

const reconciliationStatusArb: fc.Arbitrary<ReconciliationStatus> = fc.constantFrom(
  'aligns' as const,
  'partially_aligns' as const,
  'contradicts' as const,
  'unparseable' as const
);

const fraudScoreInputsArb: fc.Arbitrary<FraudScoreInputs> = fc.record({
  identityVerdict: identityVerdictArb,
  identityConfidence: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  reconciliationStatus: reconciliationStatusArb,
  unsupportedClaimCount: fc.integer({ min: 0, max: 10 }),
  returnHistoryCount90Days: fc.integer({ min: 0, max: 20 }),
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('FraudScoreCalculator - Property 9: Fraud Score Aggregation and Bounds', () => {
  const calculator = new FraudScoreCalculator();

  it('Property 9.1: output score is always in [0.0, 1.0]', () => {
    fc.assert(
      fc.property(fraudScoreInputsArb, (inputs) => {
        const result = calculator.compute(inputs);
        expect(result.score).toBeGreaterThanOrEqual(0.0);
        expect(result.score).toBeLessThanOrEqual(1.0);
      }),
      { numRuns: 500 }
    );
  });

  it('Property 9.2: when identityVerdict is mismatch, score >= 0.9', () => {
    const mismatchInputsArb = fc.record({
      identityVerdict: fc.constant('mismatch' as const),
      identityConfidence: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
      reconciliationStatus: reconciliationStatusArb,
      unsupportedClaimCount: fc.integer({ min: 0, max: 10 }),
      returnHistoryCount90Days: fc.integer({ min: 0, max: 20 }),
    });

    fc.assert(
      fc.property(mismatchInputsArb, (inputs) => {
        const result = calculator.compute(inputs);
        expect(result.score).toBeGreaterThanOrEqual(0.9);
      }),
      { numRuns: 500 }
    );
  });

  it('Property 9.3: calculator handles all valid input combinations without throwing', () => {
    fc.assert(
      fc.property(fraudScoreInputsArb, (inputs) => {
        expect(() => calculator.compute(inputs)).not.toThrow();
      }),
      { numRuns: 500 }
    );
  });
});
