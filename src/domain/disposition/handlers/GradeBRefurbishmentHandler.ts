/**
 * GradeBRefurbishmentHandler — Priority 6
 *
 * If grade is B, route to refurbishment.
 *
 * Requirement: 10.8
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { RefundPercentagesConfig } from '../../../infrastructure/config/index.js';

export class GradeBRefurbishmentHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly refundPercentages: RefundPercentagesConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    const { grade } = context.conditionAssessment;

    if (grade !== 'B') {
      return this.passToNext(context);
    }

    const refundEstimate = computeRefundEstimate(
      context.itemValue,
      context.currency,
      'refurbishment',
      context.returnReason,
      this.refundPercentages,
    );

    return {
      route: 'refurbishment',
      refundEstimate,
      explanation: this.explanationGenerator.generate('refurbishment', {
        route: 'refurbishment',
        handlerName: 'GradeBRefurbishmentHandler',
        slaHours: 0,
        hasNearbyBuyer: false,
      }),
      handlerName: 'GradeBRefurbishmentHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
