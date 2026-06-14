import type { OrderItem } from './OrderItem.js';

export type OrderStatus = 'placed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type PaymentType = 'prepaid' | 'cod';

export interface Order {
  id: string;
  customerId: string;
  placedDate: Date;
  status: OrderStatus;
  paymentType: PaymentType;
  items: OrderItem[];
}
