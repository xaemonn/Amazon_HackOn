import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCustomerRepository } from './InMemoryCustomerRepository.js';
import type { Customer } from '../../domain/account/Customer.js';
import { defaultAllEnabled } from '../../domain/account/NotificationPreferences.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const now = new Date();
  return {
    id: 'customer-001',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    addresses: [],
    paymentMethods: [],
    notificationPreferences: defaultAllEnabled(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryCustomerRepository', () => {
  let repo: InMemoryCustomerRepository;

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
  });

  // --- Round-trip save / findById -------------------------------------------

  it('save then findById returns the saved customer', async () => {
    const customer = makeCustomer();
    await repo.save(customer);
    const found = await repo.findById(customer.id);
    expect(found).toEqual(customer);
  });

  it('findById returns null for an unknown id', async () => {
    const result = await repo.findById('does-not-exist');
    expect(result).toBeNull();
  });

  // --- findByContact ---------------------------------------------------------

  it('findByContact returns customer matching the email', async () => {
    const customer = makeCustomer({ email: 'priya@example.com' });
    await repo.save(customer);
    const found = await repo.findByContact('priya@example.com');
    expect(found).toEqual(customer);
  });

  it('findByContact returns null for an unknown email', async () => {
    await repo.save(makeCustomer({ email: 'priya@example.com' }));
    const result = await repo.findByContact('unknown@example.com');
    expect(result).toBeNull();
  });

  // --- Upsert semantics ------------------------------------------------------

  it('saving the same id twice keeps only the latest version', async () => {
    const original = makeCustomer({ name: 'Priya Sharma' });
    await repo.save(original);

    const updated = { ...original, name: 'Priya Updated', updatedAt: new Date() };
    await repo.save(updated);

    const found = await repo.findById(original.id);
    expect(found?.name).toBe('Priya Updated');
  });

  // --- Customer isolation ----------------------------------------------------

  it('findById with wrong id returns null even when repo has customers', async () => {
    await repo.save(makeCustomer({ id: 'customer-001' }));
    const result = await repo.findById('customer-002');
    expect(result).toBeNull();
  });

  it('findByContact with wrong email returns null even when repo has customers', async () => {
    await repo.save(makeCustomer({ email: 'priya@example.com' }));
    const result = await repo.findByContact('other@example.com');
    expect(result).toBeNull();
  });

  // --- Constructor seeding ---------------------------------------------------

  it('accepts initial customers via constructor', async () => {
    const c1 = makeCustomer({ id: 'c1', email: 'c1@example.com' });
    const c2 = makeCustomer({ id: 'c2', email: 'c2@example.com' });
    const seededRepo = new InMemoryCustomerRepository([c1, c2]);

    expect(await seededRepo.findById('c1')).toEqual(c1);
    expect(await seededRepo.findById('c2')).toEqual(c2);
    expect(await seededRepo.findByContact('c1@example.com')).toEqual(c1);
  });
});
