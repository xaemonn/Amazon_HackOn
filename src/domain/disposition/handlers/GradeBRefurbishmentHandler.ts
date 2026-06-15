/**
 * GradeBResaleHandler — Priority 6
 *
 * If grade is B, list directly in the returned marketplace at a discount.
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
      'list_for_resale',
      context.returnReason,
      this.refundPercentages,
    );

    return {
      route: 'list_for_resale',
      refundEstimate,
      explanation: this.explanationGenerator.generate('list_for_resale', {
        route: 'list_for_resale',
        handlerName: 'GradeBResaleHandler',
        slaHours: 0,
        hasNearbyBuyer: false,
      }),
      handlerName: 'GradeBResaleHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
