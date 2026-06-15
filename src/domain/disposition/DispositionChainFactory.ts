/**
 * DispositionChainFactory — builds the Chain of Responsibility in strict priority order.
 *
 * Priority order:
 *   1. ManualReviewFlagHandler
 *   2. FraudCheckHandler
 *   3. LowConfidenceHandler
 *   4. GradeAInstantMatchHandler
 *   5. GradeAResaleHandler
 *   6. GradeBRefurbishmentHandler
 *   7. GradeCDLowValueHandler
 *   8. GradeCDHighValueHandler
 *   9. DefaultFallbackHandler
 *
 * Unavailable demand signal (nearbyDemand === null) is treated as "no nearby demand."
 * The GradeAInstantMatchHandler naturally passes to next when demand is null.
 *
 * Requirements: 10.1, 10.12
 */

import type { AppConfig } from '../../infrastructure/config/index.js';
import type { IDispositionHandler } from './IDispositionHandler.js';
import type { RoutingContext } from './RoutingContext.js';
import type { RoutingResult } from './RoutingResult.js';

import {
  WrongItemHandler,
  ManualReviewFlagHandler,
  FraudCheckHandler,
  LowConfidenceHandler,
  GradeAInstantMatchHandler,
  GradeAResaleHandler,
  GradeBRefurbishmentHandler,
  GradeCDLowValueHandler,
  GradeCDHighValueHandler,
  DefaultFallbackHandler,
} from './handlers/index.js';

/**
 * Builds the disposition chain in strict priority order and returns the head handler.
 *
 * @param config - The application configuration containing all sub-configs needed by handlers.
 * @returns The head of the chain (ManualReviewFlagHandler).
 */
export function buildDispositionChain(config: AppConfig): IDispositionHandler {
  const {
    fraud,
    dispositionThresholds,
    refundPercentages,
    manualReview,
  } = config;

  // Instantiate all handlers with their config dependencies
  const wrongItemHandler = new WrongItemHandler();
  const manualReviewHandler = new ManualReviewFlagHandler(refundPercentages, manualReview);
  const fraudCheckHandler = new FraudCheckHandler(fraud, refundPercentages, manualReview);
  const lowConfidenceHandler = new LowConfidenceHandler(dispositionThresholds, refundPercentages, manualReview);
  const gradeAInstantMatchHandler = new GradeAInstantMatchHandler(dispositionThresholds, refundPercentages);
  const gradeAResaleHandler = new GradeAResaleHandler(refundPercentages);
  const gradeBRefurbishmentHandler = new GradeBRefurbishmentHandler(refundPercentages);
  const gradeCDLowValueHandler = new GradeCDLowValueHandler(dispositionThresholds, refundPercentages);
  const gradeCDHighValueHandler = new GradeCDHighValueHandler(dispositionThresholds, refundPercentages);
  const defaultFallbackHandler = new DefaultFallbackHandler(refundPercentages, manualReview);

  // Wire the chain in strict priority order via setNext()
  // WrongItemHandler runs first — intercepts wrong_item / not_as_described before all others
  wrongItemHandler.setNext(manualReviewHandler);
  manualReviewHandler.setNext(fraudCheckHandler);
  fraudCheckHandler.setNext(lowConfidenceHandler);
  lowConfidenceHandler.setNext(gradeAInstantMatchHandler);
  gradeAInstantMatchHandler.setNext(gradeAResaleHandler);
  gradeAResaleHandler.setNext(gradeBRefurbishmentHandler);
  gradeBRefurbishmentHandler.setNext(gradeCDLowValueHandler);
  gradeCDLowValueHandler.setNext(gradeCDHighValueHandler);
  gradeCDHighValueHandler.setNext(defaultFallbackHandler);

  // Return the head of the chain
  return wrongItemHandler;
}

/**
 * Convenience function: builds the chain and evaluates the given context.
 *
 * @param context - The routing context to evaluate.
 * @param config - The application configuration.
 * @returns The routing result from the chain.
 * @throws Error if the chain returns null (should never happen due to DefaultFallbackHandler).
 */
export function evaluateDisposition(context: RoutingContext, config: AppConfig): RoutingResult {
  const head = buildDispositionChain(config);
  const result = head.handle(context);

  if (result === null) {
    throw new Error(
      'DispositionChain: no handler produced a result. This should never happen — the DefaultFallbackHandler must always claim.',
    );
  }

  return result;
}
