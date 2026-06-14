/**
 * ManualReviewFlagHandler — Priority 1
 *
 * If the condition assessment has `requiresManualReview` set to true,
 * route immediately to manual_inspection.
 *
 * Requirement: 10.4
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { RefundPercentagesConfig, ManualReviewConfig } from '../../../infrastructure/config/index.js';

export class ManualReviewFlagHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly refundPercentages: RefundPercentagesConfig,
    private readonly manualReviewConfig: ManualReviewConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    if (!context.conditionAssessment.requiresManualReview) {
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
        handlerName: 'ManualReviewFlagHandler',
        slaHours,
        hasNearbyBuyer: false,
      }),
      handlerName: 'ManualReviewFlagHandler',
      fallbackTriggered: false,
      degradedInputs: context.conditionAssessment.manualReviewReasons,
    };
  }
}
