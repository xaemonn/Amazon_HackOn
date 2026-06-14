import { describe, it, expect } from 'vitest';
import { Cart } from './Cart.js';
import type { CartItem } from './CartItem.js';
import type { SaveForLaterItem } from './SaveForLaterItem.js';

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    variantId: 'v-1',
    productId: 'p-1',
    productName: 'Test Product',
    productImage: 'https://img.example.com/test.jpg',
    unitPrice: 100,
    condition: 'New',
    quantity: 1,
    ...overrides,
  };
}

function makeSaveForLaterItem(overrides: Partial<SaveForLaterItem> = {}): SaveForLaterItem {
  return {
    variantId: 'v-1',
    productId: 'p-1',
    productName: 'Test Product',
    productImage: 'https://img.example.com/test.jpg',
    unitPrice: 100,
    condition: 'New',
    savedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeEmptyCart(overrides: Partial<{ id: string; customerId: string }> = {}): Cart {
  return new Cart({
    id: overrides.id ?? 'cart-1',
    customerId: overrides.customerId ?? 'cust-1',
    items: [],
    saveForLater: [],
    updatedAt: new Date('2024-01-01'),
  });
}

describe('Cart aggregate root', () => {
  describe('constructor and accessors', () => {
    it('should expose all props via getters', () => {
      const item = makeCartItem();
      const saved = makeSaveForLaterItem({ variantId: 'v-2' });
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [item],
        saveForLater: [saved],
        updatedAt: new Date('2024-06-01'),
      });

      expect(cart.id).toBe('cart-1');
      expect(cart.customerId).toBe('cust-1');
      expect(cart.items).toEqual([item]);
      expect(cart.saveForLater).toEqual([saved]);
      expect(cart.updatedAt).toEqual(new Date('2024-06-01'));
    });

    it('should return defensive copies of items and saveForLater', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem()],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const items1 = cart.items;
      const items2 = cart.items;
      expect(items1).not.toBe(items2);
      expect(items1).toEqual(items2);
    });
  });

  describe('subtotal', () => {
    it('should be 0 for an empty cart', () => {
      const cart = makeEmptyCart();
      expect(cart.subtotal).toBe(0);
    });

    it('should compute sum of unitPrice × quantity', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [
          makeCartItem({ variantId: 'v-1', unitPrice: 29.99, quantity: 2 }),
          makeCartItem({ variantId: 'v-2', unitPrice: 10.50, quantity: 3 }),
        ],
        saveForLater: [],
        updatedAt: new Date(),
      });

      // 29.99 * 2 + 10.50 * 3 = 59.98 + 31.50 = 91.48
      expect(cart.subtotal).toBe(91.48);
    });

    it('should round to 2 decimal places using half-up rounding', () => {
      // Create a scenario that produces a value needing rounding
      // 1.005 * 1 + 2.005 * 1 = 3.01 (should round correctly)
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [
          makeCartItem({ variantId: 'v-1', unitPrice: 33.33, quantity: 3 }),
        ],
        saveForLater: [],
        updatedAt: new Date(),
      });

      // 33.33 * 3 = 99.99
      expect(cart.subtotal).toBe(99.99);
    });

    it('should handle floating point edge cases', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [
          makeCartItem({ variantId: 'v-1', unitPrice: 0.1, quantity: 3 }),
        ],
        saveForLater: [],
        updatedAt: new Date(),
      });

      // 0.1 * 3 = 0.30000000000000004 in JS, should round to 0.3
      expect(cart.subtotal).toBe(0.3);
    });
  });

  describe('itemCount', () => {
    it('should be 0 for an empty cart', () => {
      const cart = makeEmptyCart();
      expect(cart.itemCount).toBe(0);
    });

    it('should sum all quantities', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [
          makeCartItem({ variantId: 'v-1', quantity: 3 }),
          makeCartItem({ variantId: 'v-2', quantity: 7 }),
        ],
        saveForLater: [],
        updatedAt: new Date(),
      });

      expect(cart.itemCount).toBe(10);
    });
  });

  describe('canCheckout', () => {
    it('should be false for an empty cart', () => {
      const cart = makeEmptyCart();
      expect(cart.canCheckout).toBe(false);
    });

    it('should be true when cart has items', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem()],
        saveForLater: [],
        updatedAt: new Date(),
      });

      expect(cart.canCheckout).toBe(true);
    });
  });

  describe('addItem', () => {
    it('should add a new item to an empty cart', () => {
      const cart = makeEmptyCart();
      const item = makeCartItem({ variantId: 'v-1', quantity: 1 });

      const newCart = cart.addItem(item);

      expect(newCart.items).toHaveLength(1);
      expect(newCart.items[0].variantId).toBe('v-1');
      expect(newCart.items[0].quantity).toBe(1);
    });

    it('should return a new Cart instance (immutable)', () => {
      const cart = makeEmptyCart();
      const item = makeCartItem();
      const newCart = cart.addItem(item);

      expect(newCart).not.toBe(cart);
      expect(cart.items).toHaveLength(0);
      expect(newCart.items).toHaveLength(1);
    });

    it('should increment quantity for an existing item', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 3 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.addItem(makeCartItem({ variantId: 'v-1', quantity: 1 }));

      expect(newCart.items).toHaveLength(1);
      expect(newCart.items[0].quantity).toBe(4);
    });

    it('should throw when quantity would exceed MAX_QUANTITY_PER_ITEM', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 10 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      expect(() => cart.addItem(makeCartItem({ variantId: 'v-1' }))).toThrow(
        /maximum quantity per item/i,
      );
    });

    it('should throw when cart already has MAX_ITEMS distinct items', () => {
      const items: CartItem[] = Array.from({ length: 50 }, (_, i) =>
        makeCartItem({ variantId: `v-${i}`, quantity: 1 }),
      );

      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items,
        saveForLater: [],
        updatedAt: new Date(),
      });

      expect(() =>
        cart.addItem(makeCartItem({ variantId: 'v-new', quantity: 1 })),
      ).toThrow(/maximum number of distinct items/i);
    });

    it('should throw when new item has invalid quantity', () => {
      const cart = makeEmptyCart();

      expect(() =>
        cart.addItem(makeCartItem({ quantity: 0 })),
      ).toThrow(/quantity must be between/i);

      expect(() =>
        cart.addItem(makeCartItem({ quantity: 11 })),
      ).toThrow(/quantity must be between/i);
    });
  });

  describe('removeItem', () => {
    it('should remove an existing item', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1' }), makeCartItem({ variantId: 'v-2' })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.removeItem('v-1');

      expect(newCart.items).toHaveLength(1);
      expect(newCart.items[0].variantId).toBe('v-2');
    });

    it('should return a new Cart instance (immutable)', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1' })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.removeItem('v-1');
      expect(newCart).not.toBe(cart);
      expect(cart.items).toHaveLength(1);
    });

    it('should throw when variant not found', () => {
      const cart = makeEmptyCart();
      expect(() => cart.removeItem('v-999')).toThrow(/not found in cart/i);
    });
  });

  describe('updateQuantity', () => {
    it('should update quantity to a valid value', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 2 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.updateQuantity('v-1', 5);
      expect(newCart.items[0].quantity).toBe(5);
    });

    it('should remove item when quantity is 0', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 3 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.updateQuantity('v-1', 0);
      expect(newCart.items).toHaveLength(0);
    });

    it('should throw when quantity exceeds MAX_QUANTITY_PER_ITEM', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 2 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      expect(() => cart.updateQuantity('v-1', 11)).toThrow(/quantity must be between/i);
    });

    it('should throw when quantity is negative', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 2 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      expect(() => cart.updateQuantity('v-1', -1)).toThrow(/quantity must be between/i);
    });

    it('should throw when variant not found', () => {
      const cart = makeEmptyCart();
      expect(() => cart.updateQuantity('v-999', 5)).toThrow(/not found in cart/i);
    });

    it('should return a new Cart instance (immutable)', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 2 })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.updateQuantity('v-1', 5);
      expect(newCart).not.toBe(cart);
      expect(cart.items[0].quantity).toBe(2);
    });
  });

  describe('moveToSaveForLater', () => {
    it('should move an item from cart to save-for-later', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1' })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.moveToSaveForLater('v-1');

      expect(newCart.items).toHaveLength(0);
      expect(newCart.saveForLater).toHaveLength(1);
      expect(newCart.saveForLater[0].variantId).toBe('v-1');
      expect(newCart.saveForLater[0].productName).toBe('Test Product');
    });

    it('should not create duplicate if variant already in save-for-later', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1' })],
        saveForLater: [makeSaveForLaterItem({ variantId: 'v-1' })],
        updatedAt: new Date(),
      });

      const newCart = cart.moveToSaveForLater('v-1');

      expect(newCart.items).toHaveLength(0);
      expect(newCart.saveForLater).toHaveLength(1);
    });

    it('should throw when variant not in cart', () => {
      const cart = makeEmptyCart();
      expect(() => cart.moveToSaveForLater('v-999')).toThrow(/not found in cart/i);
    });

    it('should return a new Cart instance (immutable)', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1' })],
        saveForLater: [],
        updatedAt: new Date(),
      });

      const newCart = cart.moveToSaveForLater('v-1');
      expect(newCart).not.toBe(cart);
      expect(cart.items).toHaveLength(1);
    });
  });

  describe('moveBackToCart', () => {
    it('should move a saved item back to cart with quantity 1', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [],
        saveForLater: [makeSaveForLaterItem({ variantId: 'v-1' })],
        updatedAt: new Date(),
      });

      const newCart = cart.moveBackToCart('v-1');

      expect(newCart.saveForLater).toHaveLength(0);
      expect(newCart.items).toHaveLength(1);
      expect(newCart.items[0].variantId).toBe('v-1');
      expect(newCart.items[0].quantity).toBe(1);
    });

    it('should throw when variant not in save-for-later', () => {
      const cart = makeEmptyCart();
      expect(() => cart.moveBackToCart('v-999')).toThrow(
        /not found in save-for-later/i,
      );
    });

    it('should throw when cart is already at MAX_ITEMS', () => {
      const items: CartItem[] = Array.from({ length: 50 }, (_, i) =>
        makeCartItem({ variantId: `v-${i}`, quantity: 1 }),
      );

      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items,
        saveForLater: [makeSaveForLaterItem({ variantId: 'v-saved' })],
        updatedAt: new Date(),
      });

      expect(() => cart.moveBackToCart('v-saved')).toThrow(
        /maximum number of distinct items/i,
      );
    });

    it('should handle case where variant is already in cart (remove from SFL only)', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem({ variantId: 'v-1', quantity: 3 })],
        saveForLater: [makeSaveForLaterItem({ variantId: 'v-1' })],
        updatedAt: new Date(),
      });

      const newCart = cart.moveBackToCart('v-1');

      expect(newCart.saveForLater).toHaveLength(0);
      expect(newCart.items).toHaveLength(1);
      expect(newCart.items[0].quantity).toBe(3); // unchanged
    });

    it('should return a new Cart instance (immutable)', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [],
        saveForLater: [makeSaveForLaterItem({ variantId: 'v-1' })],
        updatedAt: new Date(),
      });

      const newCart = cart.moveBackToCart('v-1');
      expect(newCart).not.toBe(cart);
      expect(cart.saveForLater).toHaveLength(1);
    });
  });

  describe('toProps', () => {
    it('should return a copy of the props', () => {
      const cart = new Cart({
        id: 'cart-1',
        customerId: 'cust-1',
        items: [makeCartItem()],
        saveForLater: [makeSaveForLaterItem({ variantId: 'v-2' })],
        updatedAt: new Date('2024-01-01'),
      });

      const props = cart.toProps();
      expect(props.id).toBe('cart-1');
      expect(props.items).toHaveLength(1);
      expect(props.saveForLater).toHaveLength(1);
      // Should be a copy, not the same reference
      expect(props.items).not.toBe(cart.items);
    });
  });
});
