// src/application/cart/CartService.ts

import { randomUUID } from 'crypto';

import type { CartItem } from '../../domain/cart/CartItem.js';
import type { SaveForLaterItem } from '../../domain/cart/SaveForLaterItem.js';
import { Cart } from '../../domain/cart/Cart.js';
import type { ICartRepository } from '../../domain/cart/ICartRepository.js';
import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { IProductRepository } from '../../domain/catalog/IProductRepository.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CartView {
  items: CartItem[];
  saveForLater: SaveForLaterItem[];
  subtotal: number;
  itemCount: number;
  canCheckout: boolean;
}

export interface CartOperationResult {
  success: boolean;
  cart: CartView;
  notice?: string;
  error?: string;
}

export interface ICartService {
  getCart(customerId: string): Promise<CartView>;
  addItem(customerId: string, variantId: string): Promise<CartOperationResult>;
  removeItem(customerId: string, variantId: string): Promise<CartOperationResult>;
  updateQuantity(customerId: string, variantId: string, quantity: number): Promise<CartOperationResult>;
  moveToSaveForLater(customerId: string, variantId: string): Promise<CartOperationResult>;
  moveBackToCart(customerId: string, variantId: string): Promise<CartOperationResult>;
  clearCart(customerId: string): Promise<void>;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class CartService implements ICartService {
  constructor(
    private readonly cartRepo: ICartRepository,
    private readonly variantRepo: IVariantRepository,
    private readonly productRepo: IProductRepository,
  ) {}

  // ── getCart ─────────────────────────────────────────────────────────────────

  async getCart(customerId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(customerId);
    return this.toCartView(cart);
  }

  // ── addItem ─────────────────────────────────────────────────────────────────

  async addItem(customerId: string, variantId: string): Promise<CartOperationResult> {
    // Look up the variant
    const variant = await this.variantRepo.findById(variantId);
    if (!variant) {
      const cart = await this.getOrCreateCart(customerId);
      return {
        success: false,
        cart: this.toCartView(cart),
        error: 'Variant not found',
      };
    }

    // Check stock
    if (variant.stock <= 0) {
      const cart = await this.getOrCreateCart(customerId);
      return {
        success: false,
        cart: this.toCartView(cart),
        error: 'Item is out of stock',
      };
    }

    let cart = await this.getOrCreateCart(customerId);

    // Check if item already in cart
    const existingItem = cart.items.find((i) => i.variantId === variantId);

    if (existingItem) {
      const newQuantity = existingItem.quantity + 1;

      // Check max quantity per item
      if (newQuantity > Cart.MAX_QUANTITY_PER_ITEM) {
        return {
          success: false,
          cart: this.toCartView(cart),
          error: `Maximum quantity per item (${Cart.MAX_QUANTITY_PER_ITEM}) reached`,
        };
      }

      // Check if incrementing would exceed stock
      if (newQuantity > variant.stock) {
        // Cap at stock
        const cappedCart = cart.updateQuantity(variantId, variant.stock);
        await this.cartRepo.save(cappedCart);
        return {
          success: true,
          cart: this.toCartView(cappedCart),
          notice: `Quantity capped to available stock (${variant.stock})`,
        };
      }

      // Normal increment
      cart = cart.addItem(existingItem);
      await this.cartRepo.save(cart);
      return {
        success: true,
        cart: this.toCartView(cart),
      };
    }

    // New item — look up product for name and image
    const product = await this.productRepo.findById(variant.productId);
    const productName = product?.title ?? 'Unknown Product';
    const productImage = product?.catalogImageUrl ?? '';

    // Check max items in cart
    if (cart.items.length >= Cart.MAX_ITEMS) {
      return {
        success: false,
        cart: this.toCartView(cart),
        error: `Maximum number of distinct items (${Cart.MAX_ITEMS}) reached`,
      };
    }

    const newItem: CartItem = {
      variantId: variant.id,
      productId: variant.productId,
      productName,
      productImage,
      unitPrice: variant.price,
      condition: variant.condition,
      quantity: 1,
    };

    cart = cart.addItem(newItem);
    await this.cartRepo.save(cart);

    return {
      success: true,
      cart: this.toCartView(cart),
    };
  }

  // ── removeItem ──────────────────────────────────────────────────────────────

  async removeItem(customerId: string, variantId: string): Promise<CartOperationResult> {
    const cart = await this.getOrCreateCart(customerId);

    const existingItem = cart.items.find((i) => i.variantId === variantId);
    if (!existingItem) {
      return {
        success: false,
        cart: this.toCartView(cart),
        error: `Item with variant ${variantId} not found in cart`,
      };
    }

    const updatedCart = cart.removeItem(variantId);
    await this.cartRepo.save(updatedCart);

    return {
      success: true,
      cart: this.toCartView(updatedCart),
    };
  }

  // ── updateQuantity ──────────────────────────────────────────────────────────

  async updateQuantity(
    customerId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartOperationResult> {
    // Validate quantity: must be integer, in [0, 99]
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      const cart = await this.getOrCreateCart(customerId);
      return {
        success: false,
        cart: this.toCartView(cart),
        error: 'Quantity must be an integer between 0 and 99',
      };
    }

    const cart = await this.getOrCreateCart(customerId);

    // Check item exists
    const existingItem = cart.items.find((i) => i.variantId === variantId);
    if (!existingItem) {
      return {
        success: false,
        cart: this.toCartView(cart),
        error: `Item with variant ${variantId} not found in cart`,
      };
    }

    // If quantity is 0, remove the item
    if (quantity === 0) {
      const updatedCart = cart.removeItem(variantId);
      await this.cartRepo.save(updatedCart);
      return {
        success: true,
        cart: this.toCartView(updatedCart),
      };
    }

    // Check stock for capping
    const variant = await this.variantRepo.findById(variantId);
    const availableStock = variant?.stock ?? 0;

    // Cap at min(quantity, availableStock, maxQuantityPerItem)
    const cappedQuantity = Math.min(quantity, availableStock, Cart.MAX_QUANTITY_PER_ITEM);

    let notice: string | undefined;
    if (cappedQuantity < quantity) {
      notice = `Quantity adjusted from ${quantity} to ${cappedQuantity} (limited by ${cappedQuantity === availableStock ? 'available stock' : 'maximum per item'})`;
    }

    const updatedCart = cart.updateQuantity(variantId, cappedQuantity);
    await this.cartRepo.save(updatedCart);

    return {
      success: true,
      cart: this.toCartView(updatedCart),
      notice,
    };
  }

  // ── moveToSaveForLater ──────────────────────────────────────────────────────

  async moveToSaveForLater(
    customerId: string,
    variantId: string,
  ): Promise<CartOperationResult> {
    const cart = await this.getOrCreateCart(customerId);

    const existingItem = cart.items.find((i) => i.variantId === variantId);
    if (!existingItem) {
      return {
        success: false,
        cart: this.toCartView(cart),
        error: `Item with variant ${variantId} not found in cart`,
      };
    }

    const updatedCart = cart.moveToSaveForLater(variantId);
    await this.cartRepo.save(updatedCart);

    return {
      success: true,
      cart: this.toCartView(updatedCart),
    };
  }

  // ── moveBackToCart ──────────────────────────────────────────────────────────

  async moveBackToCart(
    customerId: string,
    variantId: string,
  ): Promise<CartOperationResult> {
    const cart = await this.getOrCreateCart(customerId);

    // Check item exists in save-for-later
    const savedItem = cart.saveForLater.find((s) => s.variantId === variantId);
    if (!savedItem) {
      return {
        success: false,
        cart: this.toCartView(cart),
        error: `Item with variant ${variantId} not found in save-for-later list`,
      };
    }

    // Validate stock > 0
    const variant = await this.variantRepo.findById(variantId);
    if (!variant || variant.stock <= 0) {
      return {
        success: false,
        cart: this.toCartView(cart),
        error: `${savedItem.productName} is out of stock`,
      };
    }

    const updatedCart = cart.moveBackToCart(variantId);
    await this.cartRepo.save(updatedCart);

    return {
      success: true,
      cart: this.toCartView(updatedCart),
    };
  }

  // ── clearCart ───────────────────────────────────────────────────────────────

  async clearCart(customerId: string): Promise<void> {
    const cart = await this.getOrCreateCart(customerId);

    const clearedCart = new Cart({
      id: cart.id,
      customerId: cart.customerId,
      items: [],
      saveForLater: cart.saveForLater,
      updatedAt: new Date(),
    });

    await this.cartRepo.save(clearedCart);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async getOrCreateCart(customerId: string): Promise<Cart> {
    const existing = await this.cartRepo.findByCustomerId(customerId);
    if (existing) {
      return existing;
    }

    // Create a new empty cart
    const newCart = new Cart({
      id: randomUUID(),
      customerId,
      items: [],
      saveForLater: [],
      updatedAt: new Date(),
    });

    await this.cartRepo.save(newCart);
    return newCart;
  }

  private toCartView(cart: Cart): CartView {
    return {
      items: cart.items,
      saveForLater: cart.saveForLater,
      subtotal: cart.subtotal,
      itemCount: cart.itemCount,
      canCheckout: cart.canCheckout,
    };
  }
}
