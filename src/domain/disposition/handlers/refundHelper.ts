/**
 * Shared refund estimate helper for disposition handlers.
 *
 * Delegates to RefundCalculator for the actual computation.
 * This function is retained for backward compatibility with existing handlers.
 *
 * Requirements: 12.1, 12.2, 11.3
 */

import type { RefundEstimate, DispositionRoute, ReturnReason } from '../../shared/types.js';
import type { RefundPercentagesConfig } from '../../../infrastructure/config/index.js';
import { RefundCalculator } from '../RefundCalculator.js';

export function computeRefundEstimate(
  itemValue: number,
  currency: string,
  route: DispositionRoute,
  returnReason: ReturnReason,
  refundPercentages: RefundPercentagesConfig,
): RefundEstimate {
  const calculator = new RefundCalculator(refundPercentages);
  return calculator.calculate(itemValue, currency, route, returnReason);
}
