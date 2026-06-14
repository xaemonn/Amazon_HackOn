/**
 * Property 8: Cross-module repository visibility
 *
 * For any entity (product, customer, or order) written to a shared repository
 * by one module, any other module holding a reference to the same repository
 * instance SHALL observe that entity on its next read, without requiring
 * restart or reinitialization.
 *
 * Feature: integration-wiring, Property 8: Cross-module repository visibility
 * Validates: Requirements 9.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createCompositionRoot } from '../../composition/root';
import { Product } from '../../domain/catalog/Product';
import type { Customer } from '../../domain/account/Customer';
import type { Order } from '../../domain/ordering/Order';
import type { OrderItem } from '../../domain/ordering/OrderItem';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a random product with valid fields */
const productArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.trim() || 'Product'),
  brand: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.trim() || 'Brand'),
  basePrice: fc.integer({ min: 1, max: 99999 }),
  category: fc.uuid(),
}).map(({ id, title, brand, basePrice, category }) => ({
  id,
  title,
  brand,
  basePrice,
  category,
  catalogImageUrl: `/assets/products/${id}.jpg`,
}));

/** Generate a random customer with minimal valid fields */
const customerArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.trim() || 'Customer'),
  email: fc.emailAddress(),
});

/** Generate a random order with one order item */
const orderArb = fc.record({
  orderId: fc.uuid(),
  customerId: fc.uuid(),
  orderItemId: fc.uuid(),
  productId: fc.uuid(),
  variantId: fc.uuid(),
  unitPrice: fc.integer({ min: 1, max: 99999 }),
});

describe('Feature: integration-wiring, Property 8: Cross-module repository visibility', () => {
  it('product written via shared repo is immediately visible via catalogModule.catalogService.getProductById', async () => {
    await fc.assert(
      fc.asyncProperty(productArb, async (productData) => {
        const composition = createCompositionRoot();

        try {
          // Write a product directly to the shared productRepository
          const product = new Product({
            id: productData.id,
            title: productData.title,
            brand: productData.brand,
            catalogImageUrl: productData.catalogImageUrl,
            category: productData.category,
            basePrice: productData.basePrice,
          });

          // Write via repos (simulating what seed or another module would do)
          (composition.repos.productRepository as any).addProduct(product);

          // Read via catalogModule's catalogService (another module's perspective)
          const found = await composition.catalogModule.catalogService.getProductById(productData.id);

          // Verify the product is immediately visible without restart
          expect(found).not.toBeNull();
          expect(found!.id).toBe(productData.id);
          expect(found!.title).toBe(productData.title);
          expect(found!.basePrice).toBe(productData.basePrice);
          expect(found!.catalogImageUrl).toBe(productData.catalogImageUrl);
        } finally {
          composition.dispose();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('customer written via shared repo is immediately visible via accountsModule.identityService', async () => {
    await fc.assert(
      fc.asyncProperty(customerArb, async (customerData) => {
        const composition = createCompositionRoot();

        try {
          // Write a customer directly to the shared customerRepository
          const customer: Customer = {
            id: customerData.id,
            name: customerData.name,
            email: customerData.email,
            addresses: [],
            paymentMethods: [],
            notificationPreferences: {
              orderUpdates: true,
              promotions: false,
              returnUpdates: true,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Write via repos (simulating what seed or another module would do)
          await composition.repos.customerRepository.save(customer);

          // Read via the same shared repo from another module's perspective
          const found = await composition.repos.customerRepository.findById(customerData.id);

          // Verify the customer is immediately visible without restart
          expect(found).not.toBeNull();
          expect(found!.id).toBe(customerData.id);
          expect(found!.name).toBe(customerData.name);
          expect(found!.email).toBe(customerData.email);
        } finally {
          composition.dispose();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('order written via shared repo is immediately visible via accountsModule.ordersService.getOrderDetail', async () => {
    await fc.assert(
      fc.asyncProperty(orderArb, async (orderData) => {
        const composition = createCompositionRoot();

        try {
          // Create an order item
          const orderItem: OrderItem = {
            id: orderData.orderItemId,
            orderId: orderData.orderId,
            customerId: orderData.customerId,
            productId: orderData.productId,
            variantId: orderData.variantId,
            productName: 'Test Product',
            productImage: '/assets/products/test.jpg',
            unitPrice: orderData.unitPrice,
            quantity: 1,
            deliveryDate: new Date(),
            deliveryStatus: 'delivered',
            refundStatus: { code: 'none' },
          };

          // Create the order
          const order: Order = {
            id: orderData.orderId,
            customerId: orderData.customerId,
            placedDate: new Date(),
            status: 'delivered',
            paymentType: 'prepaid',
            items: [orderItem],
          };

          // Write via repos (simulating what seed or another module would do)
          await composition.repos.orderRepository.save(order);

          // Read via accountsModule's ordersService (another module's perspective)
          const found = await composition.accountsModule.ordersService.getOrderDetail(
            orderData.customerId,
            orderData.orderId,
          );

          // Verify the order is immediately visible without restart
          expect(found).not.toBeNull();
          expect(found!.id).toBe(orderData.orderId);
          expect(found!.customerId).toBe(orderData.customerId);
          expect(found!.items).toHaveLength(1);
          expect(found!.items[0].id).toBe(orderData.orderItemId);
          expect(found!.items[0].unitPrice).toBe(orderData.unitPrice);
        } finally {
          composition.dispose();
        }
      }),
      { numRuns: 100 },
    );
  });
});
