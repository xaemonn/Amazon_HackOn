/**
 * IdentityService unit tests.
 *
 * Covers:
 * - sendOtp: contact validation, existing vs new customer detection, OTP record shape
 * - verifyOtp (new customer): creates Customer with empty book + defaultAllEnabled() prefs
 * - verifyOtp (existing customer): returns existing customerId, no new Customer created
 * - verifyOtp (error cases): OtpExpiredError, OtpInvalidError, OtpLockedError
 * - authenticate: valid token, unknown token, expired session, missing customer
 * - verifyOwnership: ownership correctness property (Req 2, 11)
 * - getOrderItem: projection mapping (unitPrice → price, currency = 'INR')
 * - getOrderItemsByCustomer: isolation — customer A's items never appear in customer B
 *
 * Requirements: 2 (correctness properties), 11 (correctness properties)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityService } from './IdentityService.js';
import { InMemoryCustomerRepository } from '../../infrastructure/persistence/InMemoryCustomerRepository.js';
import { InMemoryOrderRepository } from '../../infrastructure/persistence/InMemoryOrderRepository.js';
import { InMemoryOtpStore } from '../../infrastructure/persistence/InMemoryOtpStore.js';
import { defaultAllEnabled } from '../../domain/account/NotificationPreferences.js';
import { OtpExpiredError, OtpInvalidError, OtpLockedError } from '../../domain/identity/errors.js';
import type { AppConfig } from '../../infrastructure/config/index.js';
import { DEFAULT_CONFIG } from '../../infrastructure/config/index.js';
import type { Customer } from '../../domain/account/Customer.js';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { OtpRecord } from '../../domain/identity/OtpRecord.js';
import type { Session } from '../../domain/identity/Session.js';

// ─── Test Config ─────────────────────────────────────────────────────────────

const TEST_CONFIG: AppConfig = {
  ...DEFAULT_CONFIG,
  otp: {
    validityMinutes: 10,
    maxAttempts: 3,
    lockoutMinutes: 15,
  },
};

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createTestCustomer(overrides?: Partial<Customer>): Customer {
  return {
    id: 'cust-001',
    name: 'Alice',
    email: 'alice@example.com',
    addresses: [],
    paymentMethods: [],
    notificationPreferences: defaultAllEnabled(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createTestOrderItem(overrides?: Partial<OrderItem>): OrderItem {
  return {
    id: 'item-001',
    orderId: 'order-001',
    customerId: 'cust-001',
    productId: 'prod-001',
    variantId: 'var-001',
    productName: 'Test Widget',
    productImage: 'https://example.com/widget.jpg',
    unitPrice: 999,
    quantity: 1,
    deliveryDate: new Date('2024-06-01'),
    deliveryStatus: 'delivered',
    refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
    ...overrides,
  };
}

function createTestOrder(customerId: string, items: OrderItem[]): Order {
  return {
    id: items[0]?.orderId ?? 'order-001',
    customerId,
    placedDate: new Date('2024-05-01'),
    status: 'delivered',
    paymentType: 'prepaid',
    items,
  };
}

// Helper: extract the OTP code saved by sendOtp so we can verify with it
async function getSavedOtpCode(otpStore: InMemoryOtpStore, contact: string): Promise<string> {
  const record = await otpStore.findOtp(contact);
  if (!record) throw new Error(`No OTP record found for contact: ${contact}`);
  return record.code;
}

// Helper: directly inject an OTP record into the store for time-sensitive tests
async function injectOtpRecord(otpStore: InMemoryOtpStore, record: OtpRecord): Promise<void> {
  await otpStore.saveOtp(record);
}

// Helper: directly inject a session into the store for time-sensitive tests
async function injectSession(otpStore: InMemoryOtpStore, session: Session): Promise<void> {
  await otpStore.saveSession(session);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IdentityService', () => {
  let customerRepo: InMemoryCustomerRepository;
  let orderRepo: InMemoryOrderRepository;
  let otpStore: InMemoryOtpStore;
  let service: IdentityService;

  beforeEach(() => {
    customerRepo = new InMemoryCustomerRepository();
    orderRepo = new InMemoryOrderRepository();
    otpStore = new InMemoryOtpStore();
    service = new IdentityService(customerRepo, orderRepo, otpStore, TEST_CONFIG);
  });

  // ─── sendOtp ───────────────────────────────────────────────────────────────

  describe('sendOtp', () => {
    it('should reject invalid email format', async () => {
      await expect(service.sendOtp('not-an-email')).rejects.toThrow('Invalid contact format');
    });

    it('should reject invalid phone format', async () => {
      await expect(service.sendOtp('08001234567')).rejects.toThrow('Invalid contact format');
    });

    it('should accept a valid E.164 phone number', async () => {
      await expect(service.sendOtp('+919876543210')).resolves.toMatchObject({ otpSent: true });
    });

    it('should return isExistingCustomer: false for new contact', async () => {
      const result = await service.sendOtp('newuser@example.com');
      expect(result).toEqual({ otpSent: true, isExistingCustomer: false });
    });

    it('should return isExistingCustomer: true for existing contact', async () => {
      const customer = createTestCustomer({ email: 'existing@example.com' });
      await customerRepo.save(customer);

      const result = await service.sendOtp('existing@example.com');
      expect(result).toEqual({ otpSent: true, isExistingCustomer: true });
    });

    it('should save OTP record with correct expiry and attempt count', async () => {
      const before = Date.now();
      await service.sendOtp('alice@example.com');
      const after = Date.now();

      const record = await otpStore.findOtp('alice@example.com');
      expect(record).not.toBeNull();
      expect(record!.attemptsRemaining).toBe(TEST_CONFIG.otp.maxAttempts);
      expect(record!.lockedUntil).toBeNull();

      const expectedMinMs = before + TEST_CONFIG.otp.validityMinutes * 60_000;
      const expectedMaxMs = after + TEST_CONFIG.otp.validityMinutes * 60_000;
      expect(record!.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
      expect(record!.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);
    });

    it('should set customerId on OTP record for existing customer', async () => {
      const customer = createTestCustomer({ id: 'cust-existing', email: 'existing@example.com' });
      await customerRepo.save(customer);

      await service.sendOtp('existing@example.com');

      const record = await otpStore.findOtp('existing@example.com');
      expect(record!.customerId).toBe('cust-existing');
    });

    it('should set customerId to null on OTP record for new contact', async () => {
      await service.sendOtp('brand-new@example.com');

      const record = await otpStore.findOtp('brand-new@example.com');
      expect(record!.customerId).toBeNull();
    });
  });

  // ─── verifyOtp — new customer flow ────────────────────────────────────────

  describe('verifyOtp — new customer flow', () => {
    const CONTACT = 'newcustomer@example.com';

    beforeEach(async () => {
      await service.sendOtp(CONTACT);
    });

    it('should create a Customer with empty address book and defaultAllEnabled prefs', async () => {
      const code = await getSavedOtpCode(otpStore, CONTACT);
      const { customerId } = await service.verifyOtp(CONTACT, code);

      const customer = await customerRepo.findById(customerId);
      expect(customer).not.toBeNull();
      expect(customer!.email).toBe(CONTACT);
      expect(customer!.name).toBe('');
      expect(customer!.addresses).toEqual([]);
      expect(customer!.paymentMethods).toEqual([]);
      expect(customer!.notificationPreferences).toEqual(defaultAllEnabled());
    });

    it('should return a session token and customerId', async () => {
      const code = await getSavedOtpCode(otpStore, CONTACT);
      const result = await service.verifyOtp(CONTACT, code);

      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');
      expect(result.customerId).toBeTruthy();
      expect(typeof result.customerId).toBe('string');
    });

    it('should delete the OTP record after successful verification', async () => {
      const code = await getSavedOtpCode(otpStore, CONTACT);
      await service.verifyOtp(CONTACT, code);

      // The OTP store lazily deletes expired records; since we deleted it explicitly,
      // injecting a fresh record proves the delete happened. Here we just confirm
      // findOtp returns null (the deleteOtp was called).
      const record = await otpStore.findOtp(CONTACT);
      expect(record).toBeNull();
    });

    it('should save a session with 30-day TTL', async () => {
      const before = Date.now();
      const code = await getSavedOtpCode(otpStore, CONTACT);
      const { token } = await service.verifyOtp(CONTACT, code);
      const after = Date.now();

      const session = await otpStore.findSession(token);
      expect(session).not.toBeNull();

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(session!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs);
      expect(session!.expiresAt.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs);
    });
  });

  // ─── verifyOtp — existing customer flow ───────────────────────────────────

  describe('verifyOtp — existing customer flow', () => {
    const CONTACT = 'existing@example.com';
    const EXISTING_CUSTOMER = createTestCustomer({ id: 'cust-existing', email: CONTACT });

    beforeEach(async () => {
      await customerRepo.save(EXISTING_CUSTOMER);
      await service.sendOtp(CONTACT);
    });

    it('should return the existing customer id, not create a new one', async () => {
      const code = await getSavedOtpCode(otpStore, CONTACT);
      const { customerId } = await service.verifyOtp(CONTACT, code);

      expect(customerId).toBe('cust-existing');
    });

    it('should NOT call customerRepo.save for existing customer', async () => {
      const code = await getSavedOtpCode(otpStore, CONTACT);
      await service.verifyOtp(CONTACT, code);

      // Only the original seeded customer should be in the repo
      const byId = await customerRepo.findById('cust-existing');
      expect(byId).not.toBeNull();

      // No spurious second customer created for the same email
      const byContact = await customerRepo.findByContact(CONTACT);
      expect(byContact!.id).toBe('cust-existing');
    });
  });

  // ─── verifyOtp — error cases ───────────────────────────────────────────────

  describe('verifyOtp — error cases', () => {
    const CONTACT = 'user@example.com';

    it('should throw OtpExpiredError when no OTP record exists', async () => {
      await expect(service.verifyOtp(CONTACT, '123456')).rejects.toBeInstanceOf(OtpExpiredError);
    });

    it('should throw OtpExpiredError when OTP record is expired', async () => {
      // Inject a record with expiresAt in the past
      // Note: InMemoryOtpStore lazily deletes expired records on findOtp,
      // so we bypass it and inject directly using saveOtp to get an expired record.
      // We need to inject the record AND have findOtp see it as expired.
      // Since InMemoryOtpStore.findOtp checks expiresAt < new Date() and returns null,
      // calling verifyOtp with no record will also throw OtpExpiredError — which is correct.
      // Let's verify this behavior end-to-end via the service:
      await injectOtpRecord(otpStore, {
        contact: CONTACT,
        code: '999999',
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
        attemptsRemaining: 3,
        customerId: null,
        lockedUntil: null,
      });

      await expect(service.verifyOtp(CONTACT, '999999')).rejects.toBeInstanceOf(OtpExpiredError);
    });

    it('should throw OtpInvalidError on wrong code with attempts remaining', async () => {
      await service.sendOtp(CONTACT);
      await expect(service.verifyOtp(CONTACT, '000000')).rejects.toBeInstanceOf(OtpInvalidError);
    });

    it('should decrement attemptsRemaining on wrong code', async () => {
      await service.sendOtp(CONTACT);
      const initialRecord = await otpStore.findOtp(CONTACT);
      const initialAttempts = initialRecord!.attemptsRemaining;

      await expect(service.verifyOtp(CONTACT, '000000')).rejects.toBeInstanceOf(OtpInvalidError);

      const updatedRecord = await otpStore.findOtp(CONTACT);
      expect(updatedRecord!.attemptsRemaining).toBe(initialAttempts - 1);
    });

    it('should throw OtpLockedError when last attempt is exhausted', async () => {
      // Inject an OTP with attemptsRemaining = 1 so the next wrong attempt locks it
      await injectOtpRecord(otpStore, {
        contact: CONTACT,
        code: '123456',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        attemptsRemaining: 1,
        customerId: null,
        lockedUntil: null,
      });

      await expect(service.verifyOtp(CONTACT, '000000')).rejects.toBeInstanceOf(OtpLockedError);
    });

    it('should throw OtpLockedError when account is already locked', async () => {
      // Inject a record with a future lockedUntil
      await injectOtpRecord(otpStore, {
        contact: CONTACT,
        code: '123456',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        attemptsRemaining: 0,
        customerId: null,
        lockedUntil: new Date(Date.now() + 15 * 60_000),
      });

      await expect(service.verifyOtp(CONTACT, '123456')).rejects.toBeInstanceOf(OtpLockedError);
    });

    it('should include retryAfterMs in OtpLockedError', async () => {
      // Inject a record with 1 attempt remaining so the next wrong code triggers lockout
      await injectOtpRecord(otpStore, {
        contact: CONTACT,
        code: '123456',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        attemptsRemaining: 1,
        customerId: null,
        lockedUntil: null,
      });

      const error = await service.verifyOtp(CONTACT, '000000').catch((e) => e);
      expect(error).toBeInstanceOf(OtpLockedError);
      expect((error as OtpLockedError).retryAfterMs).toBe(TEST_CONFIG.otp.lockoutMinutes * 60_000);
    });

    it('should throw OtpInvalidError twice then OtpLockedError on third failure (3-attempt flow)', async () => {
      await service.sendOtp(CONTACT);

      // Attempt 1 — fails with OtpInvalidError (2 remaining)
      await expect(service.verifyOtp(CONTACT, '000000')).rejects.toBeInstanceOf(OtpInvalidError);
      // Attempt 2 — fails with OtpInvalidError (1 remaining)
      await expect(service.verifyOtp(CONTACT, '000000')).rejects.toBeInstanceOf(OtpInvalidError);
      // Attempt 3 — exhausts remaining, should lock
      await expect(service.verifyOtp(CONTACT, '000000')).rejects.toBeInstanceOf(OtpLockedError);
    });
  });

  // ─── authenticate ─────────────────────────────────────────────────────────

  describe('authenticate', () => {
    const CONTACT = 'auth-user@example.com';

    it('should return customer projection for valid token', async () => {
      const customer = createTestCustomer({ id: 'cust-auth', email: CONTACT, name: 'Auth User' });
      await customerRepo.save(customer);
      await service.sendOtp(CONTACT);
      const code = await getSavedOtpCode(otpStore, CONTACT);
      const { token } = await service.verifyOtp(CONTACT, code);

      const result = await service.authenticate(token);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('cust-auth');
      expect(result!.name).toBe('Auth User');
      expect(result!.email).toBe(CONTACT);
    });

    it('should return null for unknown token', async () => {
      const result = await service.authenticate('nonexistent-token-xyz');
      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      const customer = createTestCustomer({ id: 'cust-expired', email: 'expired@example.com' });
      await customerRepo.save(customer);

      // Inject an expired session directly
      const expiredToken = 'expired-token-123';
      await injectSession(otpStore, {
        token: expiredToken,
        customerId: 'cust-expired',
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      });

      const result = await service.authenticate(expiredToken);
      expect(result).toBeNull();
    });

    it('should return null when customer not found in repo', async () => {
      // Inject a valid session pointing to a non-existent customer
      const token = 'orphan-session-token';
      await injectSession(otpStore, {
        token,
        customerId: 'cust-ghost',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const result = await service.authenticate(token);
      expect(result).toBeNull();
    });
  });

  // ─── verifyOwnership ──────────────────────────────────────────────────────

  describe('verifyOwnership', () => {
    const CUSTOMER_A = 'cust-a';
    const CUSTOMER_B = 'cust-b';
    const ITEM_A = 'item-a';
    const ITEM_B = 'item-b';

    beforeEach(async () => {
      const itemA = createTestOrderItem({ id: ITEM_A, orderId: 'order-a', customerId: CUSTOMER_A });
      const itemB = createTestOrderItem({ id: ITEM_B, orderId: 'order-b', customerId: CUSTOMER_B });
      const orderA = createTestOrder(CUSTOMER_A, [itemA]);
      const orderB = createTestOrder(CUSTOMER_B, [itemB]);
      await orderRepo.save({ ...orderA, id: 'order-a' });
      await orderRepo.save({ ...orderB, id: 'order-b' });
    });

    it('should return true when item belongs to customer', async () => {
      const result = await service.verifyOwnership(CUSTOMER_A, ITEM_A);
      expect(result).toBe(true);
    });

    it('should return false when item belongs to different customer', async () => {
      const result = await service.verifyOwnership(CUSTOMER_A, ITEM_B);
      expect(result).toBe(false);
    });

    it('should return false for unknown orderItemId', async () => {
      const result = await service.verifyOwnership(CUSTOMER_A, 'nonexistent-item');
      expect(result).toBe(false);
    });

    /**
     * Correctness property: verifyOwnership(c, i) === (getOrderItem(i)?.customerId === c)
     *
     * Validates: Requirements 2, 11
     *
     * This checks that verifyOwnership is always consistent with the customerId
     * on the projected order item, for both matching and mismatching customer IDs.
     */
    it('correctness property: result equals (getOrderItem(i)?.customerId === c)', async () => {
      const testCases: Array<{ customerId: string; itemId: string }> = [
        { customerId: CUSTOMER_A, itemId: ITEM_A },   // owns it
        { customerId: CUSTOMER_B, itemId: ITEM_B },   // owns it
        { customerId: CUSTOMER_A, itemId: ITEM_B },   // does not own it
        { customerId: CUSTOMER_B, itemId: ITEM_A },   // does not own it
        { customerId: 'unknown-cust', itemId: ITEM_A }, // unknown customer
        { customerId: CUSTOMER_A, itemId: 'unknown-item' }, // unknown item
      ];

      for (const { customerId, itemId } of testCases) {
        const ownershipResult = await service.verifyOwnership(customerId, itemId);
        const orderItem = await service.getOrderItem(itemId);
        const expected = orderItem?.customerId === customerId;
        expect(ownershipResult).toBe(expected);
      }
    });
  });

  // ─── getOrderItem ─────────────────────────────────────────────────────────

  describe('getOrderItem', () => {
    const ITEM_ID = 'item-proj-001';

    beforeEach(async () => {
      const item = createTestOrderItem({
        id: ITEM_ID,
        orderId: 'order-proj-001',
        customerId: 'cust-proj',
        productId: 'prod-xyz',
        productName: 'Super Widget',
        productImage: 'https://cdn.example.com/widget.jpg',
        unitPrice: 1299,
        deliveryDate: new Date('2024-07-15'),
      });
      const order = createTestOrder('cust-proj', [item]);
      await orderRepo.save({ ...order, id: 'order-proj-001' });
    });

    it('should return IAuthService projection with unitPrice mapped to price', async () => {
      const result = await service.getOrderItem(ITEM_ID);
      expect(result).not.toBeNull();
      expect(result!.price).toBe(1299);
    });

    it('should set currency to INR', async () => {
      const result = await service.getOrderItem(ITEM_ID);
      expect(result!.currency).toBe('INR');
    });

    it('should map all fields correctly', async () => {
      const result = await service.getOrderItem(ITEM_ID);
      expect(result).toMatchObject({
        id: ITEM_ID,
        orderId: 'order-proj-001',
        productId: 'prod-xyz',
        customerId: 'cust-proj',
        productName: 'Super Widget',
        productImage: 'https://cdn.example.com/widget.jpg',
        price: 1299,
        currency: 'INR',
      });
      expect(result!.deliveryDate).toEqual(new Date('2024-07-15'));
    });

    it('should return null for unknown orderItemId', async () => {
      const result = await service.getOrderItem('does-not-exist');
      expect(result).toBeNull();
    });
  });

  // ─── getOrderItemsByCustomer ───────────────────────────────────────────────

  describe('getOrderItemsByCustomer', () => {
    const CUSTOMER_A = 'cust-a-orders';
    const CUSTOMER_B = 'cust-b-orders';

    beforeEach(async () => {
      const itemA1 = createTestOrderItem({ id: 'a-item-1', orderId: 'a-order-1', customerId: CUSTOMER_A, productName: 'A Product 1' });
      const itemA2 = createTestOrderItem({ id: 'a-item-2', orderId: 'a-order-2', customerId: CUSTOMER_A, productName: 'A Product 2' });
      const itemB1 = createTestOrderItem({ id: 'b-item-1', orderId: 'b-order-1', customerId: CUSTOMER_B, productName: 'B Product 1' });

      await orderRepo.save(createTestOrder(CUSTOMER_A, [itemA1]));
      await orderRepo.save({ ...createTestOrder(CUSTOMER_A, [itemA2]), id: 'a-order-2' });
      await orderRepo.save({ ...createTestOrder(CUSTOMER_B, [itemB1]), id: 'b-order-1' });
    });

    it('should return all items for the customer', async () => {
      const results = await service.getOrderItemsByCustomer(CUSTOMER_A);
      const ids = results.map((i) => i.id);
      expect(ids).toContain('a-item-1');
      expect(ids).toContain('a-item-2');
      expect(results).toHaveLength(2);
    });

    it('should not include items belonging to other customers', async () => {
      const results = await service.getOrderItemsByCustomer(CUSTOMER_A);
      const ids = results.map((i) => i.id);
      expect(ids).not.toContain('b-item-1');
    });

    /**
     * Isolation property: items for customer A never appear in customer B's result.
     *
     * Validates: Requirements 2, 11
     *
     * Checks across all items that the result sets for A and B are disjoint.
     */
    it('isolation: items for customer A never appear in customer B results', async () => {
      const resultsA = await service.getOrderItemsByCustomer(CUSTOMER_A);
      const resultsB = await service.getOrderItemsByCustomer(CUSTOMER_B);

      const idsA = new Set(resultsA.map((i) => i.id));
      const idsB = new Set(resultsB.map((i) => i.id));

      // The intersection must be empty
      for (const id of idsA) {
        expect(idsB.has(id)).toBe(false);
      }

      // All items returned for A belong to A
      for (const item of resultsA) {
        expect(item.customerId).toBe(CUSTOMER_A);
      }

      // All items returned for B belong to B
      for (const item of resultsB) {
        expect(item.customerId).toBe(CUSTOMER_B);
      }
    });

    it('should return empty array when customer has no orders', async () => {
      const results = await service.getOrderItemsByCustomer('cust-nobody');
      expect(results).toEqual([]);
    });

    it('should project currency as INR for all items', async () => {
      const results = await service.getOrderItemsByCustomer(CUSTOMER_A);
      for (const item of results) {
        expect(item.currency).toBe('INR');
      }
    });
  });
});
