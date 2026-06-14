/**
 * GradeAResaleHandler — Priority 5
 *
 * If grade is A but there is no nearby demand (or demand is outside radius),
 * route to list_for_resale.
 *
 * Requirement: 10.7
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { RefundPercentagesConfig } from '../../../infrastructure/config/index.js';

export class GradeAResaleHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly refundPercentages: RefundPercentagesConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    const { grade } = context.conditionAssessment;

    if (grade !== 'A') {
      return this.passToNext(context);
    }

    // If we reach here, grade is A but no nearby demand matched (handler 4 didn't claim)
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
        handlerName: 'GradeAResaleHandler',
        slaHours: 0,
        hasNearbyBuyer: false,
      }),
      handlerName: 'GradeAResaleHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
