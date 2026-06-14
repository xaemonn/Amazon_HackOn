/**
 * Property 6: RefundIssued correctly updates order item status
 *
 * For any valid RefundIssued event with amount > 0, a valid currency string,
 * and a valid issuedAt timestamp, publishing that event SHALL result in the
 * referenced order item's refundStatus being set to
 * { code: 'refund_issued', amount, currency, issuedAt }.
 *
 * Feature: integration-wiring, Property 6: RefundIssued correctness
 * Validates: Requirements 8.1
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InProcessEventBus } from '../../infrastructure/events/InProcessEventBus';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository';
import { OrdersService } from '../../application/ordering/OrdersService';
import type { Order } from '../../domain/ordering/Order';
import type { DomainEvent } from '../../domain/shared/events';
import type { IReturnsFacade } from '../../application/returns/index';
import { randomUUID } from 'crypto';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Minimal mock ReturnsFacade — only RefundIssued handling is being tested */
const minimalReturnsFacade: IReturnsFacade = {
  checkEligibility: async () => ({
    eligible: false,
    daysRemaining: null,
    policyExpirationDate: null,
    productName: '',
    productImage: '',
    orderDate: new Date(0),
    errorMessage: 'Not implemented in test',
  }),
  initiateReturn: async () => { throw new Error('Not implemented in test'); },
  submitReason: async () => { throw new Error('Not implemented in test'); },
  submitMedia: async () => { throw new Error('Not implemented in test'); },
  completeMediaCapture: async () => { throw new Error('Not implemented in test'); },
  getReturnById: async () => null,
};

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a random positive amount (1-999999) */
const amountArb = fc.integer({ min: 1, max: 999999 });

/** Generate a random currency code from common codes */
const currencyArb = fc.oneof(
  fc.constant('INR'),
  fc.constant('USD'),
  fc.constant('EUR'),
);

/** Generate a random issuedAt as ISO string */
const issuedAtArb = fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2030-12-31T23:59:59.999Z'), noInvalidDate: true })
  .map(d => d.toISOString());

// ─── Property Test ───────────────────────────────────────────────────────────

describe('Feature: integration-wiring, Property 6: RefundIssued correctness', () => {
  it('RefundIssued event correctly sets order item refundStatus to { code: "refund_issued", amount, currency, issuedAt }', async () => {
    await fc.assert(
      fc.asyncProperty(
        amountArb,
        currencyArb,
        issuedAtArb,
        async (amount, currency, issuedAt) => {
          // Create fresh infrastructure for each property run
          const eventBus = new InProcessEventBus();
          const orderRepo = new InMemoryOrderRepository();

          // Seed one order with one order item (refundStatus: { code: 'none' })
          const orderId = `prop6-order-${randomUUID()}`;
          const orderItemId = `prop6-item-${randomUUID()}`;
          const customerId = `prop6-customer-${randomUUID()}`;

          const order: Order = {
            id: orderId,
            customerId,
            placedDate: new Date('2024-01-01'),
            status: 'delivered',
            paymentType: 'prepaid',
            items: [
              {
                id: orderItemId,
                orderId,
                customerId,
                productId: 'prod-1',
                variantId: 'var-1',
                productName: 'Test Product',
                productImage: '/assets/products/prod-1.jpg',
                unitPrice: 1000,
                quantity: 1,
                deliveryDate: new Date('2024-01-05'),
                deliveryStatus: 'delivered',
                refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
              },
            ],
          };

          await orderRepo.save(order);

          // Create OrdersService with the shared event bus (subscribes to RefundIssued)
          new OrdersService(orderRepo, minimalReturnsFacade, eventBus);

          // Publish a RefundIssued event with the generated amount, currency, issuedAt
          const event: DomainEvent = {
            eventId: randomUUID(),
            eventType: 'RefundIssued',
            timestamp: new Date(),
            payload: {
              orderItemId,
              returnRequestId: randomUUID(),
              amount,
              currency,
              issuedAt,
            },
          };

          await eventBus.publish(event);

          // Verify the order item now has the correct refundStatus
          const found = await orderRepo.findOrderItemById(orderItemId);
          expect(found).not.toBeNull();
          expect(found!.item.refundStatus.code).toBe('refund_issued');
          expect(found!.item.refundStatus.amount).toBe(amount);
          expect(found!.item.refundStatus.currency).toBe(currency);
          expect(found!.item.refundStatus.issuedAt).toEqual(new Date(issuedAt));
        },
      ),
      { numRuns: 100 },
    );
  });
});
