import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCartRepository } from './InMemoryCartRepository.js';
import { Cart } from '../../domain/cart/Cart.js';
import type { CartItem } from '../../domain/cart/CartItem.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    variantId: 'variant-001',
    productId: 'product-001',
    productName: 'Test Product',
    productImage: 'https://example.com/image.jpg',
    unitPrice: 29.99,
    condition: 'New',
    quantity: 1,
    ...overrides,
  };
}

function makeCart(customerId: string, items: CartItem[] = []): Cart {
  return new Cart({
    id: `cart-${customerId}`,
    customerId,
    items,
    saveForLater: [],
    updatedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryCartRepository', () => {
  let repo: InMemoryCartRepository;

  beforeEach(() => {
    repo = new InMemoryCartRepository();
  });

  it('findByCustomerId returns null for an unknown customer', async () => {
    const result = await repo.findByCustomerId('unknown-customer');
    expect(result).toBeNull();
  });

  it('save then findByCustomerId returns the stored cart', async () => {
    const cart = makeCart('customer-001', [makeCartItem()]);
    await repo.save(cart);

    const found = await repo.findByCustomerId('customer-001');
    expect(found).toEqual(cart);
  });

  it('saving a cart for the same customer overwrites the previous one', async () => {
    const cart1 = makeCart('customer-001', [makeCartItem({ unitPrice: 10 })]);
    await repo.save(cart1);

    const cart2 = makeCart('customer-001', [makeCartItem({ unitPrice: 50 })]);
    await repo.save(cart2);

    const found = await repo.findByCustomerId('customer-001');
    expect(found).toEqual(cart2);
    expect(found!.items[0].unitPrice).toBe(50);
  });

  it('stores carts independently per customer', async () => {
    const cart1 = makeCart('customer-001', [makeCartItem({ variantId: 'v1' })]);
    const cart2 = makeCart('customer-002', [makeCartItem({ variantId: 'v2' })]);
    await repo.save(cart1);
    await repo.save(cart2);

    const found1 = await repo.findByCustomerId('customer-001');
    const found2 = await repo.findByCustomerId('customer-002');
    expect(found1!.items[0].variantId).toBe('v1');
    expect(found2!.items[0].variantId).toBe('v2');
  });

  it('accepts initial carts via constructor', async () => {
    const cart = makeCart('customer-seed', [makeCartItem()]);
    const seededRepo = new InMemoryCartRepository([cart]);

    const found = await seededRepo.findByCustomerId('customer-seed');
    expect(found).toEqual(cart);
  });
});
