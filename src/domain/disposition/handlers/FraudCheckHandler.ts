/**
 * FraudCheckHandler — Priority 2
 *
 * If the fraud score is at or above the configurable threshold (default 0.7),
 * route to manual_inspection.
 *
 * Requirement: 10.5
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { FraudConfig, RefundPercentagesConfig, ManualReviewConfig } from '../../../infrastructure/config/index.js';

export class FraudCheckHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly fraudConfig: FraudConfig,
    private readonly refundPercentages: RefundPercentagesConfig,
    private readonly manualReviewConfig: ManualReviewConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    if (context.conditionAssessment.fraudScore < this.fraudConfig.threshold) {
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
        handlerName: 'FraudCheckHandler',
        slaHours,
        hasNearbyBuyer: false,
      }),
      handlerName: 'FraudCheckHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
