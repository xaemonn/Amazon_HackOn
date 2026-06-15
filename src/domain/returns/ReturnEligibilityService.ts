/**
 * ReturnEligibilityService — pure domain service for return eligibility checks.
 *
 * Determines whether a customer's order item is still within its return window,
 * calculates remaining days or the policy expiration date, and enforces
 * customer ownership of the item.
 *
 * This service has NO infrastructure dependencies — it receives all inputs
 * via parameters (date logic + injected config), making it deterministic and
 * trivially testable.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.7
 */

import type { OrderItem } from './OrderItem.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration injected into the eligibility check.
 * Callers supply this from AppConfig.returnWindow so the domain layer never
 * imports infrastructure.
 */
export interface EligibilityConfig {
  /** Return window duration in calendar days. */
  returnWindowDays: number;
}

/**
 * The result of a return eligibility check.
 *
 * Requirement 1.2 — eligible: true with daysRemaining when within window.
 * Requirement 1.3 — eligible: false with policyExpirationDate when past window.
 * Requirement 1.4 — productName, productImage, orderDate for display.
 */
export interface EligibilityResult {
  /** Whether the item is within its return window. */
  eligible: boolean;

  /**
   * Whole days remaining in the return window.
   * Non-null only when eligible is true.
   * May be 0 on the final day of the window (still eligible).
   */
  daysRemaining: number | null;

  /**
   * The date on which the return window expired (or will expire).
   * Non-null only when eligible is false.
   */
  policyExpirationDate: Date | null;

  /** Product name for display (Requirement 1.4). */
  productName: string;

  /** Product image URL/key for display (Requirement 1.4). */
  productImage: string;

  /** Order date for display (Requirement 1.4). */
  orderDate: Date;

  /**
   * Human-readable error message, or null on success.
   * Set when the check fails due to an ownership violation or other error.
   */
  errorMessage: string | null;

  /**
   * Return-abuse policy outcome for this (customer, product). Optional so the
   * pure window check can run without it; populated by the facade which has
   * access to return history and product value.
   */
  returnPolicy?: {
    returnsAllowed: boolean;
    riskLevel: 'none' | 'elevated' | 'high';
    warning: string | null;
    recentReturnCount: number;
  };
}

// ─── Error classes ────────────────────────────────────────────────────────────

/**
 * Thrown when the requesting customer does not own the order item.
 *
 * Requirement 1.7 — reject with a clear ownership error.
 */
export class OwnershipError extends Error {
  constructor(customerId: string, orderItemId: string) {
    super(
      `Order item '${orderItemId}' does not belong to customer '${customerId}'.`,
    );
    this.name = 'OwnershipError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── ReturnEligibilityService ─────────────────────────────────────────────────

/**
 * Pure domain service — no constructor dependencies, all inputs injected.
 *
 * Design decision: using a class (rather than a plain function) allows the
 * service to be registered in the DI container and swapped behind an interface
 * if the eligibility logic ever needs to vary by category/policy. A static
 * method is exposed for convenience when DI is unnecessary (e.g., unit tests).
 */
export class ReturnEligibilityService {
  /**
   * Check whether the given customer is eligible to return the supplied order item.
   *
   * @param customerId  - The ID of the customer initiating the return.
   * @param orderItem   - The resolved order item (ownership + delivery info).
   * @param config      - Injected return-window configuration.
   * @param now         - Current timestamp; defaults to `new Date()`.
   *                      Override in tests to produce deterministic results.
   * @returns           An EligibilityResult describing eligibility status.
   * @throws {OwnershipError} When customerId !== orderItem.customerId.
   *
   * Requirements: 1.1, 1.2, 1.3, 1.7
   */
  checkEligibility(
    customerId: string,
    orderItem: OrderItem,
    config: EligibilityConfig,
    now: Date = new Date(),
  ): EligibilityResult {
    // ── Ownership check (Requirement 1.7) ──────────────────────────────────
    if (orderItem.customerId !== customerId) {
      throw new OwnershipError(customerId, orderItem.id);
    }

    // ── Return window calculation (Requirements 1.1, 1.2, 1.3) ───────────
    const policyExpirationDate = new Date(
      orderItem.deliveryDate.getTime() + config.returnWindowDays * MS_PER_DAY,
    );

    const msRemaining = policyExpirationDate.getTime() - now.getTime();
    const eligible = msRemaining > 0;

    if (eligible) {
      // daysRemaining: ceiling so the customer sees "1 day" on the last full day,
      // and "0 days" only when it is the very last partial day before expiry.
      const daysRemaining = Math.ceil(msRemaining / MS_PER_DAY);

      return {
        eligible: true,
        daysRemaining,
        policyExpirationDate: null,
        productName: orderItem.productName,
        productImage: orderItem.productImage,
        orderDate: orderItem.orderDate,
        errorMessage: null,
      };
    }

    // Past the window
    return {
      eligible: false,
      daysRemaining: null,
      policyExpirationDate,
      productName: orderItem.productName,
      productImage: orderItem.productImage,
      orderDate: orderItem.orderDate,
      errorMessage: null,
    };
  }
}
