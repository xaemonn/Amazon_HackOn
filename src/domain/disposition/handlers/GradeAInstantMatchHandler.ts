/**
 * GradeAInstantMatchHandler — Priority 4
 *
 * If grade is A and there is nearby demand within the configurable radius
 * (default 25 km), route to instant_match.
 *
 * Requirement: 10.3
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { computeRefundEstimate } from './refundHelper.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';
import type { DispositionThresholdsConfig, RefundPercentagesConfig } from '../../../infrastructure/config/index.js';

export class GradeAInstantMatchHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  constructor(
    private readonly thresholds: DispositionThresholdsConfig,
    private readonly refundPercentages: RefundPercentagesConfig,
  ) {
    super();
  }

  handle(context: RoutingContext): RoutingResult | null {
    const { grade } = context.conditionAssessment;

    if (grade !== 'A') {
      return this.passToNext(context);
    }

    // Check for nearby demand within configured radius
    if (
      !context.nearbyDemand ||
      context.nearbyDemand.distanceKm > this.thresholds.instantMatchRadiusKm
    ) {
      return this.passToNext(context);
    }

    const refundEstimate = computeRefundEstimate(
      context.itemValue,
      context.currency,
      'instant_match',
      context.returnReason,
      this.refundPercentages,
    );

    return {
      route: 'instant_match',
      refundEstimate,
      explanation: this.explanationGenerator.generate('instant_match', {
        route: 'instant_match',
        handlerName: 'GradeAInstantMatchHandler',
        slaHours: 0,
        hasNearbyBuyer: true,
      }),
      handlerName: 'GradeAInstantMatchHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }
}
