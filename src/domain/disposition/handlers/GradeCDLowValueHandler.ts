/**
 * GradeCReturnlessRefundHandler — Priority 7
 *
 * Grade C: customer keeps the item and receives a refund — always, regardless of value.
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

    if (grade !== 'C') {
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
