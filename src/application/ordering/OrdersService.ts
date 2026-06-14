/**
 * Orders application service.
 *
 * Provides read access to orders for a customer and keeps order item refund
 * statuses in sync by subscribing to the `RefundIssued` domain event.
 *
 * Requirements: Accounts & Orders spec
 */

import type { IOrderRepository, Order, RefundStatus } from '../../domain/ordering/index.js';
import type { IEventBus, DomainEvent } from '../../domain/shared/events.js';
import type { IReturnsFacade, EligibilityResult } from '../returns/index.js';

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * Public contract for the Orders application service.
 * Presentation and other application layers depend on this interface only —
 * never on the concrete OrdersService class.
 */
export interface IOrdersService {
  /**
   * Returns all orders belonging to the given customer, sorted by
   * placedDate descending (most-recent first).
   */
  getOrdersByCustomer(customerId: string): Promise<Order[]>;

  /**
   * Returns the full order detail for the given order, but only if it
   * belongs to the given customer (prevents cross-customer data leaks).
   * Returns null if the order is not found or belongs to another customer.
   */
  getOrderDetail(customerId: string, orderId: string): Promise<Order | null>;

  /**
   * Overwrites the refund status on the specified order item.
   * If the item is not found, a warning is logged and the call returns
   * without throwing (idempotent).
   */
  updateRefundStatus(orderItemId: string, refundStatus: RefundStatus): Promise<void>;

  /**
   * Delegates to the Returns facade to check whether the given customer
   * may still return the referenced order item.
   *
   * On any unexpected error the method returns a safe error-fallback
   * EligibilityResult rather than propagating the exception.
   */
  checkReturnEligibility(customerId: string, orderItemId: string): Promise<EligibilityResult>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Concrete implementation of IOrdersService.
 *
 * All dependencies are injected — no direct infrastructure imports.
 * The constructor subscribes to the `RefundIssued` event so that the order
 * item's refund status is kept up-to-date whenever a refund is finalised by
 * the Returns module.
 */
export class OrdersService implements IOrdersService {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly returnsFacade: IReturnsFacade,
    private readonly eventBus: IEventBus,
  ) {
    // Subscribe to RefundIssued so this service stays in sync without
    // coupling the Returns module to the Ordering module.
    this.eventBus.subscribe('RefundIssued', this.handleRefundIssued.bind(this));
  }

  // ── getOrdersByCustomer ─────────────────────────────────────────────────────

  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    const orders = await this.orderRepo.findByCustomerId(customerId);

    // Most-recent first
    return orders.slice().sort(
      (a, b) => b.placedDate.getTime() - a.placedDate.getTime(),
    );
  }

  // ── getOrderDetail ──────────────────────────────────────────────────────────

  async getOrderDetail(customerId: string, orderId: string): Promise<Order | null> {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      return null;
    }

    // Prevent cross-customer data leak
    if (order.customerId !== customerId) {
      return null;
    }

    return order;
  }

  // ── updateRefundStatus ──────────────────────────────────────────────────────

  async updateRefundStatus(orderItemId: string, refundStatus: RefundStatus): Promise<void> {
    try {
      await this.orderRepo.updateOrderItemRefundStatus(orderItemId, refundStatus);
    } catch (err) {
      // Item not found — log a warning but do not re-throw (idempotent contract)
      console.warn(
        '[OrdersService] updateRefundStatus: order item not found or update failed',
        { orderItemId, error: err },
      );
    }
  }

  // ── checkReturnEligibility ──────────────────────────────────────────────────

  async checkReturnEligibility(
    customerId: string,
    orderItemId: string,
  ): Promise<EligibilityResult> {
    try {
      return await this.returnsFacade.checkEligibility(customerId, orderItemId);
    } catch (err) {
      console.error(
        '[OrdersService] checkReturnEligibility: eligibility check failed',
        { customerId, orderItemId, error: err },
      );
      // Return a safe error-fallback rather than propagating the exception
      return {
        eligible: false,
        daysRemaining: null,
        policyExpirationDate: null,
        productName: '',
        productImage: '',
        orderDate: new Date(0),
        errorMessage: 'Eligibility check temporarily unavailable',
      };
    }
  }

  // ── Private: event handler ──────────────────────────────────────────────────

  /**
   * Handles the `RefundIssued` domain event published by the Returns module.
   * Extracts refund details from the payload and writes them to the order item.
   * Last-write-wins semantics ensure idempotence for duplicate events.
   */
  private async handleRefundIssued(event: DomainEvent): Promise<void> {
    const { orderItemId, amount, currency, issuedAt } = event.payload;

    const refundStatus: RefundStatus = {
      code: 'refund_issued',
      amount: amount as number,
      currency: currency as string,
      issuedAt: new Date(issuedAt as string),
    };

    await this.updateRefundStatus(orderItemId as string, refundStatus);
  }
}
