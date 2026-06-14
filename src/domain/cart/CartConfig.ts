// src/domain/cart/CartConfig.ts

export interface DeliveryOption {
  /** Unique identifier for the delivery option (e.g. 'standard', 'express') */
  id: string;
  /** Display name shown to the customer */
  name: string;
  /** Minimum delivery days from current date */
  minDays: number;
  /** Maximum delivery days from current date */
  maxDays: number;
  /** Delivery cost in ₹ (0 for Standard, configurable for Express) */
  cost: number;
}

export interface CartConfig {
  /** Maximum number of distinct Cart_Items allowed per Cart (default: 50) */
  maxItemsPerCart: number;
  /** Maximum quantity allowed per individual Cart_Item (default: 10) */
  maxQuantityPerItem: number;
  /** Absolute validation ceiling for quantity input (default: 99) */
  maxQuantityAbsolute: number;
  /** Available delivery options presented at checkout */
  deliveryOptions: DeliveryOption[];
  /** Express delivery fee in ₹ (default: 49) */
  expressFee: number;
  /** 6-digit pincodes with historically high Return-to-Origin rates for COD */
  highRtoPincodes: string[];
  /** Payment processing timeout in milliseconds (default: 30000) */
  paymentTimeoutMs: number;
  /** Number of retry attempts for event publication failures (default: 3) */
  eventRetryAttempts: number;
  /** Number of retry attempts for cart-clear after successful order (default: 3) */
  cartClearRetryAttempts: number;
}

export const defaultCartConfig: CartConfig = {
  maxItemsPerCart: 50,
  maxQuantityPerItem: 10,
  maxQuantityAbsolute: 99,
  deliveryOptions: [
    { id: 'standard', name: 'Standard', minDays: 5, maxDays: 7, cost: 0 },
    { id: 'express', name: 'Express', minDays: 1, maxDays: 3, cost: 49 },
  ],
  expressFee: 49,
  highRtoPincodes: ['110001', '400001', '560001'],
  paymentTimeoutMs: 30000,
  eventRetryAttempts: 3,
  cartClearRetryAttempts: 3,
};
