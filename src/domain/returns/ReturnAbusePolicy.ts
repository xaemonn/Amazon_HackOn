/**
 * ReturnAbusePolicy — pure domain policy that protects against serial-return
 * abuse ("wardrobing" / buy-cheap-then-return-for-free schemes).
 *
 * It does NOT call repositories; callers supply the customer's recent return
 * count (already available via IReturnRequestRepository.countByCustomerInDays)
 * and the product's value. Keeping it pure makes it trivially testable and lets
 * the same rules run pre-purchase (product page) and at return time (eligibility).
 *
 * Tiers:
 *   - none      : normal customer — returns allowed.
 *   - elevated  : approaching the limit — returns allowed, customer is warned.
 *   - high      : over the limit — returns BLOCKED on abuse-prone (low-value)
 *                 items, still allowed on higher-value items.
 */

export interface ReturnAbuseConfig {
  /** Recent-return count at which the customer starts seeing warnings. */
  warnThreshold: number;
  /** Recent-return count at which low-value returns are blocked. */
  blockThreshold: number;
  /** Products at or below this value are considered abuse-prone (cheap). */
  abuseProneMaxValue: number;
}

export type ReturnRiskLevel = 'none' | 'elevated' | 'high';

export interface ReturnPolicyDecision {
  /** Whether a return may be initiated for this product by this customer. */
  returnsAllowed: boolean;
  riskLevel: ReturnRiskLevel;
  /** Customer-facing message (null when there is nothing to surface). */
  warning: string | null;
  /** The recent-return count the decision was based on (for transparency/audit). */
  recentReturnCount: number;
}

/**
 * Evaluate the return policy for a (customer, product) pair.
 *
 * @param recentReturnCount - returns the customer made within the policy window.
 * @param productValue      - the product's price in local currency.
 * @param config            - tunable thresholds.
 */
export function evaluateReturnPolicy(
  recentReturnCount: number,
  productValue: number,
  config: ReturnAbuseConfig,
): ReturnPolicyDecision {
  const isAbuseProne = productValue <= config.abuseProneMaxValue;

  // High risk: over the block threshold.
  if (recentReturnCount >= config.blockThreshold) {
    if (isAbuseProne) {
      return {
        returnsAllowed: false,
        riskLevel: 'high',
        recentReturnCount,
        warning:
          'Returns are not available for this item on your account. ' +
          `You have made ${recentReturnCount} returns recently; lower-value ` +
          'items are non-returnable while your return activity is unusually high.',
      };
    }
    return {
      returnsAllowed: true,
      riskLevel: 'high',
      recentReturnCount,
      warning:
        `Heads up: with ${recentReturnCount} recent returns, returns on ` +
        'lower-value items are currently restricted on your account.',
    };
  }

  // Elevated risk: approaching the limit.
  if (recentReturnCount >= config.warnThreshold) {
    return {
      returnsAllowed: true,
      riskLevel: 'elevated',
      recentReturnCount,
      warning:
        `You've made ${recentReturnCount} returns recently. Frequent returns ` +
        'on low-value items may make them non-returnable on your account.',
    };
  }

  return {
    returnsAllowed: true,
    riskLevel: 'none',
    recentReturnCount,
    warning: null,
  };
}
