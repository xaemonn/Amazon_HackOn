/**
 * DefaultFallbackHandler — Priority 9 (last in chain)
 *
 * Always claims the item and routes to manual_inspection.
 * This is the terminal handler — ensures every item gets a decision.
 *
 * Requirement: 10.11
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { RefundPercentagesConfig, ManualReviewConfig } from '../../../infrastructure/config/index.js';

export class DefaultFallbackHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly refundPercentages: RefundPercentagesConfig,
    private readonly manualReviewConfig: ManualReviewConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
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
        handlerName: 'DefaultFallbackHandler',
        slaHours,
        hasNearbyBuyer: false,
      }),
      handlerName: 'DefaultFallbackHandler',
      fallbackTriggered: true,
      degradedInputs: [],
    };
  }
}
