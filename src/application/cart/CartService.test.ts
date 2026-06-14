/**
 * CartService unit tests.
 *
 * Covers:
 * - getCart: returns empty CartView for new customer; returns existing cart
 * - addItem: adds new item; increments existing; rejects out-of-stock; rejects nonexistent variant;
 *            caps at stock with notice; rejects when max quantity reached; rejects when max items reached
 * - removeItem: removes existing item; returns error for non-existent item
 * - updateQuantity: updates quantity; removes on 0; rejects invalid quantities;
 *                   caps at min(stock, maxPerItem); rejects item not in cart
 * - moveToSaveForLater: moves item; deduplicates; rejects item not in cart
 * - moveBackToCart: moves back with qty 1; rejects out-of-stock; rejects item not in SFL
 * - clearCart: clears all items; preserves save-for-later
 *
 * Requirements: 1.1–1.7, 2.1–2.3, 3.1–3.5, 4.1–4.5, 5.1–5.6, 14.2, 14.3, 17.1–17.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CartService } from './CartService.js';
import { Cart } from '../../domain/cart/Cart.js';
import { ProductVariant } from '../../domain/catalog/ProductVariant.js';
import { Product } from '../../domain/catalog/Product.js';
import type { ICartRepository } from '../../domain/cart/ICartRepository.js';
import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { IProductRepository } from '../../domain/catalog/IProductRepository.js';
import type { CartItem } from '../../domain/cart/CartItem.js';
import type { Condition } from '../../domain/catalog/ProductVariant.js';

// ── In-memory test repositories ───────────────────────────────────────────────

class TestCartRepository implements ICartRepository {
  private store = new Map<string, Cart>();

  async findByCustomerId(customerId: string): Promise<Cart | null> {
    return this.store.get(customerId) ?? null;
  }

  async save(cart: Cart): Promise<void> {
    this.store.set(cart.customerId, cart);
  }

  getAll(): Map<string, Cart> {
    return this.store;
  }
}

class TestVariantRepository implements IVariantRepository {
  private store = new Map<string, ProductVariant>();

  addVariant(variant: ProductVariant): void {
    this.store.set(variant.id, variant);
  }

  async findById(id: string): Promise<ProductVariant | null> {
    return this.store.get(id) ?? null;
  }

  async findByProductId(productId: string): Promise<ProductVariant[]> {
    return [...this.store.values()].filter((v) => v.productId === productId);
  }

  async save(variant: ProductVariant): Promise<void> {
    this.store.set(variant.id, variant);
  }

  async findByCondition(condition: Condition): Promise<ProductVariant[]> {
    return [...this.store.values()].filter((v) => v.condition === condition);
  }

  async findBySourceReturnId(sourceReturnId: string): Promise<ProductVariant | null> {
    return [...this.store.values()].find((v) => v.sourceReturnId === sourceReturnId) ?? null;
  }
}

class TestProductRepository implements IProductRepository {
  private store = new Map<string, Product>();

  addProduct(product: Product): void {
    this.store.set(product.id, product);
  }

  async findById(id: string): Promise<Product | null> {
    return this.store.get(id) ?? null;
  }

  async findByCategory(_categoryId: string): Promise<Product[]> {
    return [];
  }

  async searchByKeyword(_keyword: string, _limit?: number): Promise<Product[]> {
    return [];
  }

  async findAll(_limit?: number): Promise<Product[]> {
    return [...this.store.values()];
  }
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeVariant(overrides?: Partial<{ id: string; productId: string; condition: Condition; price: number; stock: number }>): ProductVariant {
  return new ProductVariant({
    id: overrides?.id ?? 'variant-1',
    productId: overrides?.productId ?? 'product-1',
    condition: overrides?.condition ?? 'New',
    price: overrides?.price ?? 999,
    stock: overrides?.stock ?? 5,
  });
}

function makeProduct(overrides?: Partial<{ id: string; title: string; catalogImageUrl: string }>): Product {
  return new Product({
    id: overrides?.id ?? 'product-1',
    title: overrides?.title ?? 'Test Product',
    brand: 'TestBrand',
    catalogImageUrl: overrides?.catalogImageUrl ?? 'https://img.example.com/test.jpg',
    category: 'cat-1',
    basePrice: 999,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CartService', () => {
  let cartRepo: TestCartRepository;
  let variantRepo: TestVariantRepository;
  let productRepo: TestProductRepository;
  let service: CartService;

  beforeEach(() => {
    cartRepo = new TestCartRepository();
    variantRepo = new TestVariantRepository();
    productRepo = new TestProductRepository();
    service = new CartService(cartRepo, variantRepo, productRepo);

    // Seed a default variant and product
    variantRepo.addVariant(makeVariant());
    productRepo.addProduct(makeProduct());
  });

  // ── getCart ───────────────────────────────────────────────────────────────

  describe('getCart', () => {
    it('returns empty CartView for new customer', async () => {
      const view = await service.getCart('cust-new');
      expect(view.items).toEqual([]);
      expect(view.saveForLater).toEqual([]);
      expect(view.subtotal).toBe(0);
      expect(view.itemCount).toBe(0);
      expect(view.canCheckout).toBe(false);
    });

    it('returns existing cart data', async () => {
      await service.addItem('cust-1', 'variant-1');
      const view = await service.getCart('cust-1');
      expect(view.items.length).toBe(1);
      expect(view.items[0].variantId).toBe('variant-1');
      expect(view.subtotal).toBe(999);
      expect(view.itemCount).toBe(1);
      expect(view.canCheckout).toBe(true);
    });
  });

  // ── addItem ───────────────────────────────────────────────────────────────

  describe('addItem', () => {
    it('adds a new item with quantity 1', async () => {
      const result = await service.addItem('cust-1', 'variant-1');
      expect(result.success).toBe(true);
      expect(result.cart.items.length).toBe(1);
      expect(result.cart.items[0].quantity).toBe(1);
      expect(result.cart.items[0].productName).toBe('Test Product');
      expect(result.cart.items[0].productImage).toBe('https://img.example.com/test.jpg');
    });

    it('increments quantity if item already in cart', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.addItem('cust-1', 'variant-1');
      expect(result.success).toBe(true);
      expect(result.cart.items[0].quantity).toBe(2);
    });

    it('rejects when variant does not exist', async () => {
      const result = await service.addItem('cust-1', 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects when variant has zero stock', async () => {
      variantRepo.addVariant(makeVariant({ id: 'variant-oos', stock: 0 }));
      const result = await service.addItem('cust-1', 'variant-oos');
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of stock');
    });

    it('caps at available stock with notice when incrementing would exceed stock', async () => {
      variantRepo.addVariant(makeVariant({ id: 'variant-low', stock: 2 }));
      productRepo.addProduct(makeProduct({ id: 'product-1' }));

      await service.addItem('cust-1', 'variant-low');
      await service.addItem('cust-1', 'variant-low');
      // stock is 2, trying to add 3rd should cap
      const result = await service.addItem('cust-1', 'variant-low');
      expect(result.success).toBe(true);
      expect(result.notice).toBeDefined();
      expect(result.cart.items.find((i) => i.variantId === 'variant-low')?.quantity).toBe(2);
    });

    it('rejects when max quantity per item (10) is reached', async () => {
      variantRepo.addVariant(makeVariant({ id: 'variant-hi', stock: 20 }));

      // Add item 10 times
      for (let i = 0; i < 10; i++) {
        await service.addItem('cust-1', 'variant-hi');
      }

      const result = await service.addItem('cust-1', 'variant-hi');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum quantity per item');
    });

    it('rejects when max items (50) in cart is reached', async () => {
      // Create 50 different variants
      for (let i = 0; i < 50; i++) {
        const vId = `variant-fill-${i}`;
        variantRepo.addVariant(makeVariant({ id: vId, productId: `product-fill-${i}`, stock: 5 }));
        productRepo.addProduct(makeProduct({ id: `product-fill-${i}`, title: `Product ${i}` }));
        await service.addItem('cust-1', vId);
      }

      // 51st should be rejected
      variantRepo.addVariant(makeVariant({ id: 'variant-overflow', productId: 'product-overflow', stock: 5 }));
      productRepo.addProduct(makeProduct({ id: 'product-overflow', title: 'Overflow' }));

      const result = await service.addItem('cust-1', 'variant-overflow');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum number of distinct items');
    });
  });

  // ── removeItem ────────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes an existing item from cart', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.removeItem('cust-1', 'variant-1');
      expect(result.success).toBe(true);
      expect(result.cart.items.length).toBe(0);
      expect(result.cart.subtotal).toBe(0);
    });

    it('returns error when item is not in cart', async () => {
      const result = await service.removeItem('cust-1', 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ── updateQuantity ────────────────────────────────────────────────────────

  describe('updateQuantity', () => {
    it('updates quantity to a valid value', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.updateQuantity('cust-1', 'variant-1', 3);
      expect(result.success).toBe(true);
      expect(result.cart.items[0].quantity).toBe(3);
    });

    it('removes item when quantity is 0', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.updateQuantity('cust-1', 'variant-1', 0);
      expect(result.success).toBe(true);
      expect(result.cart.items.length).toBe(0);
    });

    it('rejects negative quantity', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.updateQuantity('cust-1', 'variant-1', -1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('integer between 0 and 99');
    });

    it('rejects non-integer quantity', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.updateQuantity('cust-1', 'variant-1', 2.5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('integer between 0 and 99');
    });

    it('rejects quantity > 99', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.updateQuantity('cust-1', 'variant-1', 100);
      expect(result.success).toBe(false);
      expect(result.error).toContain('integer between 0 and 99');
    });

    it('caps at available stock with notice', async () => {
      variantRepo.addVariant(makeVariant({ id: 'variant-cap', stock: 3 }));
      productRepo.addProduct(makeProduct({ id: 'product-1' }));
      await service.addItem('cust-1', 'variant-cap');

      const result = await service.updateQuantity('cust-1', 'variant-cap', 7);
      expect(result.success).toBe(true);
      expect(result.cart.items[0].quantity).toBe(3);
      expect(result.notice).toBeDefined();
    });

    it('caps at maxQuantityPerItem (10) with notice', async () => {
      variantRepo.addVariant(makeVariant({ id: 'variant-hi2', stock: 50 }));
      productRepo.addProduct(makeProduct({ id: 'product-1' }));
      await service.addItem('cust-1', 'variant-hi2');

      const result = await service.updateQuantity('cust-1', 'variant-hi2', 15);
      expect(result.success).toBe(true);
      expect(result.cart.items[0].quantity).toBe(10);
      expect(result.notice).toBeDefined();
    });

    it('returns error when item not in cart', async () => {
      const result = await service.updateQuantity('cust-1', 'nonexistent', 3);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ── moveToSaveForLater ────────────────────────────────────────────────────

  describe('moveToSaveForLater', () => {
    it('moves item from cart to save-for-later', async () => {
      await service.addItem('cust-1', 'variant-1');
      const result = await service.moveToSaveForLater('cust-1', 'variant-1');
      expect(result.success).toBe(true);
      expect(result.cart.items.length).toBe(0);
      expect(result.cart.saveForLater.length).toBe(1);
      expect(result.cart.saveForLater[0].variantId).toBe('variant-1');
    });

    it('deduplicates when item already in save-for-later', async () => {
      // Add and move to SFL
      await service.addItem('cust-1', 'variant-1');
      await service.moveToSaveForLater('cust-1', 'variant-1');

      // Add same item again and move to SFL again
      await service.addItem('cust-1', 'variant-1');
      const result = await service.moveToSaveForLater('cust-1', 'variant-1');
      expect(result.success).toBe(true);
      expect(result.cart.saveForLater.length).toBe(1); // no duplicate
    });

    it('returns error when item not in cart', async () => {
      const result = await service.moveToSaveForLater('cust-1', 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ── moveBackToCart ────────────────────────────────────────────────────────

  describe('moveBackToCart', () => {
    it('moves item back to cart with quantity 1', async () => {
      await service.addItem('cust-1', 'variant-1');
      await service.moveToSaveForLater('cust-1', 'variant-1');

      const result = await service.moveBackToCart('cust-1', 'variant-1');
      expect(result.success).toBe(true);
      expect(result.cart.items.length).toBe(1);
      expect(result.cart.items[0].quantity).toBe(1);
      expect(result.cart.saveForLater.length).toBe(0);
    });

    it('rejects when variant is out of stock', async () => {
      await service.addItem('cust-1', 'variant-1');
      await service.moveToSaveForLater('cust-1', 'variant-1');

      // Set stock to 0
      variantRepo.addVariant(makeVariant({ id: 'variant-1', stock: 0 }));

      const result = await service.moveBackToCart('cust-1', 'variant-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of stock');
    });

    it('returns error when item not in save-for-later', async () => {
      const result = await service.moveBackToCart('cust-1', 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in save-for-later');
    });
  });

  // ── clearCart ─────────────────────────────────────────────────────────────

  describe('clearCart', () => {
    it('removes all items from cart', async () => {
      await service.addItem('cust-1', 'variant-1');
      variantRepo.addVariant(makeVariant({ id: 'variant-2', productId: 'product-1', stock: 5 }));
      await service.addItem('cust-1', 'variant-2');

      await service.clearCart('cust-1');
      const view = await service.getCart('cust-1');
      expect(view.items.length).toBe(0);
      expect(view.subtotal).toBe(0);
      expect(view.itemCount).toBe(0);
      expect(view.canCheckout).toBe(false);
    });

    it('preserves save-for-later items', async () => {
      await service.addItem('cust-1', 'variant-1');
      await service.moveToSaveForLater('cust-1', 'variant-1');

      variantRepo.addVariant(makeVariant({ id: 'variant-2', productId: 'product-1', stock: 5 }));
      await service.addItem('cust-1', 'variant-2');

      await service.clearCart('cust-1');
      const view = await service.getCart('cust-1');
      expect(view.items.length).toBe(0);
      expect(view.saveForLater.length).toBe(1);
    });
  });

  // ── canCheckout reflects cart state ───────────────────────────────────────

  describe('canCheckout (Req 14.2, 14.3)', () => {
    it('is false when cart is empty', async () => {
      const view = await service.getCart('cust-1');
      expect(view.canCheckout).toBe(false);
    });

    it('is true when cart has items', async () => {
      await service.addItem('cust-1', 'variant-1');
      const view = await service.getCart('cust-1');
      expect(view.canCheckout).toBe(true);
    });

    it('becomes false when last item is removed', async () => {
      await service.addItem('cust-1', 'variant-1');
      await service.removeItem('cust-1', 'variant-1');
      const view = await service.getCart('cust-1');
      expect(view.canCheckout).toBe(false);
    });
  });

  // ── subtotal computation ──────────────────────────────────────────────────

  describe('subtotal computation (Req 4.1, 4.2)', () => {
    it('computes sum of unitPrice * quantity', async () => {
      variantRepo.addVariant(makeVariant({ id: 'v-a', productId: 'product-1', price: 100, stock: 10 }));
      variantRepo.addVariant(makeVariant({ id: 'v-b', productId: 'product-1', price: 250, stock: 10 }));

      await service.addItem('cust-1', 'v-a');
      await service.addItem('cust-1', 'v-a'); // qty 2
      await service.addItem('cust-1', 'v-b'); // qty 1

      const view = await service.getCart('cust-1');
      expect(view.subtotal).toBe(100 * 2 + 250 * 1); // 450
      expect(view.itemCount).toBe(3); // 2 + 1
    });

    it('returns 0 for empty cart', async () => {
      const view = await service.getCart('cust-1');
      expect(view.subtotal).toBe(0);
      expect(view.itemCount).toBe(0);
    });
  });
});
