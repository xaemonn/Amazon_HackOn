/**
 * OrderItem — represents a single item within a customer's order.
 *
 * This interface is the data contract used by the eligibility check to
 * verify ownership and retrieve product display information.
 *
 * Requirements: 1.1, 1.4, 1.7
 */

// ─── OrderItem ────────────────────────────────────────────────────────────────

/**
 * A single line item from a customer order, as needed by the Returns Module.
 *
 * The Returns Module does NOT import the full Order aggregate from the
 * Ordering module — it only needs this lightweight projection.
 */
export interface OrderItem {
  /** Unique identifier for this order line item. */
  id: string;

  /**
   * The customer who placed the order.
   * Used for ownership verification (Requirement 1.7).
   */
  customerId: string;

  /** The parent order identifier. */
  orderId: string;

  /** The catalog product identifier. */
  productId: string;

  /**
   * Human-readable product name, displayed alongside eligibility status.
   * Requirement 1.4 — shown so the customer can confirm the correct item.
   */
  productName: string;

  /**
   * URL or storage key for the product image.
   * Requirement 1.4 — shown so the customer can visually confirm the item.
   */
  productImage: string;

  /**
   * When the order containing this item was placed.
   * Displayed in the eligibility result (Requirement 1.4).
   */
  orderDate: Date;

  /**
   * The date on which this item was delivered to the customer.
   * The Return_Window is measured from this date (Requirement 1.1).
   */
  deliveryDate: Date;
}
