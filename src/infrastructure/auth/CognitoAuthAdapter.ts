/**
 * CognitoAuthAdapter — AWS Cognito implementation of IAuthService.
 *
 * Verifies Cognito JWT access tokens via CognitoIdentityProviderClient.getUser().
 * Maps the Cognito `sub` claim to `customerId` and delegates ownership/order-item
 * queries to the injected IOrderRepository.
 *
 * Config:
 *  - COGNITO_ENABLED=true activates this adapter at the composition root
 *  - COGNITO_USER_POOL_ID — the Cognito User Pool ID
 *  - COGNITO_REGION — the AWS region for the Cognito client
 *
 * Requirements: 1.7, 2.3, 2.7
 */

import {
  CognitoIdentityProviderClient,
  GetUserCommand,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { IAuthService, Customer, OrderItem as AuthOrderItem } from '../../domain/shared/IAuthService.js';
import type { IOrderRepository } from '../../domain/ordering/IOrderRepository.js';

export class CognitoAuthAdapter implements IAuthService {
  private readonly cognitoClient: CognitoIdentityProviderClient;

  constructor(private readonly orderRepo: IOrderRepository) {
    const region = process.env.COGNITO_REGION || 'us-east-1';

    this.cognitoClient = new CognitoIdentityProviderClient({ region });
  }

  /**
   * Authenticate a Cognito access token by calling GetUser.
   * Extracts the `sub` attribute as customerId and returns a Customer projection.
   * Returns null if the token is invalid or expired.
   */
  async authenticate(token: string): Promise<Customer | null> {
    if (!token || token.trim().length === 0) {
      return null;
    }

    try {
      const command = new GetUserCommand({ AccessToken: token });
      const response = await this.cognitoClient.send(command);

      const attributes: AttributeType[] = response.UserAttributes ?? [];
      const sub = attributes.find((attr) => attr.Name === 'sub')?.Value;
      const email = attributes.find((attr) => attr.Name === 'email')?.Value;
      const name = attributes.find((attr) => attr.Name === 'name')?.Value;

      if (!sub) {
        return null;
      }

      return {
        id: sub,
        name: name ?? '',
        email: email ?? '',
      };
    } catch {
      // Token invalid, expired, or Cognito service error → unauthenticated
      return null;
    }
  }

  /**
   * Verify that a customer owns the specified order item.
   * Delegates to IOrderRepository.findOrderItemById.
   */
  async verifyOwnership(customerId: string, orderItemId: string): Promise<boolean> {
    const result = await this.orderRepo.findOrderItemById(orderItemId);
    if (!result) {
      return false;
    }
    return result.item.customerId === customerId;
  }

  /**
   * Get order item details by ID, mapped to the IAuthService.OrderItem projection.
   * Delegates to IOrderRepository.findOrderItemById.
   */
  async getOrderItem(orderItemId: string): Promise<AuthOrderItem | null> {
    const result = await this.orderRepo.findOrderItemById(orderItemId);
    if (!result) {
      return null;
    }

    return {
      id: result.item.id,
      orderId: result.item.orderId,
      productId: result.item.productId,
      customerId: result.item.customerId,
      deliveryDate: result.item.deliveryDate,
      price: result.item.unitPrice,
      currency: 'INR',
      productName: result.item.productName,
      productImage: result.item.productImage,
    };
  }

  /**
   * Get all order items for a customer, mapped to IAuthService.OrderItem projections.
   * Delegates to IOrderRepository.findByCustomerId.
   */
  async getOrderItemsByCustomer(customerId: string): Promise<AuthOrderItem[]> {
    const orders = await this.orderRepo.findByCustomerId(customerId);
    return orders
      .flatMap((order) => order.items)
      .filter((item) => item.customerId === customerId)
      .map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        customerId: item.customerId,
        deliveryDate: item.deliveryDate,
        price: item.unitPrice,
        currency: 'INR',
        productName: item.productName,
        productImage: item.productImage,
      }));
  }
}
