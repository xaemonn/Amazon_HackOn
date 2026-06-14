/**
 * AccountService unit tests.
 *
 * Covers:
 * - updateProfile: valid name persists; empty name throws; whitespace-only name throws
 * - addAddress: all fields valid → added; any field missing → AddressValidationError with correct field names;
 *               pincode non-6-digit → error
 * - removeAddress (non-default): default unchanged
 * - removeAddress (default, others remain): next most-recent becomes default
 * - removeAddress (last address): empty book, no default
 * - setDefaultAddress: only one default at a time
 * - addPaymentMethod: UPI duplicate rejected; card masked (no full number); cap at 10
 * - removePaymentMethod: removes correctly; throws PaymentMethodNotFoundError for unknown methodId
 * - updateNotificationPreferences: partial update merges, does not overwrite unmentioned prefs
 *
 * Requirements: 3, 4, 5, 6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AccountService } from './AccountService.js';
import { InMemoryCustomerRepository } from '../../infrastructure/persistence/InMemoryCustomerRepository.js';
import { defaultAllEnabled } from '../../domain/account/NotificationPreferences.js';
import {
  AddressValidationError,
  CustomerNotFoundError,
  AddressNotFoundError,
  DuplicatePaymentMethodError,
  PaymentMethodCapExceededError,
  PaymentMethodNotFoundError,
} from '../../domain/account/errors.js';
import type { Customer } from '../../domain/account/Customer.js';
import type { Address } from '../../domain/account/Address.js';
import type { AddAddressFields } from './AccountService.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeCustomer(overrides?: Partial<Customer>): Customer {
  return {
    id: 'cust-test',
    name: 'Test User',
    email: 'test@example.com',
    addresses: [],
    paymentMethods: [],
    notificationPreferences: defaultAllEnabled(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/** Build a valid AddAddressFields object with optional overrides. */
function validAddressFields(overrides?: Partial<AddAddressFields>): AddAddressFields {
  return {
    recipientName: 'Jane Doe',
    streetLine1: '42 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    country: 'India',
    ...overrides,
  };
}

