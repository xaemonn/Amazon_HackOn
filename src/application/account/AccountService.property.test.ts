/**
 * Property-Based Tests: AccountService Address Book Invariants
 *
 * Tests three properties:
 *
 * A. **Single-default invariant** — after any sequence of addAddress / removeAddress /
 *    setDefaultAddress operations, the address book contains at most one default.
 *
 * B. **Add does not change default** — addAddress on a customer that already has a
 *    default address never changes which address is marked default.
 *
 * C. **Round-trip profile update** — updateProfile(id, { name: N }) followed by
 *    getCustomer(id) returns name === N.trim() for any valid non-empty name.
 *
 * **Validates: Requirements 4 (address-book invariants), 3 (profile update round-trip)**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { AccountService } from './AccountService.js';
import { InMemoryCustomerRepository } from '../../infrastructure/persistence/InMemoryCustomerRepository.js';
import { defaultAllEnabled } from '../../domain/account/NotificationPreferences.js';
import type { Customer } from '../../domain/account/Customer.js';
import type { Address } from '../../domain/account/Address.js';
import type { AddAddressFields } from './AccountService.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Builds a bare-minimum Customer with no addresses. */
function makeCustomer(id: string): Customer {
  return {
    id,
    name: 'Test User',
    email: `${id}@example.com`,
    addresses: [],
    paymentMethods: [],
    notificationPreferences: defaultAllEnabled(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

/** Builds a pre-constructed Address (already has id + isDefault). */
function makeAddress(overrides: Partial<Address> & { id: string }): Address {
  return {
    id: overrides.id,
    recipientName: overrides.recipientName ?? 'Jane Doe',
    streetLine1: overrides.streetLine1 ?? '1 Main Street',
    city: overrides.city ?? 'Mumbai',
    state: overrides.state ?? 'Maharashtra',
    pincode: overrides.pincode ?? '400001',
    country: overrides.country ?? 'India',
    isDefault: overrides.isDefault ?? false,
    createdAt: overrides.createdAt ?? new Date('2024-01-01'),
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Non-empty short string for text address fields (recipient, city, etc.).
 * Filtered to ensure the trimmed value is also non-empty (AccountService
 * rejects whitespace-only strings as invalid).
 */
const textFieldArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0);

/** Exactly-6-digit numeric pincode string. */
const pincodeArb = fc.nat({ max: 899999 }).map((n) => String(n + 100000));

/** Generates a valid AddAddressFields object. */
const addressFieldsArb: fc.Arbitrary<AddAddressFields> = fc.record({
  recipientName: textFieldArb,
  streetLine1: textFieldArb,
  city: textFieldArb,
  state: textFieldArb,
  pincode: pincodeArb,
  country: textFieldArb,
});

// ─── Property A: Single-default invariant ────────────────────────────────────

describe('AccountService — Property A: Single-default invariant', () => {
  /**
   * **Validates: Requirements 4**
   *
   * After every operation in an arbitrary sequence of addAddress / removeAddress /
   * setDefaultAddress, the number of addresses with isDefault === true is always ≤ 1.
   * (0 is allowed when the book is empty; 1 is the steady-state when addresses exist.)
   */
  it('addresses.filter(a => a.isDefault).length <= 1 after every operation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A sequence of operation codes: 0 = addAddress, 1 = removeAddress, 2 = setDefaultAddress
        fc.array(fc.nat({ max: 2 }), { minLength: 0, maxLength: 30 }),
        // A pool of address field objects to use for addAddress calls
        fc.array(addressFieldsArb, { minLength: 10, maxLength: 10 }),
        async (ops, addressPool) => {
          const CUSTOMER_ID = 'cust-pbt-a';
          const repo = new InMemoryCustomerRepository([makeCustomer(CUSTOMER_ID)]);
          const service = new AccountService(repo);

          // Track IDs currently in the address book so we can pick valid targets
          const currentIds: string[] = [];
          let poolIndex = 0;

          for (const op of ops) {
            if (op === 0) {
              // addAddress — always valid; cycle through the pool
              const fields = addressPool[poolIndex % addressPool.length];
              poolIndex++;
              const updated = await service.addAddress(CUSTOMER_ID, fields);
              // Record the newly added ID (it's the one not yet in currentIds)
              for (const addr of updated.addresses) {
                if (!currentIds.includes(addr.id)) {
                  currentIds.push(addr.id);
                }
              }
              const defaultCount = updated.addresses.filter((a) => a.isDefault).length;
              expect(defaultCount).toBeLessThanOrEqual(1);
            } else if (op === 1) {
              // removeAddress — only if the book is non-empty
              if (currentIds.length === 0) continue;
              const targetId = currentIds[0]; // always remove the oldest
              const updated = await service.removeAddress(CUSTOMER_ID, targetId);
              currentIds.splice(0, 1);
              const defaultCount = updated.addresses.filter((a) => a.isDefault).length;
              expect(defaultCount).toBeLessThanOrEqual(1);
            } else {
              // setDefaultAddress — only if the book is non-empty
              if (currentIds.length === 0) continue;
              // Pick a pseudo-random target using the pool index as a seed
              const targetId = currentIds[poolIndex % currentIds.length];
              const updated = await service.setDefaultAddress(CUSTOMER_ID, targetId);
              const defaultCount = updated.addresses.filter((a) => a.isDefault).length;
              expect(defaultCount).toBeLessThanOrEqual(1);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property B: Add does not change default ──────────────────────────────────

describe('AccountService — Property B: Add does not change default', () => {
  /**
   * **Validates: Requirements 4**
   *
   * For any customer that already has exactly one default address, calling
   * addAddress with a new valid address leaves the previously-defaulted address
   * still marked as default — addAddress must never silently steal the default flag.
   */
  it('addAddress does not change which address is the default', async () => {
    await fc.assert(
      fc.asyncProperty(
        addressFieldsArb, // fields for the new address being added
        async (newFields) => {
          const CUSTOMER_ID = 'cust-pbt-b';

          // Seed the customer with one address that has isDefault: true
          const existingAddr = makeAddress({
            id: 'addr-seed',
            isDefault: true,
            createdAt: new Date('2024-01-01'),
          });
          const customer = {
            ...makeCustomer(CUSTOMER_ID),
            addresses: [existingAddr],
          };

          const repo = new InMemoryCustomerRepository([customer]);
          const service = new AccountService(repo);

          const updated = await service.addAddress(CUSTOMER_ID, newFields);

          // The original default must still be marked as default
          const originalAddr = updated.addresses.find((a) => a.id === 'addr-seed');
          expect(originalAddr).toBeDefined();
          expect(originalAddr!.isDefault).toBe(true);

          // The single-default invariant must also hold
          const defaultCount = updated.addresses.filter((a) => a.isDefault).length;
          expect(defaultCount).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property C: Round-trip profile update ────────────────────────────────────

describe('AccountService — Property C: Round-trip profile update', () => {
  /**
   * **Validates: Requirements 3**
   *
   * For any valid non-empty name string N (1–100 chars, trimmed length ≥ 1),
   * calling updateProfile(id, { name: N }) followed by getCustomer(id) returns
   * a customer whose name === N.trim().
   */
  it('getCustomer(id).name === N.trim() after updateProfile(id, { name: N })', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Valid name: any string 1–100 chars whose trimmed form is non-empty
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        async (name) => {
          const CUSTOMER_ID = 'cust-pbt-c';
          const repo = new InMemoryCustomerRepository([makeCustomer(CUSTOMER_ID)]);
          const service = new AccountService(repo);

          await service.updateProfile(CUSTOMER_ID, { name });

          const fetched = await service.getCustomer(CUSTOMER_ID);
          expect(fetched).not.toBeNull();
          expect(fetched!.name).toBe(name.trim());
        },
      ),
      { numRuns: 200 },
    );
  });
});
