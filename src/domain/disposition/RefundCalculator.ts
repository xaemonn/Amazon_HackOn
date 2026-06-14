/**
 * RefundCalculator — reason-aware refund estimate calculation.
 *
 * Encapsulates the refund calculation logic as a class implementing IRefundCalculator
 * for dependency injection. Delegates from the original computeRefundEstimate helper.
 *
 * Rules:
 * - Fault reasons (defective, damaged_in_transit, wrong_item, not_as_described) → 100% refund regardless of route
 * - Choice reasons (changed_mind, size_fit) → route-based percentage from config
 * - isMinimumGuarantee=true for manual_inspection and refurbishment when choice reason
 * - Amount is clamped to non-negative integers
 * - reasonAware flag is always true
 *
 * Requirements: 12.1, 12.2, 11.3
 */

import type { RefundEstimate, DispositionRoute, ReturnReason } from '../shared/types.js';
import type { RefundPercentagesConfig } from '../../infrastructure/config/index.js';

/**
 * Interface for refund estimation — supports DI and testing.
 */
export interface IRefundCalculator {
  calculate(
    itemValue: number,
    currency: string,
    route: DispositionRoute,
    returnReason: ReturnReason,
  ): RefundEstimate;
}

/**
 * The set of return reasons considered "fault" (not the customer's choice).
 * Fault reasons always yield a 100% refund regardless of the disposition route.
 */
const FAULT_REASONS: ReadonlySet<ReturnReason> = new Set<ReturnReason>([
  'defective',
  'damaged_in_transit',
  'wrong_item',
  'not_as_described',
]);

/**
 * Map a disposition route to its refund condition (timing).
 */
function getRefundCondition(route: DispositionRoute): RefundEstimate['condition'] {
  switch (route) {
    case 'instant_match':
    case 'returnless_refund':
      return 'immediate';
    case 'list_for_resale':
      return 'upon_sale';
    case 'refurbishment':
    case 'donate_or_recycle':
    case 'manual_inspection':
      return 'after_review';
  }
}

/**
 * Map a disposition route to its refund method.
 */
function getRefundMethod(route: DispositionRoute): RefundEstimate['method'] {
  switch (route) {
    case 'instant_match':
    case 'returnless_refund':
    case 'list_for_resale':
    case 'refurbishment':
    case 'manual_inspection':
      return 'original_payment';
    case 'donate_or_recycle':
      return 'store_credit';
  }
}

/**
 * Concrete refund calculator implementing IRefundCalculator.
 */
export class RefundCalculator implements IRefundCalculator {
  constructor(private readonly refundPercentages: RefundPercentagesConfig) {}

  /**
   * Calculate the refund estimate for an item given its value, route, and return reason.
   */
  calculate(
    itemValue: number,
    currency: string,
    route: DispositionRoute,
    returnReason: ReturnReason,
  ): RefundEstimate {
    const isFault = RefundCalculator.isFaultReason(returnReason);
    const percentage = isFault ? 100 : this.refundPercentages[route];
    const rawAmount = (itemValue * percentage) / 100;
    const amount = Math.max(0, Math.round(rawAmount));

    // isMinimumGuarantee: true for manual_inspection/refurbishment when choice reason
    const isMinimumGuarantee =
      !isFault && (route === 'manual_inspection' || route === 'refurbishment');

    return {
      amount,
      currency,
      condition: getRefundCondition(route),
      method: getRefundMethod(route),
      isMinimumGuarantee,
      reasonAware: true,
    };
  }

  /**
   * Determine whether a return reason is a "fault" reason (seller/carrier fault).
   * Fault reasons always receive a 100% refund regardless of route.
   */
  static isFaultReason(reason: ReturnReason): boolean {
    return FAULT_REASONS.has(reason);
  }
}
