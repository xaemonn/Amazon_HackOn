import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { RefundStatus } from '../../domain/ordering/RefundStatus.js';
import type { IOrderRepository } from '../../domain/ordering/IOrderRepository.js';

export class InMemoryOrderRepository implements IOrderRepository {
  private readonly store: Map<string, Order>;

  constructor(initialOrders: Order[] = []) {
    this.store = new Map(initialOrders.map((o) => [o.id, o]));
  }

  async save(order: Order): Promise<void> {
    this.store.set(order.id, order);
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.store.get(orderId) ?? null;
  }

  async findByCustomerId(customerId: string): Promise<Order[]> {
    return Array.from(this.store.values()).filter(
      (o) => o.customerId === customerId,
    );
  }

  async deleteByCustomerId(customerId: string): Promise<number> {
    let deleted = 0;
    for (const [id, order] of this.store) {
      if (order.customerId === customerId) {
        this.store.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async findOrderItemById(
    id: string,
  ): Promise<{ order: Order; item: OrderItem } | null> {
    for (const order of this.store.values()) {
      const item = order.items.find((i) => i.id === id);
      if (item) {
        return { order, item };
      }
    }
    return null;
  }

  async updateOrderItemRefundStatus(
    orderItemId: string,
    refundStatus: RefundStatus,
  ): Promise<void> {
    for (const order of this.store.values()) {
      const item = order.items.find((i) => i.id === orderItemId);
      if (item) {
        item.refundStatus = refundStatus;
        return;
      }
    }
    console.warn(
      `[InMemoryOrderRepository] updateOrderItemRefundStatus: item not found — id="${orderItemId}". No-op.`,
    );
  }
}
