/**
 * IAuthService — contract for authentication and ownership verification.
 *
 * Implementations:
 *  - CognitoAuthAdapter     (infrastructure/auth) — Amazon Cognito
 *  - MockAuthService        (infrastructure/auth) — dev/demo (always-authenticate)
 *
 * Requirements: 1.7
 */

export interface Customer {
  id: string;
  name: string;
  email: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  customerId: string;
  deliveryDate: Date;
  price: number;
  currency: string;
  productName: string;
  productImage: string;
}

export interface IAuthService {
  /**
   * Authenticate a customer by token/session. In mock mode, always succeeds.
   * @returns The authenticated customer, or null if authentication fails.
   */
  authenticate(token: string): Promise<Customer | null>;

  /**
   * Verify that a customer owns the specified order item.
   * @returns true if the customer owns the order item.
   */
  verifyOwnership(customerId: string, orderItemId: string): Promise<boolean>;

  /**
   * Get order item details for a given order item ID.
   * @returns The order item, or null if not found.
   */
  getOrderItem(orderItemId: string): Promise<OrderItem | null>;

  /**
   * Get all order items for a customer.
   */
  getOrderItemsByCustomer(customerId: string): Promise<OrderItem[]>;
}
