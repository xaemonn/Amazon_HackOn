/**
 * LowConfidenceHandler — Priority 3
 *
 * If confidence is below the configurable threshold (default 0.6)
 * and the item was not already flagged for manual review,
 * route to manual_inspection.
 *
 * Requirement: 10.6
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { DispositionThresholdsConfig, RefundPercentagesConfig, ManualReviewConfig } from '../../../infrastructure/config/index.js';

export class LowConfidenceHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly thresholds: DispositionThresholdsConfig,
    private readonly refundPercentages: RefundPercentagesConfig,
    private readonly manualReviewConfig: ManualReviewConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    const { confidence } = context.conditionAssessment;

    // Only trigger if confidence is below threshold and not already flagged
    if (confidence >= this.thresholds.lowConfidenceThreshold) {
      return this.passToNext(context);
    }

    // If already flagged for manual review, that handler should have caught it
    // This handler catches low confidence that wasn't already flagged
    if (context.conditionAssessment.requiresManualReview) {
      return this.passToNext(context);
    }

    const refundEstimate = computeRefundEstimate(
      context.itemValue,
      context.currency,
      'manual_inspection',
      context.returnReason,
      this.refundPercentages,
    );

    const slaHours = this.manualReviewConfig.slaHours;

    return {
      route: 'manual_inspection',
      refundEstimate,
      explanation: this.explanationGenerator.generate('manual_inspection', {
        route: 'manual_inspection',
        handlerName: 'LowConfidenceHandler',
        slaHours,
        hasNearbyBuyer: false,
      }),
      handlerName: 'LowConfidenceHandler',
      fallbackTriggered: false,
      degradedInputs: ['low_confidence_assessment'],
    };
  }
}
