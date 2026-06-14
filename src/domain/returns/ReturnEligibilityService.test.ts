/**
 * Unit tests for ReturnEligibilityService.
 *
 * Covers:
 * - Item within return window → eligible=true, correct daysRemaining
 * - Item past return window → eligible=false, correct policyExpirationDate
 * - Ownership mismatch → throws OwnershipError
 * - Boundary: exactly on last day (last millisecond within window) → eligible
 * - Boundary: exactly at window expiry moment (msRemaining=0) → ineligible
 *
 * Requirements: 1.1, 1.2, 1.3, 1.7
 */

import { describe, it, expect } from 'vitest';
import { ReturnEligibilityService, OwnershipError } from './ReturnEligibilityService.js';
import type { EligibilityConfig } from './ReturnEligibilityService.js';
import type { OrderItem } from './OrderItem.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-001',
    customerId: 'customer-abc',
    orderId: 'order-xyz',
    productId: 'prod-001',
    productName: 'Wireless Headphones',
    productImage: 'https://example.com/images/headphones.jpg',
    orderDate: new Date('2024-01-01T10:00:00Z'),
    deliveryDate: new Date('2024-01-05T10:00:00Z'),
    ...overrides,
  };
}

const defaultConfig: EligibilityConfig = { returnWindowDays: 10 };

const service = new ReturnEligibilityService();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReturnEligibilityService.checkEligibility', () => {
  describe('Requirement 1.2 — within window → eligible', () => {
    it('returns eligible=true with correct daysRemaining when inside the window', () => {
      const orderItem = makeOrderItem({
        deliveryDate: new Date('2024-01-05T10:00:00Z'),
      });
      // Policy expires: 2024-01-15T10:00:00Z
      // "now" is 3 days before expiry → 3 days remaining
      const now = new Date('2024-01-12T10:00:00Z');

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(true);
      expect(result.daysRemaining).toBe(3);
      expect(result.policyExpirationDate).toBeNull();
      expect(result.errorMessage).toBeNull();
    });

    it('includes product display fields in the result', () => {
      const orderItem = makeOrderItem();
      const now = new Date(orderItem.deliveryDate.getTime() + 1 * MS_PER_DAY); // 1 day after delivery

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(true);
      expect(result.productName).toBe('Wireless Headphones');
      expect(result.productImage).toBe('https://example.com/images/headphones.jpg');
      expect(result.orderDate).toEqual(orderItem.orderDate);
    });

    it('returns daysRemaining=1 when exactly 1 day (in ms) remains', () => {
      const deliveryDate = new Date('2024-01-05T10:00:00Z');
      const orderItem = makeOrderItem({ deliveryDate });
      // Policy expires at deliveryDate + 10 days = 2024-01-15T10:00:00Z
      // now = 1ms before exactly 1 full day remaining: 2024-01-14T10:00:00.001Z
      const now = new Date(
        deliveryDate.getTime() + defaultConfig.returnWindowDays * MS_PER_DAY - MS_PER_DAY + 1,
      );

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(true);
      expect(result.daysRemaining).toBe(1);
    });
  });

  describe('Requirement 1.3 — past window → ineligible', () => {
    it('returns eligible=false with policyExpirationDate when past window', () => {
      const deliveryDate = new Date('2024-01-01T00:00:00Z');
      const orderItem = makeOrderItem({ deliveryDate });
      // Policy expires: 2024-01-11T00:00:00Z
      // "now" is 5 days after expiry
      const now = new Date('2024-01-16T00:00:00Z');

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(false);
      expect(result.daysRemaining).toBeNull();
      // Policy expiration should be deliveryDate + 10 days
      const expectedExpiry = new Date(
        deliveryDate.getTime() + defaultConfig.returnWindowDays * MS_PER_DAY,
      );
      expect(result.policyExpirationDate).toEqual(expectedExpiry);
      expect(result.errorMessage).toBeNull();
    });

    it('includes product display fields even when ineligible', () => {
      const orderItem = makeOrderItem({
        deliveryDate: new Date('2024-01-01T00:00:00Z'),
      });
      const now = new Date('2024-06-01T00:00:00Z'); // well past window

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(false);
      expect(result.productName).toBe('Wireless Headphones');
      expect(result.productImage).toBe('https://example.com/images/headphones.jpg');
    });
  });

  describe('Requirement 1.7 — ownership verification', () => {
    it('throws OwnershipError when customerId does not match the order item', () => {
      const orderItem = makeOrderItem({ customerId: 'customer-abc' });
      const wrongCustomer = 'customer-different';

      expect(() =>
        service.checkEligibility(wrongCustomer, orderItem, defaultConfig, new Date()),
      ).toThrow(OwnershipError);
    });

    it('OwnershipError message mentions both the customer and the item', () => {
      const orderItem = makeOrderItem({ id: 'item-001', customerId: 'customer-abc' });

      let caughtError: unknown;
      try {
        service.checkEligibility('intruder-999', orderItem, defaultConfig, new Date());
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(OwnershipError);
      expect((caughtError as OwnershipError).message).toContain('item-001');
      expect((caughtError as OwnershipError).message).toContain('intruder-999');
    });

    it('does NOT throw when customerId matches the order item owner', () => {
      const orderItem = makeOrderItem({ customerId: 'customer-abc' });
      const deliveryDate = orderItem.deliveryDate;
      // still within window
      const now = new Date(deliveryDate.getTime() + 1 * MS_PER_DAY);

      expect(() =>
        service.checkEligibility('customer-abc', orderItem, defaultConfig, now),
      ).not.toThrow();
    });
  });

  describe('Boundary conditions', () => {
    it('is eligible at the very start of the last day (1ms remaining)', () => {
      const deliveryDate = new Date('2024-01-01T00:00:00Z');
      const orderItem = makeOrderItem({ deliveryDate });
      // Policy expires at deliveryDate + 10 days exactly
      // 1ms before expiry → still eligible
      const expiryMs = deliveryDate.getTime() + defaultConfig.returnWindowDays * MS_PER_DAY;
      const now = new Date(expiryMs - 1);

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(true);
      // Math.ceil(1ms / MS_PER_DAY) = Math.ceil(tiny positive) = 1
      // The last partial day still counts as 1 day remaining.
      expect(result.daysRemaining).toBe(1);
    });

    it('is ineligible exactly at the expiry instant (msRemaining=0)', () => {
      const deliveryDate = new Date('2024-01-01T00:00:00Z');
      const orderItem = makeOrderItem({ deliveryDate });
      // now === expiry moment exactly
      const expiryMs = deliveryDate.getTime() + defaultConfig.returnWindowDays * MS_PER_DAY;
      const now = new Date(expiryMs);

      const result = service.checkEligibility('customer-abc', orderItem, defaultConfig, now);

      expect(result.eligible).toBe(false);
      expect(result.daysRemaining).toBeNull();
      expect(result.policyExpirationDate).not.toBeNull();
    });

    it('calculates policyExpirationDate correctly for a configurable window', () => {
      const deliveryDate = new Date('2024-03-01T00:00:00Z');
      const orderItem = makeOrderItem({ deliveryDate });
      const config30Days: EligibilityConfig = { returnWindowDays: 30 };
      const now = new Date('2024-03-10T00:00:00Z'); // still in window

      const result = service.checkEligibility('customer-abc', orderItem, config30Days, now);

      expect(result.eligible).toBe(true);
      // 30 days from 2024-03-01 = 2024-03-31
      expect(result.daysRemaining).toBe(21); // 31 - 10 = 21 days remaining
    });
  });
});
