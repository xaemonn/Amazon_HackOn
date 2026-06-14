/**
 * GradeCDLowValueHandler — Priority 7
 *
 * If grade is C or D and the item value is below the configurable threshold
 * (default ₹500), route to returnless_refund (customer keeps the item).
 *
 * Requirement: 10.9
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { DispositionThresholdsConfig, RefundPercentagesConfig } from '../../../infrastructure/config/index.js';

export class GradeCDLowValueHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly thresholds: DispositionThresholdsConfig,
    private readonly refundPercentages: RefundPercentagesConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    const { grade } = context.conditionAssessment;

    if (grade !== 'C' && grade !== 'D') {
      return this.passToNext(context);
    }

    if (context.itemValue >= this.thresholds.returnlessRefundMaxValue) {
      return this.passToNext(context);
    }

    const refundEstimate = computeRefundEstimate(
      context.itemValue,
      context.currency,
      'returnless_refund',
      context.returnReason,
      this.refundPercentages,
    );

    return {
      route: 'returnless_refund',
      refundEstimate,
      explanation: this.explanationGenerator.generate('returnless_refund', {
        route: 'returnless_refund',
        handlerName: 'GradeCDLowValueHandler',
        slaHours: 0,
        hasNearbyBuyer: false,
      }),
      handlerName: 'GradeCDLowValueHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