/** Build a pre-seeded Address to insert directly into a customer's address book. */
function makeAddress(overrides?: Partial<Address>): Address {
  return {
    id: 'addr-1',
    recipientName: 'Jane Doe',
    streetLine1: '42 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    country: 'India',
    isDefault: true,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AccountService', () => {
  let repo: InMemoryCustomerRepository;
  let service: AccountService;
  const CUSTOMER_ID = 'cust-test';

  beforeEach(() => {
    repo = new InMemoryCustomerRepository([makeCustomer()]);
    service = new AccountService(repo);
  });

  // ── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('persists a valid name and returns the updated customer', async () => {
      const result = await service.updateProfile(CUSTOMER_ID, { name: 'Alice Smith' });

      expect(result.name).toBe('Alice Smith');

      // Round-trip: getCustomer should reflect the persisted value
      const fetched = await service.getCustomer(CUSTOMER_ID);
      expect(fetched!.name).toBe('Alice Smith');
    });

    it('trims whitespace from a valid name', async () => {
      const result = await service.updateProfile(CUSTOMER_ID, { name: '  Bob  ' });
      expect(result.name).toBe('Bob');
    });

    it('throws AddressValidationError for an empty name', async () => {
      await expect(
        service.updateProfile(CUSTOMER_ID, { name: '' }),
      ).rejects.toBeInstanceOf(AddressValidationError);
    });

    it('throws AddressValidationError for a whitespace-only name', async () => {
      await expect(
        service.updateProfile(CUSTOMER_ID, { name: '   ' }),
      ).rejects.toBeInstanceOf(AddressValidationError);
    });

    it('throws CustomerNotFoundError for an unknown customer', async () => {
      await expect(
        service.updateProfile('nonexistent-id', { name: 'Alice' }),
      ).rejects.toBeInstanceOf(CustomerNotFoundError);
    });
  });

  // ── addAddress ─────────────────────────────────────────────────────────────

  describe('addAddress', () => {
    it('adds a valid address and includes it in the address book', async () => {
      const result = await service.addAddress(CUSTOMER_ID, validAddressFields());

      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].city).toBe('Bengaluru');
    });

    it('persists the address so getCustomer returns it', async () => {
      await service.addAddress(CUSTOMER_ID, validAddressFields());

      const fetched = await service.getCustomer(CUSTOMER_ID);
      expect(fetched!.addresses).toHaveLength(1);
    });

    it('auto-assigns an id to the new address', async () => {
      const result = await service.addAddress(CUSTOMER_ID, validAddressFields());
      expect(typeof result.addresses[0].id).toBe('string');
      expect(result.addresses[0].id.length).toBeGreaterThan(0);
    });

    it('does not set the new address as default when one already exists', async () => {
      // Add first address (will become default — first in empty book)
      const afterFirst = await service.addAddress(CUSTOMER_ID, validAddressFields());
      const defaultId = afterFirst.addresses.find((a) => a.isDefault)!.id;

      // Add second address — the original default should be preserved
      const afterSecond = await service.addAddress(
        CUSTOMER_ID,
        validAddressFields({ recipientName: 'Second Person', city: 'Mumbai' }),
      );

      const defaultAddresses = afterSecond.addresses.filter((a) => a.isDefault);
      expect(defaultAddresses).toHaveLength(1);
      expect(defaultAddresses[0].id).toBe(defaultId);
    });

    describe('validation — missing/empty required fields', () => {
      const REQUIRED_FIELDS = [
        'recipientName',
        'streetLine1',
        'city',
        'state',
        'pincode',
        'country',
      ] as const;

      for (const field of REQUIRED_FIELDS) {
        it(`throws AddressValidationError when ${field} is empty`, async () => {
          const fields = validAddressFields({ [field]: '' } as Partial<AddAddressFields>);
          const err = await service
            .addAddress(CUSTOMER_ID, fields)
            .catch((e) => e);

          expect(err).toBeInstanceOf(AddressValidationError);
          expect((err as AddressValidationError).invalidFields).toContain(field);
        });

        it(`throws AddressValidationError when ${field} is whitespace-only`, async () => {
          const fields = validAddressFields({ [field]: '   ' } as Partial<AddAddressFields>);
          const err = await service
            .addAddress(CUSTOMER_ID, fields)
            .catch((e) => e);

          expect(err).toBeInstanceOf(AddressValidationError);
          // pincode '   '.trim() fails the /^\d{6}$/ check, all others fail non-empty check
          expect((err as AddressValidationError).invalidFields).toContain(field);
        });
      }
    });

    describe('pincode validation', () => {
      it('throws AddressValidationError for a 5-digit pincode', async () => {
        const err = await service
          .addAddress(CUSTOMER_ID, validAddressFields({ pincode: '12345' }))
          .catch((e) => e);

        expect(err).toBeInstanceOf(AddressValidationError);
        expect((err as AddressValidationError).invalidFields).toContain('pincode');
      });

      it('throws AddressValidationError for a 7-digit pincode', async () => {
        const err = await service
          .addAddress(CUSTOMER_ID, validAddressFields({ pincode: '1234567' }))
          .catch((e) => e);

        expect(err).toBeInstanceOf(AddressValidationError);
        expect((err as AddressValidationError).invalidFields).toContain('pincode');
      });

      it('throws AddressValidationError for a non-numeric pincode', async () => {
        const err = await service
          .addAddress(CUSTOMER_ID, validAddressFields({ pincode: 'ABCDEF' }))
          .catch((e) => e);

        expect(err).toBeInstanceOf(AddressValidationError);
        expect((err as AddressValidationError).invalidFields).toContain('pincode');
      });

      it('accepts a valid 6-digit numeric pincode', async () => {
        await expect(
          service.addAddress(CUSTOMER_ID, validAddressFields({ pincode: '110001' })),
        ).resolves.toBeDefined();
      });
    });

    it('reports multiple invalid fields in a single error', async () => {
      const err = await service
        .addAddress(CUSTOMER_ID, validAddressFields({ recipientName: '', city: '' }))
        .catch((e) => e);

      expect(err).toBeInstanceOf(AddressValidationError);
      const { invalidFields } = err as AddressValidationError;
      expect(invalidFields).toContain('recipientName');
      expect(invalidFields).toContain('city');
    });
  });

  // ── removeAddress ──────────────────────────────────────────────────────────

  describe('removeAddress', () => {
    it('removes a non-default address and leaves the default unchanged', async () => {
      // Two addresses: addr-default (default) and addr-non-default
      const defaultAddr = makeAddress({ id: 'addr-default', isDefault: true, createdAt: new Date('2024-01-01') });
      const nonDefaultAddr = makeAddress({
        id: 'addr-non-default',
        isDefault: false,
        createdAt: new Date('2024-01-02'),
      });
      const customer = makeCustomer({ addresses: [defaultAddr, nonDefaultAddr] });
      await repo.save(customer);

      const result = await service.removeAddress(CUSTOMER_ID, 'addr-non-default');

      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].id).toBe('addr-default');
      expect(result.addresses[0].isDefault).toBe(true);
    });

    it('removes the default address and promotes the most recently added remaining address', async () => {
      const older = makeAddress({ id: 'addr-older', isDefault: false, createdAt: new Date('2024-01-01') });
      const newer = makeAddress({ id: 'addr-newer', isDefault: false, createdAt: new Date('2024-06-01') });
      const defaultAddr = makeAddress({ id: 'addr-default', isDefault: true, createdAt: new Date('2024-03-01') });
      const customer = makeCustomer({ addresses: [older, newer, defaultAddr] });
      await repo.save(customer);

      const result = await service.removeAddress(CUSTOMER_ID, 'addr-default');

      // addr-newer has the highest createdAt of the two remaining → should be promoted
      expect(result.addresses).toHaveLength(2);
      const newDefault = result.addresses.find((a) => a.isDefault);
      expect(newDefault).toBeDefined();
      expect(newDefault!.id).toBe('addr-newer');

      // addr-older must not be the default
      const olderEntry = result.addresses.find((a) => a.id === 'addr-older');
      expect(olderEntry!.isDefault).toBe(false);
    });

    it('leaves the book empty with no default when the last address is removed', async () => {
      const onlyAddr = makeAddress({ id: 'addr-only', isDefault: true });
      const customer = makeCustomer({ addresses: [onlyAddr] });
      await repo.save(customer);

      const result = await service.removeAddress(CUSTOMER_ID, 'addr-only');

      expect(result.addresses).toHaveLength(0);
    });

    it('persists removal so getCustomer reflects the updated book', async () => {
      const addr = makeAddress({ id: 'addr-remove', isDefault: true });
      await repo.save(makeCustomer({ addresses: [addr] }));

      await service.removeAddress(CUSTOMER_ID, 'addr-remove');

      const fetched = await service.getCustomer(CUSTOMER_ID);
      expect(fetched!.addresses).toHaveLength(0);
    });

    it('throws AddressNotFoundError for an unknown addressId', async () => {
      await expect(
        service.removeAddress(CUSTOMER_ID, 'addr-ghost'),
      ).rejects.toBeInstanceOf(AddressNotFoundError);
    });

    it('enforces the single-default invariant after any removal sequence', async () => {
      // Add 3 addresses, then remove them one by one; always 0 or 1 default
      await service.addAddress(CUSTOMER_ID, validAddressFields({ recipientName: 'A' }));
      await service.addAddress(CUSTOMER_ID, validAddressFields({ recipientName: 'B' }));
      await service.addAddress(CUSTOMER_ID, validAddressFields({ recipientName: 'C' }));

      let current = await service.getCustomer(CUSTOMER_ID);

      while (current!.addresses.length > 0) {
        const defaultCount = current!.addresses.filter((a) => a.isDefault).length;
        expect(defaultCount).toBeLessThanOrEqual(1);

        const toRemove = current!.addresses[0].id;
        current = await service.removeAddress(CUSTOMER_ID, toRemove);
      }

      // After removing all: empty book, no default
      expect(current!.addresses).toHaveLength(0);
    });
  });

  // ── setDefaultAddress ──────────────────────────────────────────────────────

  describe('setDefaultAddress', () => {
    it('marks the target address as default and clears any previous default', async () => {
      const addr1 = makeAddress({ id: 'addr-1', isDefault: true, createdAt: new Date('2024-01-01') });
      const addr2 = makeAddress({ id: 'addr-2', isDefault: false, createdAt: new Date('2024-02-01') });
      await repo.save(makeCustomer({ addresses: [addr1, addr2] }));

      const result = await service.setDefaultAddress(CUSTOMER_ID, 'addr-2');

      const defaultAddresses = result.addresses.filter((a) => a.isDefault);
      expect(defaultAddresses).toHaveLength(1);
      expect(defaultAddresses[0].id).toBe('addr-2');

      const addr1Entry = result.addresses.find((a) => a.id === 'addr-1');
      expect(addr1Entry!.isDefault).toBe(false);
    });

    it('is idempotent — setting the already-default address leaves exactly one default', async () => {
      const addr = makeAddress({ id: 'addr-solo', isDefault: true });
      await repo.save(makeCustomer({ addresses: [addr] }));

      const result = await service.setDefaultAddress(CUSTOMER_ID, 'addr-solo');

      const defaultAddresses = result.addresses.filter((a) => a.isDefault);
      expect(defaultAddresses).toHaveLength(1);
      expect(defaultAddresses[0].id).toBe('addr-solo');
    });

    it('ensures only one default across three addresses regardless of which is chosen', async () => {
      const a = makeAddress({ id: 'a', isDefault: true,  createdAt: new Date('2024-01-01') });
      const b = makeAddress({ id: 'b', isDefault: false, createdAt: new Date('2024-02-01') });
      const c = makeAddress({ id: 'c', isDefault: false, createdAt: new Date('2024-03-01') });
      await repo.save(makeCustomer({ addresses: [a, b, c] }));

      for (const targetId of ['a', 'b', 'c']) {
        const result = await service.setDefaultAddress(CUSTOMER_ID, targetId);
        const defaults = result.addresses.filter((x) => x.isDefault);
        expect(defaults).toHaveLength(1);
        expect(defaults[0].id).toBe(targetId);
      }
    });

    it('throws AddressNotFoundError for an unknown addressId', async () => {
      const addr = makeAddress({ id: 'addr-real', isDefault: true });
      await repo.save(makeCustomer({ addresses: [addr] }));

      await expect(
        service.setDefaultAddress(CUSTOMER_ID, 'addr-ghost'),
      ).rejects.toBeInstanceOf(AddressNotFoundError);
    });
  });

  // ── addPaymentMethod ───────────────────────────────────────────────────────

  describe('addPaymentMethod', () => {
    it('adds a UPI payment method and returns it in the list', async () => {
      const result = await service.addPaymentMethod(CUSTOMER_ID, {
        type: 'upi',
        upiId: 'alice@upi',
      });

      expect(result.paymentMethods).toHaveLength(1);
      expect(result.paymentMethods[0].type).toBe('upi');
    });

    it('rejects a duplicate UPI ID for the same customer', async () => {
      await service.addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: 'alice@upi' });

      await expect(
        service.addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: 'alice@upi' }),
      ).rejects.toBeInstanceOf(DuplicatePaymentMethodError);
    });

    it('throws DuplicatePaymentMethodError with the offending UPI ID', async () => {
      await service.addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: 'test@okaxis' });

      const err = await service
        .addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: 'test@okaxis' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(DuplicatePaymentMethodError);
      expect((err as DuplicatePaymentMethodError).upiId).toBe('test@okaxis');
    });

    it('adds a card method and stores only lastFour (no full card number field)', async () => {
      const result = await service.addPaymentMethod(CUSTOMER_ID, {
        type: 'card',
        lastFour: '4242',
        expiryMonth: 12,
        expiryYear: 2027,
        cardHolderName: 'Alice Smith',
      });

      expect(result.paymentMethods).toHaveLength(1);
      const card = result.paymentMethods[0] as { type: string; lastFour: string };
      expect(card.type).toBe('card');
      expect(card.lastFour).toBe('4242');

      // Ensure no full card number key exists on the stored method
      expect('cardNumber' in result.paymentMethods[0]).toBe(false);
      expect('fullNumber' in result.paymentMethods[0]).toBe(false);
      expect('number' in result.paymentMethods[0]).toBe(false);
    });

    it('adds a COD method', async () => {
      const result = await service.addPaymentMethod(CUSTOMER_ID, { type: 'cod' });
      expect(result.paymentMethods).toHaveLength(1);
      expect(result.paymentMethods[0].type).toBe('cod');
    });

    it('throws PaymentMethodCapExceededError when the 10-method cap is reached', async () => {
      // Add 10 UPI methods with different IDs
      for (let i = 0; i < 10; i++) {
        await service.addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: `user${i}@upi` });
      }

      await expect(
        service.addPaymentMethod(CUSTOMER_ID, { type: 'cod' }),
      ).rejects.toBeInstanceOf(PaymentMethodCapExceededError);
    });

    it('assigns a unique id to each payment method', async () => {
      const r1 = await service.addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: 'a@upi' });
      const r2 = await service.addPaymentMethod(CUSTOMER_ID, { type: 'cod' });

      const ids = r2.paymentMethods.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique
    });
  });

  // ── removePaymentMethod ────────────────────────────────────────────────────

  describe('removePaymentMethod', () => {
    it('removes the payment method and excludes it from the list', async () => {
      const afterAdd = await service.addPaymentMethod(CUSTOMER_ID, {
        type: 'upi',
        upiId: 'remove@upi',
      });
      const methodId = afterAdd.paymentMethods[0].id;

      const result = await service.removePaymentMethod(CUSTOMER_ID, methodId);

      expect(result.paymentMethods).toHaveLength(0);
    });

    it('only removes the specified method, leaving others intact', async () => {
      await service.addPaymentMethod(CUSTOMER_ID, { type: 'upi', upiId: 'keep@upi' });
      const afterSecond = await service.addPaymentMethod(CUSTOMER_ID, { type: 'cod' });

      const codId = afterSecond.paymentMethods.find((m) => m.type === 'cod')!.id;
      const result = await service.removePaymentMethod(CUSTOMER_ID, codId);

      expect(result.paymentMethods).toHaveLength(1);
      expect(result.paymentMethods[0].type).toBe('upi');
    });

    it('persists the removal so getPaymentMethods reflects the update', async () => {
      const afterAdd = await service.addPaymentMethod(CUSTOMER_ID, { type: 'cod' });
      const methodId = afterAdd.paymentMethods[0].id;

      await service.removePaymentMethod(CUSTOMER_ID, methodId);

      const methods = await service.getPaymentMethods(CUSTOMER_ID);
      expect(methods).toHaveLength(0);
    });

    /**
     * Req 5.2 edge case: throws PaymentMethodNotFoundError for unknown methodId
     * (maps to 404 in the API layer).
     *
     * Validates: Requirements 5
     */
    it('throws PaymentMethodNotFoundError for an unknown methodId', async () => {
      await expect(
        service.removePaymentMethod(CUSTOMER_ID, 'nonexistent-method-id'),
      ).rejects.toBeInstanceOf(PaymentMethodNotFoundError);
    });

    it('PaymentMethodNotFoundError carries customerId and methodId', async () => {
      const err = await service
        .removePaymentMethod(CUSTOMER_ID, 'ghost-id')
        .catch((e) => e);

      expect(err).toBeInstanceOf(PaymentMethodNotFoundError);
      expect((err as PaymentMethodNotFoundError).customerId).toBe(CUSTOMER_ID);
      expect((err as PaymentMethodNotFoundError).methodId).toBe('ghost-id');
    });
  });

  // ── updateNotificationPreferences ─────────────────────────────────────────

  describe('updateNotificationPreferences', () => {
    it('partial update merges with existing prefs and does not overwrite unmentioned ones', async () => {
      // All prefs start as enabled (defaultAllEnabled)
      const result = await service.updateNotificationPreferences(CUSTOMER_ID, {
        order_placed: { email: false },
      });

      // Changed: order_placed.email → false
      expect(result.notificationPreferences.order_placed.email).toBe(false);

      // Untouched channel on same event type: order_placed.sms must still be true
      expect(result.notificationPreferences.order_placed.sms).toBe(true);
      expect(result.notificationPreferences.order_placed.in_app).toBe(true);
      expect(result.notificationPreferences.order_placed.push).toBe(true);

      // Untouched event types must be unchanged
      expect(result.notificationPreferences.order_shipped.email).toBe(true);
      expect(result.notificationPreferences.order_delivered.email).toBe(true);
      expect(result.notificationPreferences.return_status_update.email).toBe(true);
      expect(result.notificationPreferences.refund_issued.email).toBe(true);
    });

    it('updates multiple channels across multiple event types in one call', async () => {
      const result = await service.updateNotificationPreferences(CUSTOMER_ID, {
        order_shipped: { sms: false, push: false },
        refund_issued: { email: false },
      });

      expect(result.notificationPreferences.order_shipped.sms).toBe(false);
      expect(result.notificationPreferences.order_shipped.push).toBe(false);
      expect(result.notificationPreferences.order_shipped.email).toBe(true); // untouched
      expect(result.notificationPreferences.refund_issued.email).toBe(false);
      expect(result.notificationPreferences.refund_issued.sms).toBe(true); // untouched
    });

    it('persists the merged prefs so getCustomer reflects the new state', async () => {
      await service.updateNotificationPreferences(CUSTOMER_ID, {
        order_delivered: { in_app: false },
      });

      const fetched = await service.getCustomer(CUSTOMER_ID);
      expect(fetched!.notificationPreferences.order_delivered.in_app).toBe(false);
    });

    it('sequential partial updates accumulate correctly', async () => {
      // First update: disable email for order_placed
      await service.updateNotificationPreferences(CUSTOMER_ID, {
        order_placed: { email: false },
      });

      // Second update: disable sms for order_placed, email for return_status_update
      await service.updateNotificationPreferences(CUSTOMER_ID, {
        order_placed: { sms: false },
        return_status_update: { email: false },
      });

      const fetched = await service.getCustomer(CUSTOMER_ID);
      expect(fetched!.notificationPreferences.order_placed.email).toBe(false); // from 1st update
      expect(fetched!.notificationPreferences.order_placed.sms).toBe(false);   // from 2nd update
      expect(fetched!.notificationPreferences.order_placed.in_app).toBe(true); // never touched
      expect(fetched!.notificationPreferences.return_status_update.email).toBe(false);
    });

    it('throws CustomerNotFoundError for an unknown customer', async () => {
      await expect(
        service.updateNotificationPreferences('ghost-id', {
          order_placed: { email: false },
        }),
      ).rejects.toBeInstanceOf(CustomerNotFoundError);
    });
  });
});
