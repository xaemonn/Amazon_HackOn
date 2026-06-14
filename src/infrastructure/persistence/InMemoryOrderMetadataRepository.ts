import type { OrderMetadata, IOrderMetadataRepository } from '../../domain/cart/IOrderMetadataRepository.js';

export class InMemoryOrderMetadataRepository implements IOrderMetadataRepository {
  private readonly store: Map<string, OrderMetadata>;

  constructor(initial: OrderMetadata[] = []) {
    this.store = new Map(initial.map((m) => [m.orderId, m]));
  }

  async save(metadata: OrderMetadata): Promise<void> {
    this.store.set(metadata.orderId, metadata);
  }

  async findByOrderId(orderId: string): Promise<OrderMetadata | null> {
    return this.store.get(orderId) ?? null;
  }
}
