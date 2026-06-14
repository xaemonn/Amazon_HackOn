import type { Condition } from '../catalog/ProductVariant.js';

/**
 * SaveForLaterItem value object — an item parked by the customer for future consideration.
 * Similar to CartItem but without quantity and with a savedAt timestamp.
 */
export interface SaveForLaterItem {
  variantId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  condition: Condition;
  savedAt: Date;
}
