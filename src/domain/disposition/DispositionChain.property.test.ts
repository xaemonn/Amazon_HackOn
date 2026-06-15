/**
 * Property 11: Disposition Chain Produces Correct Route
 *
 * Generates random RoutingContexts with all combinations of grades, fraud scores,
 * confidence levels, demand signals, item values, and return reasons.
 * Asserts the chain always assigns the route matching the strict priority order.
 *
 * **Validates: Requirements 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.12**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildDispositionChain, evaluateDisposition } from './DispositionChainFactory.js';
import type { RoutingContext, DemandSignal } from './RoutingContext.js';
import type { RoutingResult } from './RoutingResult.js';
import type { ConditionAssessment } from '../grading/ConditionAssessment.js';
import type { ReasonReconciliation } from '../grading/IReasonParser.js';
import type { ConditionGrade, ReturnReason, DispositionRoute } from '../shared/types.js';
import { DEFAULT_CONFIG, type AppConfig } from '../../infrastructure/config/index.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const arbGrade = fc.oneof(
  fc.constant('A' as ConditionGrade),
  fc.constant('B' as ConditionGrade),
  fc.constant('C' as ConditionGrade),
  fc.constant('D' as ConditionGrade),
);

const arbGradeOrNull = fc.oneof(
  arbGrade,
  fc.constant(null as ConditionGrade | null),
);

const arbReturnReason: fc.Arbitrary<ReturnReason> = fc.oneof(
  fc.constant('defective' as ReturnReason),
  fc.constant('damaged_in_transit' as ReturnReason),
  fc.constant('wrong_item' as ReturnReason),
  fc.constant('size_fit' as ReturnReason),
  fc.constant('not_as_described' as ReturnReason),
  fc.constant('changed_mind' as ReturnReason),
);

const arbDemandSignal: fc.Arbitrary<DemandSignal> = fc.record({
  buyerId: fc.string({ minLength: 1, maxLength: 10 }),
  distanceKm: fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),
  matchType: fc.oneof(
    fc.constant('active_order' as const),
    fc.constant('wishlist' as const),
  ),
});

const arbDemandSignalOrNull: fc.Arbitrary<DemandSignal | null> = fc.oneof(
  arbDemandSignal,
  fc.constant(null),
);

const arbReconciliation: fc.Arbitrary<ReasonReconciliation> = fc.record({
  status: fc.oneof(
    fc.constant('aligns' as const),
    fc.constant('partially_aligns' as const),
    fc.constant('contradicts' as const),
    fc.constant('unparseable' as const),
  ),
  claims: fc.constant([]),
  rawText: fc.constant('test reason'),
});

const arbConditionAssessment: fc.Arbitrary<ConditionAssessment> = fc.record({
  returnRequestId: fc.constant('test-return-id'),
  grade: arbGradeOrNull,
  defects: fc.constant([]),
  reasoning: fc.constant('Test reasoning'),
  confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  identityVerdict: fc.oneof(
    fc.constant('genuine' as const),
    fc.constant('mismatch' as const),
    fc.constant('inconclusive' as const),
  ),
  identityConfidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  fraudScore: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  reconciliation: arbReconciliation,
  requiresManualReview: fc.boolean(),
  manualReviewReasons: fc.constant([] as string[]),
  gradedAt: fc.constant(new Date()),
});

const arbRoutingContext: fc.Arbitrary<RoutingContext> = fc.record({
  returnRequestId: fc.constant('test-return-id'),
  conditionAssessment: arbConditionAssessment,
  itemValue: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
  currency: fc.constant('INR'),
  nearbyDemand: arbDemandSignalOrNull,
  productId: fc.constant('test-product-id'),
  returnReason: arbReturnReason,
  returnHistory: fc.record({ count90Days: fc.nat({ max: 20 }) }),
});

/**
 * wrong_item / not_as_described reasons are intercepted at priority 0 by
 * WrongItemHandler, so the grade-based routing assertions below only hold for
 * other reasons.
 */
