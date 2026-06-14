import type { Condition } from '../catalog/ProductVariant.js';

/**
 * CartItem value object — a line item in the shopping cart referencing a ProductVariant.
 * Captures a snapshot of variant details at the time of addition.
 */
export interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;      // snapshot from ProductVariant.price
  condition: Condition;   // 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New'
  quantity: number;       // 1–10
}
