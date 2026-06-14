import type { CartItem } from './CartItem.js';
import type { SaveForLaterItem } from './SaveForLaterItem.js';

/**
 * Cart aggregate root props — the shape stored and restored by the repository.
 */
export interface CartProps {
  id: string;
  customerId: string;
  items: CartItem[];
  saveForLater: SaveForLaterItem[];
  updatedAt: Date;
}

/**
 * Cart aggregate root — a per-customer collection of CartItems intended for purchase.
 *
 * Invariants:
 * - Maximum 50 distinct CartItems
 * - Each CartItem quantity: 1–10 inclusive
 * - A CartItem references exactly one ProductVariant (by variantId)
 *
 * All mutation methods return a NEW Cart instance (immutable pattern).
 */
export class Cart {
  private readonly _props: Readonly<CartProps>;

  /** Maximum number of distinct items allowed in the cart */
  static readonly MAX_ITEMS = 50;
  /** Maximum quantity per individual CartItem */
  static readonly MAX_QUANTITY_PER_ITEM = 10;
  /** Minimum quantity per individual CartItem */
  static readonly MIN_QUANTITY_PER_ITEM = 1;

  constructor(props: CartProps) {
    this._props = Object.freeze({ ...props });
  }

  // --- Accessors ---

  get id(): string { return this._props.id; }
  get customerId(): string { return this._props.customerId; }
  get items(): CartItem[] { return [...this._props.items]; }
  get saveForLater(): SaveForLaterItem[] { return [...this._props.saveForLater]; }
  get updatedAt(): Date { return this._props.updatedAt; }

  /**
   * Subtotal: sum of (unitPrice × quantity) for all items,
   * rounded to 2 decimal places using half-up rounding.
   */
  get subtotal(): number {
    const sum = this._props.items.reduce(
      (acc, item) => acc + item.unitPrice * item.quantity,
      0,
    );
    return Math.round(sum * 100) / 100;
  }

  /** Total number of units across all CartItems (sum of quantities). */
  get itemCount(): number {
    return this._props.items.reduce((acc, item) => acc + item.quantity, 0);
  }

  /** Whether the cart can proceed to checkout (has at least one item). */
  get canCheckout(): boolean {
    return this._props.items.length > 0;
  }

  // --- Mutation methods (return new Cart instances) ---

  /**
   * Add an item to the cart. If the variant already exists, increment its quantity by 1.
   * Enforces: max 50 distinct items, max 10 quantity per item.
   *
   * @throws Error if adding would exceed MAX_ITEMS (for a new item)
   * @throws Error if incrementing would exceed MAX_QUANTITY_PER_ITEM
   */
  addItem(item: CartItem): Cart {
    const existingIndex = this._props.items.findIndex(
      (i) => i.variantId === item.variantId,
    );

    let newItems: CartItem[];

    if (existingIndex >= 0) {
      // Item already in cart — increment quantity
      const existing = this._props.items[existingIndex];
      const newQuantity = existing.quantity + 1;

      if (newQuantity > Cart.MAX_QUANTITY_PER_ITEM) {
        throw new Error(
          `Maximum quantity per item (${Cart.MAX_QUANTITY_PER_ITEM}) reached for variant ${item.variantId}`,
        );
      }

      newItems = this._props.items.map((i, idx) =>
        idx === existingIndex ? { ...i, quantity: newQuantity } : i,
      );
    } else {
      // New item — check distinct item limit
      if (this._props.items.length >= Cart.MAX_ITEMS) {
        throw new Error(
          `Maximum number of distinct items (${Cart.MAX_ITEMS}) reached`,
        );
      }

      if (item.quantity < Cart.MIN_QUANTITY_PER_ITEM || item.quantity > Cart.MAX_QUANTITY_PER_ITEM) {
        throw new Error(
          `Quantity must be between ${Cart.MIN_QUANTITY_PER_ITEM} and ${Cart.MAX_QUANTITY_PER_ITEM}`,
        );
      }

      newItems = [...this._props.items, item];
    }

    return new Cart({
      ...this._props,
      items: newItems,
      updatedAt: new Date(),
    });
  }

  /**
   * Remove an item from the cart by variantId.
   *
   * @throws Error if the variant is not found in the cart
   */
  removeItem(variantId: string): Cart {
    const existingIndex = this._props.items.findIndex(
      (i) => i.variantId === variantId,
    );

    if (existingIndex < 0) {
      throw new Error(`Item with variant ${variantId} not found in cart`);
    }

    const newItems = this._props.items.filter((i) => i.variantId !== variantId);

    return new Cart({
      ...this._props,
      items: newItems,
      updatedAt: new Date(),
    });
  }