const notWrongItemReason = (ctx: RoutingContext): boolean =>
  ctx.returnReason !== 'wrong_item' && ctx.returnReason !== 'not_as_described';

// ─── Expected Route Computation (oracle) ─────────────────────────────────────

/**
 * Computes the expected disposition route based on the strict priority order,
 * using the same thresholds as the default configuration.
 */
function expectedRoute(context: RoutingContext, config: AppConfig): DispositionRoute {
  const { conditionAssessment, nearbyDemand, returnReason } = context;
  const { fraud, dispositionThresholds } = config;

  // Priority 0: WrongItemHandler — wrong_item / not_as_described short-circuit
  // the chain (they never fall through to grade-based routing).
  if (returnReason === 'wrong_item' || returnReason === 'not_as_described') {
    let aiConfirms = false;
    if (returnReason === 'wrong_item') {
      aiConfirms =
        conditionAssessment.grade === 'D' ||
        conditionAssessment.identityVerdict === 'mismatch';
    } else {
      const status = conditionAssessment.reconciliation?.status;
      aiConfirms = status === 'aligns' || status === 'partially_aligns';
    }
    return aiConfirms ? 'wrong_item_refund' : 'wrong_item_unverified';
  }

  // Priority 1: ManualReviewFlagHandler
  if (conditionAssessment.requiresManualReview) {
    return 'manual_inspection';
  }

  // Priority 2: FraudCheckHandler
  if (conditionAssessment.fraudScore >= fraud.threshold) {
    return 'manual_inspection';
  }

  // Priority 3: LowConfidenceHandler (only if NOT requiresManualReview)
  if (conditionAssessment.confidence < dispositionThresholds.lowConfidenceThreshold) {
    return 'manual_inspection';
  }

  // Priority 4: GradeAInstantMatchHandler
  if (
    conditionAssessment.grade === 'A' &&
    nearbyDemand !== null &&
    nearbyDemand.distanceKm <= dispositionThresholds.instantMatchRadiusKm
  ) {
    return 'instant_match';
  }

  // Priority 5: GradeAResaleHandler
  if (conditionAssessment.grade === 'A') {
    return 'list_for_resale';
  }

  // Priority 6: GradeBRefurbishmentHandler — Grade B is now relisted for resale.
  if (conditionAssessment.grade === 'B') {
    return 'list_for_resale';
  }

  // Priority 7: GradeCDLowValueHandler — Grade C → refund + let keep/recycle.
  if (conditionAssessment.grade === 'C') {
    return 'returnless_refund';
  }

  // Priority 8: GradeCDHighValueHandler — Grade D → donate / recycle.
  if (conditionAssessment.grade === 'D') {
    return 'donate_or_recycle';
  }

  // Priority 9: DefaultFallbackHandler (grade is null or unhandled)
  return 'manual_inspection';
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 11: Disposition Chain Produces Correct Route', () => {
  const config = DEFAULT_CONFIG;

  it('always assigns the route matching the strict priority order for any RoutingContext', () => {
    fc.assert(
      fc.property(arbRoutingContext, (context) => {
        const result = evaluateDisposition(context, config);
        const expected = expectedRoute(context, config);

        expect(result.route).toBe(expected);
      }),
      { numRuns: 1000 },
    );
  });

  it('never returns null — the chain always produces a result', () => {
    fc.assert(
      fc.property(arbRoutingContext, (context) => {
        const result = evaluateDisposition(context, config);
        expect(result).not.toBeNull();
        expect(result.route).toBeDefined();
      }),
      { numRuns: 500 },
    );
  });

  it('manual review flag always takes highest priority', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter((ctx) => notWrongItemReason(ctx) && ctx.conditionAssessment.requiresManualReview),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('manual_inspection');
          expect(result.handlerName).toBe('ManualReviewFlagHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('fraud score >= threshold routes to manual_inspection when requiresManualReview is false', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore >= config.fraud.threshold,
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('manual_inspection');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('low confidence routes to manual_inspection when not flagged and fraud ok', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence < config.dispositionThresholds.lowConfidenceThreshold,
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('manual_inspection');
          expect(result.handlerName).toBe('LowConfidenceHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('grade A with nearby demand within radius routes to instant_match', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence >= config.dispositionThresholds.lowConfidenceThreshold &&
            ctx.conditionAssessment.grade === 'A' &&
            ctx.nearbyDemand !== null &&
            ctx.nearbyDemand.distanceKm <= config.dispositionThresholds.instantMatchRadiusKm,
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('instant_match');
          expect(result.handlerName).toBe('GradeAInstantMatchHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('grade A with no nearby demand routes to list_for_resale', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence >= config.dispositionThresholds.lowConfidenceThreshold &&
            ctx.conditionAssessment.grade === 'A' &&
            (ctx.nearbyDemand === null ||
              ctx.nearbyDemand.distanceKm > config.dispositionThresholds.instantMatchRadiusKm),
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('list_for_resale');
          expect(result.handlerName).toBe('GradeAResaleHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('grade B routes to list_for_resale when no higher priority matches', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence >= config.dispositionThresholds.lowConfidenceThreshold &&
            ctx.conditionAssessment.grade === 'B',
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('list_for_resale');
          expect(result.handlerName).toBe('GradeBResaleHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('grade C routes to returnless_refund (refund + keep/recycle)', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence >= config.dispositionThresholds.lowConfidenceThreshold &&
            ctx.conditionAssessment.grade === 'C',
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('returnless_refund');
          expect(result.handlerName).toBe('GradeCDLowValueHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('grade D routes to donate_or_recycle', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence >= config.dispositionThresholds.lowConfidenceThreshold &&
            ctx.conditionAssessment.grade === 'D',
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('donate_or_recycle');
          expect(result.handlerName).toBe('GradeCDHighValueHandler');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('null grade with no other flags falls through to default fallback', () => {
    fc.assert(
      fc.property(
        arbRoutingContext.filter(
          (ctx) =>
            notWrongItemReason(ctx) &&
            !ctx.conditionAssessment.requiresManualReview &&
            ctx.conditionAssessment.fraudScore < config.fraud.threshold &&
            ctx.conditionAssessment.confidence >= config.dispositionThresholds.lowConfidenceThreshold &&
            ctx.conditionAssessment.grade === null,
        ),
        (context) => {
          const result = evaluateDisposition(context, config);
          expect(result.route).toBe('manual_inspection');
          expect(result.handlerName).toBe('DefaultFallbackHandler');
          expect(result.fallbackTriggered).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('result always includes a non-empty explanation', () => {
    fc.assert(
      fc.property(arbRoutingContext, (context) => {
        const result = evaluateDisposition(context, config);
        expect(result.explanation).toBeDefined();
        expect(result.explanation.length).toBeGreaterThan(0);
        expect(result.explanation.length).toBeLessThanOrEqual(160);
      }),
      { numRuns: 500 },
    );
  });

  it('result always includes a valid refund estimate', () => {
    fc.assert(
      fc.property(arbRoutingContext, (context) => {
        const result = evaluateDisposition(context, config);
        expect(result.refundEstimate).toBeDefined();
        expect(result.refundEstimate.amount).toBeGreaterThanOrEqual(0);
        expect(result.refundEstimate.currency).toBe('INR');
        expect([
          'immediate', 'upon_sale', 'after_review',
          'wrong_item_confirmed', 'wrong_item_unverified',
        ]).toContain(result.refundEstimate.condition);
        expect(['original_payment', 'store_credit']).toContain(
          result.refundEstimate.method,
        );
      }),
      { numRuns: 500 },
    );
  });
});
