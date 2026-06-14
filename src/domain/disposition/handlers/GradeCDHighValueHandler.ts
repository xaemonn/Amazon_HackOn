/**
 * GradeCDHighValueHandler — Priority 8
 *
 * If grade is C or D and the item value is at or above the configurable threshold
 * (default ₹500), route to donate_or_recycle.
 *
 * Requirement: 10.10
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { DispositionThresholdsConfig, RefundPercentagesConfig } from '../../../infrastructure/config/index.js';

export class GradeCDHighValueHandler extends BaseDispositionHandler {
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

    // Value >= threshold → donate or recycle
    if (context.itemValue < this.thresholds.returnlessRefundMaxValue) {
      return this.passToNext(context);
    }

    const refundEstimate = computeRefundEstimate(
      context.itemValue,
      context.currency,
      'donate_or_recycle',
      context.returnReason,
      this.refundPercentages,
    );

    return {
      route: 'donate_or_recycle',
      refundEstimate,
      explanation: this.explanationGenerator.generate('donate_or_recycle', {
        route: 'donate_or_recycle',
        handlerName: 'GradeCDHighValueHandler',
        slaHours: 0,
        hasNearbyBuyer: false,
      }),
      handlerName: 'GradeCDHighValueHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