  /**
   * Update the quantity of a CartItem. If quantity is 0, the item is removed.
   * Enforces: quantity in [1, 10] (or 0 for removal).
   *
   * @throws Error if the variant is not found in the cart
   * @throws Error if quantity is outside [0, 10]
   */
  updateQuantity(variantId: string, quantity: number): Cart {
    const existingIndex = this._props.items.findIndex(
      (i) => i.variantId === variantId,
    );

    if (existingIndex < 0) {
      throw new Error(`Item with variant ${variantId} not found in cart`);
    }

    // Quantity 0 means remove
    if (quantity === 0) {
      return this.removeItem(variantId);
    }

    if (quantity < Cart.MIN_QUANTITY_PER_ITEM || quantity > Cart.MAX_QUANTITY_PER_ITEM) {
      throw new Error(
        `Quantity must be between ${Cart.MIN_QUANTITY_PER_ITEM} and ${Cart.MAX_QUANTITY_PER_ITEM}, got ${quantity}`,
      );
    }

    const newItems = this._props.items.map((i, idx) =>
      idx === existingIndex ? { ...i, quantity } : i,
    );

    return new Cart({
      ...this._props,
      items: newItems,
      updatedAt: new Date(),
    });
  }

  /**
   * Move a CartItem to the save-for-later list.
   * If the variant already exists in save-for-later, the item is removed from the cart
   * without creating a duplicate (idempotent save-for-later).
   *
   * @throws Error if the variant is not found in the cart
   */
  moveToSaveForLater(variantId: string): Cart {
    const existingIndex = this._props.items.findIndex(
      (i) => i.variantId === variantId,
    );

    if (existingIndex < 0) {
      throw new Error(`Item with variant ${variantId} not found in cart`);
    }

    const item = this._props.items[existingIndex];
    const newItems = this._props.items.filter((i) => i.variantId !== variantId);

    // Check if already in save-for-later (idempotency — no duplicate)
    const alreadySaved = this._props.saveForLater.some(
      (s) => s.variantId === variantId,
    );

    const newSaveForLater = alreadySaved
      ? [...this._props.saveForLater]
      : [
          ...this._props.saveForLater,
          {
            variantId: item.variantId,
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage,
            unitPrice: item.unitPrice,
            condition: item.condition,
            savedAt: new Date(),
          },
        ];

    return new Cart({
      ...this._props,
      items: newItems,
      saveForLater: newSaveForLater,
      updatedAt: new Date(),
    });
  }

  /**
   * Move an item from the save-for-later list back to the active cart with quantity 1.
   *
   * @throws Error if the variant is not found in save-for-later
   * @throws Error if adding back would exceed MAX_ITEMS
   */
  moveBackToCart(variantId: string): Cart {
    const savedIndex = this._props.saveForLater.findIndex(
      (s) => s.variantId === variantId,
    );

    if (savedIndex < 0) {
      throw new Error(
        `Item with variant ${variantId} not found in save-for-later list`,
      );
    }

    const savedItem = this._props.saveForLater[savedIndex];

    // Check if item already in cart (edge case: re-added while still in SFL)
    const existingInCart = this._props.items.findIndex(
      (i) => i.variantId === variantId,
    );

    let newItems: CartItem[];

    if (existingInCart >= 0) {
      // Already in cart — just remove from save-for-later, don't duplicate
      newItems = [...this._props.items];
    } else {
      // Check distinct item limit before adding
      if (this._props.items.length >= Cart.MAX_ITEMS) {
        throw new Error(
          `Maximum number of distinct items (${Cart.MAX_ITEMS}) reached`,
        );
      }

      const cartItem: CartItem = {
        variantId: savedItem.variantId,
        productId: savedItem.productId,
        productName: savedItem.productName,
        productImage: savedItem.productImage,
        unitPrice: savedItem.unitPrice,
        condition: savedItem.condition,
        quantity: 1,
      };

      newItems = [...this._props.items, cartItem];
    }

    const newSaveForLater = this._props.saveForLater.filter(
      (s) => s.variantId !== variantId,
    );

    return new Cart({
      ...this._props,
      items: newItems,
      saveForLater: newSaveForLater,
      updatedAt: new Date(),
    });
  }

  // --- Utility ---

  /** Returns a plain props object (shallow copy) for serialization/persistence. */
  toProps(): CartProps {
    return {
      ...this._props,
      items: [...this._props.items],
      saveForLater: [...this._props.saveForLater],
    };
  }
}
