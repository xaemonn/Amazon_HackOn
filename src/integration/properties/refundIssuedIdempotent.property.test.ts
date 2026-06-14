/**
 * Property 7: RefundIssued idempotent handling
 *
 * For any RefundIssued event published N times (N >= 1) for the same orderItemId,
 * the order item's refundStatus after N publications SHALL be identical to the
 * status after exactly 1 publication.
 *
 * Feature: integration-wiring, Property 7: RefundIssued idempotent handling
 * Validates: Requirements 8.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InProcessEventBus } from '../../infrastructure/events/InProcessEventBus';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository';
import { OrdersService } from '../../application/ordering/OrdersService';
import type { Order } from '../../domain/ordering/Order';
import type { OrderItem } from '../../domain/ordering/OrderItem';
import type { DomainEvent } from '../../domain/shared/events';
import type { IReturnsFacade } from '../../application/returns/index';
import { randomUUID } from 'crypto';

// ─── Minimal mock for IReturnsFacade (OrdersService requires it but not used in this test) ──

const minimalReturnsFacade: IReturnsFacade = {
  checkEligibility: async () => ({
    eligible: false,
    daysRemaining: null,
    policyExpirationDate: null,
    productName: '',
    productImage: '',
    orderDate: new Date(0),
    errorMessage: 'mock',
  }),
  initiateReturn: async () => { throw new Error('not implemented'); },
  submitReason: async () => { throw new Error('not implemented'); },
  submitMedia: async () => { throw new Error('not implemented'); },
  completeMediaCapture: async () => { throw new Error('not implemented'); },
  getReturnById: async () => null,
};

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a valid currency code (3-letter uppercase) */
const currencyArb = fc.constantFrom('INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD');

/** Generate a valid ISO 8601 date string */
const issuedAtArb = fc.date({
  min: new Date('2020-01-01T00:00:00.000Z'),
  max: new Date('2030-12-31T23:59:59.999Z'),
  noInvalidDate: true,
}).map(d => d.toISOString());

/** Generate a positive refund amount */
const amountArb = fc.integer({ min: 1, max: 10000000 }).map(n => n / 100);

describe('Feature: integration-wiring, Property 7: RefundIssued idempotent handling', () => {
  it('publishes RefundIssued N times (1-5) for the same orderItemId — refundStatus after N equals status after 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        amountArb,
        currencyArb,
        issuedAtArb,
        // Optionally generate different amounts for subsequent events to prove first-wins
        fc.array(amountArb, { minLength: 4, maxLength: 4 }),
        async (publishCount, firstAmount, currency, issuedAt, subsequentAmounts) => {
          // Create fresh infrastructure for each property run
          const eventBus = new InProcessEventBus();
          const orderRepo = new InMemoryOrderRepository();

          // Seed one order with one item (refundStatus: { code: 'none' })
          const orderItemId = `item-${randomUUID()}`;
          const orderId = `order-${randomUUID()}`;
          const customerId = `customer-${randomUUID()}`;

          const orderItem: OrderItem = {
            id: orderItemId,
            orderId,
            customerId,
            productId: `product-${randomUUID()}`,
            variantId: `variant-${randomUUID()}`,
            productName: 'Test Product',
            productImage: '/assets/products/test.jpg',
            unitPrice: 1000,
            quantity: 1,
            deliveryDate: new Date(),
            deliveryStatus: 'delivered',
            refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
          };

          const order: Order = {
            id: orderId,
            customerId,
            placedDate: new Date(),
            status: 'delivered',
            paymentType: 'prepaid',
            items: [orderItem],
          };

          await orderRepo.save(order);

          // Create OrdersService — subscribes to RefundIssued on the shared event bus
          new OrdersService(orderRepo, minimalReturnsFacade, eventBus);

          // Publish the RefundIssued event N times
          // First event uses firstAmount; subsequent events use potentially different amounts
          // to prove that the first refund wins (idempotent — subsequent are discarded)
          for (let i = 0; i < publishCount; i++) {
            const eventAmount = i === 0 ? firstAmount : subsequentAmounts[i - 1];
            const event: DomainEvent = {
              eventId: randomUUID(),
              eventType: 'RefundIssued',
              timestamp: new Date(),
              payload: {
                orderItemId,
                returnRequestId: randomUUID(),
                amount: eventAmount,
                currency,
                issuedAt,
              },
            };

            await eventBus.publish(event);
          }

          // Verify the final refundStatus
          const found = await orderRepo.findOrderItemById(orderItemId);
          expect(found).not.toBeNull();
          const finalStatus = found!.item.refundStatus;

          // The status should always reflect the FIRST event's data (first refund wins)
          expect(finalStatus.code).toBe('refund_issued');
          expect(finalStatus.amount).toBe(firstAmount);
          expect(finalStatus.currency).toBe(currency);
          expect(finalStatus.issuedAt).toEqual(new Date(issuedAt));

          // Key idempotency check: status after N publications === status after 1 publication
          // Since subsequent events have potentially different amounts, if the handler
          // is NOT idempotent it would overwrite with a different amount
          // The fact that finalStatus.amount === firstAmount proves first-wins idempotency
        },
      ),
      { numRuns: 100 },
    );
  });
});
