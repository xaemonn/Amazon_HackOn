/**
 * Returns application module — ReturnsFacade.
 *
 * The facade is the single entry point for the Returns Module.
 * It coordinates domain services and does NOT import infrastructure directly —
 * all dependencies are injected.
 *
 * Task 2.4: checkEligibility use-case with ownership verification and
 * return-window calculation, backed by an in-memory stub order-item store
 * until the full repository layer is wired in task 7.1.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.7
 */

import type { EligibilityResult, OrderItem } from '../../domain/returns/index.js';
import { ReturnEligibilityService, OwnershipError } from '../../domain/returns/index.js';
import type { AppConfig } from '../../infrastructure/config/index.js';

// ─── IReturnsFacade ───────────────────────────────────────────────────────────

/**
 * Facade interface for the Returns Module.
 * Application and presentation layers depend on this interface, never on the
 * concrete ReturnsFacade class.
 */
export interface IReturnsFacade {
  /**
   * Check whether the given customer may return the referenced order item.
   *
   * @param customerId   - ID of the customer initiating the check.
   * @param orderItemId  - ID of the order item to evaluate.
   * @returns            EligibilityResult with eligible status and display data.
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.7
   */
  checkEligibility(customerId: string, orderItemId: string): Promise<EligibilityResult>;
}

// ─── ReturnsFacade ────────────────────────────────────────────────────────────

/**
 * Concrete implementation of IReturnsFacade.
 *
 * For task 2.4, order item lookup is performed against an in-memory stub store.
 * When the full repository layer is available (task 6.1), replace
 * `orderItemStore` with an `IOrderItemRepository` injection.
 */
export class ReturnsFacade implements IReturnsFacade {
  private readonly eligibilityService: ReturnEligibilityService;
  private readonly returnWindowDays: number;

  /**
   * @param config         - Application configuration (returnWindow, etc.)
   * @param orderItemStore - In-memory map of orderItemId → OrderItem.
   *                         Will be replaced by a repository in task 7.1.
   */
  constructor(
    private readonly config: AppConfig,
    private readonly orderItemStore: Map<string, OrderItem> = new Map(),
  ) {
    this.eligibilityService = new ReturnEligibilityService();
    this.returnWindowDays = config.returnWindow.defaultDays;
  }

  /**
   * Register an order item in the in-memory stub store.
   * Used by seed data and tests until the real repository is wired.
   *
   * @param orderItem - The order item to register.
   */
  registerOrderItem(orderItem: OrderItem): void {
    this.orderItemStore.set(orderItem.id, orderItem);
  }

  /**
   * Check whether the customer owns and is eligible to return the order item.
   *
   * Resolves the order item from the stub store, then delegates to
   * ReturnEligibilityService for the ownership + window calculation.
   *
   * If the order item is not found, returns an ineligible result with an
   * error message (Requirement 1.6 — service error handling).
   *
   * Requirements: 1.1, 1.2, 1.3, 1.7
   */
  async checkEligibility(
    customerId: string,
    orderItemId: string,
  ): Promise<EligibilityResult> {
    const orderItem = this.orderItemStore.get(orderItemId);

    if (!orderItem) {
      // Item not found — surface as a graceful error, not a thrown exception,
      // so the presentation layer can display the retry option (Requirement 1.6).
      return {
        eligible: false,
        daysRemaining: null,
        policyExpirationDate: null,
        productName: '',
        productImage: '',
        orderDate: new Date(0),
        errorMessage: `Order item '${orderItemId}' could not be found. Please try again.`,
      };
    }

    try {
      return this.eligibilityService.checkEligibility(
        customerId,
        orderItem,
        { returnWindowDays: this.returnWindowDays },
      );
    } catch (err) {
      if (err instanceof OwnershipError) {
        // Ownership mismatch — return an error result rather than propagating.
        // The presentation layer uses errorMessage to display the ownership error.
        return {
          eligible: false,
          daysRemaining: null,
          policyExpirationDate: null,
          productName: orderItem.productName,
          productImage: orderItem.productImage,
          orderDate: orderItem.orderDate,
          errorMessage: "This item does not belong to your account.",
        };
      }
      throw err;
    }
  }
}
