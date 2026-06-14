/**
 * OrderMetadata — stores cart/checkout-specific metadata (e.g. high-RTO flag)
 * without modifying the shared Order entity from the ordering domain.
 */
export interface OrderMetadata {
  orderId: string;
  highRtoFlag: boolean;
  createdAt: Date;
}

/**
 * IOrderMetadataRepository — persistence interface for OrderMetadata records.
 * Implementations: InMemoryOrderMetadataRepository (demo), DynamoDB adapter (stretch).
 */
export interface IOrderMetadataRepository {
  save(metadata: OrderMetadata): Promise<void>;
  findByOrderId(orderId: string): Promise<OrderMetadata | null>;
}
