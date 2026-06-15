import type { Order } from './Order.js';
import type { OrderItem } from './OrderItem.js';
import type { RefundStatus } from './RefundStatus.js';

export interface IOrderRepository {
  save(order: Order): Promise<void>;
  findById(orderId: string): Promise<Order | null>;
  findByCustomerId(customerId: string): Promise<Order[]>;
  findOrderItemById(id: string): Promise<{ order: Order; item: OrderItem } | null>;
  updateOrderItemRefundStatus(orderItemId: string, refundStatus: RefundStatus): Promise<void>;
  /** Remove all orders belonging to a customer. Returns the number deleted. */
  deleteByCustomerId(customerId: string): Promise<number>;
}
