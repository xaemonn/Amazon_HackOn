import type { RefundStatus } from './RefundStatus.js';

export interface OrderItem {
  id: string;
  orderId: string;
  customerId: string;
  productId: string;
  variantId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  deliveryDate: Date;
  deliveryStatus: 'pending' | 'shipped' | 'delivered' | 'returned';
  refundStatus: RefundStatus;
}
