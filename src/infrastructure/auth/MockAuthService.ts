/**
 * MockAuthService — dev/demo implementation of IAuthService.
 *
 * Always-authenticate mode: any non-empty token resolves to the seeded demo customer.
 * Pre-seeded with one customer and three order items to support the demo flow.
 *
 * Requirements: 1.7
 */

import type { IAuthService, Customer, OrderItem } from '../../domain/shared/index.js';

export class MockAuthService implements IAuthService {
  private readonly customers = new Map<string, Customer>();
  private readonly orderItems = new Map<string, OrderItem>();

  constructor() {
    // Seed demo customer
    const demoCustomer: Customer = {
      id: 'customer-001',
      name: 'Priya Sharma',
      email: 'priya@example.com',
    };
    this.customers.set(demoCustomer.id, demoCustomer);

    // Seed order items (all owned by customer-001)
    // Uses product IDs recognized by MockConditionGrader (item-grade-a/b/c/d)
    const seedItems: OrderItem[] = [
      {
        id: 'order-item-001',
        orderId: 'order-001',
        productId: 'item-grade-a',
        customerId: 'customer-001',
        deliveryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        price: 1299,
        currency: 'INR',
        productName: 'Premium Wireless Headphones',
        productImage: '/images/headphones.jpg',
        catalogImageRef: 'catalog/item-grade-a.jpg',
      },
      {
        id: 'order-item-002',
        orderId: 'order-001',
        productId: 'item-grade-b',
        customerId: 'customer-001',
        deliveryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        price: 799,
        currency: 'INR',
        productName: 'Bluetooth Speaker',
        productImage: '/images/speaker.jpg',
        catalogImageRef: 'catalog/item-grade-b.jpg',
      },
      {
        id: 'order-item-003',
        orderId: 'order-002',
        productId: 'item-grade-c',
        customerId: 'customer-001',
        deliveryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        price: 499,
        currency: 'INR',
        productName: 'Phone Case',
        productImage: '/images/phone-case.jpg',
        catalogImageRef: 'catalog/item-grade-c.jpg',
      },
      {
        id: 'order-item-004',
        orderId: 'order-002',
        productId: 'item-grade-d',
        customerId: 'customer-001',
        deliveryDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        price: 199,
        currency: 'INR',
        productName: 'USB Cable',
        productImage: '/images/usb-cable.jpg',
        catalogImageRef: 'catalog/item-grade-d.jpg',
      },
      {
        id: 'order-item-005',
        orderId: 'order-003',
        productId: 'item-earbuds',
        customerId: 'customer-001',
        deliveryDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        price: 2499,
        currency: 'INR',
        productName: 'Wireless Earbuds',
        productImage: '/images/earbuds.jpg',
        catalogImageRef: 'catalog/item-grade-a.jpg',
      },
    ];

    for (const item of seedItems) {
      this.orderItems.set(item.id, item);
    }
  }

  /**
   * Always-authenticate mode: returns the seeded demo customer for any non-empty token.
   * Returns null only if the token is empty or undefined.
   */
  async authenticate(token: string): Promise<Customer | null> {
    if (!token || token.trim().length === 0) {
      return null;
    }
    // Always return the first seeded customer in demo mode
    const customers = Array.from(this.customers.values());
    return customers[0] ?? null;
  }

  /**
   * Verify that the customer owns the specified order item.
   */
  async verifyOwnership(customerId: string, orderItemId: string): Promise<boolean> {
    const item = this.orderItems.get(orderItemId);
    if (!item) {
      return false;
    }
    return item.customerId === customerId;
  }

  /**
   * Get order item details by ID.
   */
  async getOrderItem(orderItemId: string): Promise<OrderItem | null> {
    return this.orderItems.get(orderItemId) ?? null;
  }

  /**
   * Get all order items for a given customer.
   */
  async getOrderItemsByCustomer(customerId: string): Promise<OrderItem[]> {
    const items: OrderItem[] = [];
    for (const item of this.orderItems.values()) {
      if (item.customerId === customerId) {
        items.push(item);
      }
    }
    return items;
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  /**
   * Add a customer to the in-memory store (useful for tests).
   */
  addCustomer(customer: Customer): void {
    this.customers.set(customer.id, customer);
  }

  /**
   * Add an order item to the in-memory store (useful for tests).
   */
  addOrderItem(item: OrderItem): void {
    this.orderItems.set(item.id, item);
  }
}
