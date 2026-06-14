import {
  DynamoDBClient,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Order } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { RefundStatus } from '../../domain/ordering/RefundStatus.js';
import type { IOrderRepository } from '../../domain/ordering/IOrderRepository.js';

export interface DynamoOrderRepositoryOptions {
  ordersTableName: string;
  orderItemsTableName: string;
  client?: DynamoDBDocumentClient;
}

/**
 * DynamoDB implementation of IOrderRepository.
 *
 * Table design:
 * - Orders table: PK = `ORDER#<orderId>`, SK = `META`; GSI1: customerId (PK) + placedDate (SK)
 * - OrderItems table: PK = `ORDER#<orderId>`, SK = `ITEM#<orderItemId>`; GSI1: orderItemId (PK)
 */
export class DynamoOrderRepository implements IOrderRepository {
  private readonly client: DynamoDBDocumentClient;
  private readonly ordersTableName: string;
  private readonly orderItemsTableName: string;

  constructor(options: DynamoOrderRepositoryOptions) {
    this.ordersTableName =
      options.ordersTableName || process.env.ORDERS_TABLE_NAME || 'Orders';
    this.orderItemsTableName =
      options.orderItemsTableName ||
      process.env.ORDER_ITEMS_TABLE_NAME ||
      'OrderItems';
    this.client =
      options.client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  async save(order: Order): Promise<void> {
    const transactItems = [];

    // Write the order meta record
    transactItems.push({
      Put: {
        TableName: this.ordersTableName,
        Item: {
          PK: `ORDER#${order.id}`,
          SK: 'META',
          orderId: order.id,
          customerId: order.customerId,
          placedDate: order.placedDate.toISOString(),
          status: order.status,
          paymentType: order.paymentType,
        },
      },
    });

    // Write each order item as a separate record
    for (const item of order.items) {
      transactItems.push({
        Put: {
          TableName: this.orderItemsTableName,
          Item: {
            PK: `ORDER#${order.id}`,
            SK: `ITEM#${item.id}`,
            orderItemId: item.id,
            orderId: item.orderId,
            customerId: item.customerId,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            productImage: item.productImage,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            deliveryDate: item.deliveryDate.toISOString(),
            deliveryStatus: item.deliveryStatus,
            refundStatusCode: item.refundStatus.code,
            refundAmount: item.refundStatus.amount,
            refundCurrency: item.refundStatus.currency,
            refundIssuedAt: item.refundStatus.issuedAt?.toISOString() ?? null,
          },
        },
      });
    }

    // DynamoDB TransactWriteItems supports up to 100 items per transaction
    // For orders with many items, batch in groups of 100
    const batchSize = 100;
    for (let i = 0; i < transactItems.length; i += batchSize) {
      const batch = transactItems.slice(i, i + batchSize);
      await this.client.send(
        new TransactWriteCommand({ TransactItems: batch }),
      );
    }
  }

  async findById(orderId: string): Promise<Order | null> {
    // Get the order meta
    const metaResult = await this.client.send(
      new GetCommand({
        TableName: this.ordersTableName,
        Key: { PK: `ORDER#${orderId}`, SK: 'META' },
      }),
    );

    if (!metaResult.Item) return null;

    // Query all items for this order
    const itemsResult = await this.client.send(
      new QueryCommand({
        TableName: this.orderItemsTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `ORDER#${orderId}`,
          ':skPrefix': 'ITEM#',
        },
      }),
    );

    const items: OrderItem[] = (itemsResult.Items ?? []).map((item) =>
      this.mapToOrderItem(item),
    );

    return this.mapToOrder(metaResult.Item, items);
  }

  async findByCustomerId(customerId: string): Promise<Order[]> {
    // Query GSI1 on Orders table: customerId (PK), placedDate (SK) — sorted desc
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.ordersTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'customerId = :cid',
        ExpressionAttributeValues: {
          ':cid': customerId,
        },
        ScanIndexForward: false, // descending by placedDate
      }),
    );

    if (!result.Items || result.Items.length === 0) return [];

    // For each order meta, fetch the order items
    const orders: Order[] = [];
    for (const meta of result.Items) {
      const orderId = meta.orderId as string;
      const itemsResult = await this.client.send(
        new QueryCommand({
          TableName: this.orderItemsTableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `ORDER#${orderId}`,
            ':skPrefix': 'ITEM#',
          },
        }),
      );

      const items: OrderItem[] = (itemsResult.Items ?? []).map((item) =>
        this.mapToOrderItem(item),
      );

      orders.push(this.mapToOrder(meta, items));
    }

    return orders;
  }

  async findOrderItemById(
    orderItemId: string,
  ): Promise<{ order: Order; item: OrderItem } | null> {
    // Query GSI1 on OrderItems table: orderItemId (PK)
    const itemResult = await this.client.send(
      new QueryCommand({
        TableName: this.orderItemsTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'orderItemId = :itemId',
        ExpressionAttributeValues: {
          ':itemId': orderItemId,
        },
      }),
    );

    if (!itemResult.Items || itemResult.Items.length === 0) return null;

    const itemRecord = itemResult.Items[0];
    const item = this.mapToOrderItem(itemRecord);

    // Now fetch the full order
    const order = await this.findById(item.orderId);
    if (!order) return null;

    return { order, item };
  }

  async updateOrderItemRefundStatus(
    orderItemId: string,
    refundStatus: RefundStatus,
  ): Promise<void> {
    // First, find the item to get its PK/SK
    const itemResult = await this.client.send(
      new QueryCommand({
        TableName: this.orderItemsTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'orderItemId = :itemId',
        ExpressionAttributeValues: {
          ':itemId': orderItemId,
        },
      }),
    );

    if (!itemResult.Items || itemResult.Items.length === 0) {
      console.warn(
        `[DynamoOrderRepository] updateOrderItemRefundStatus: item not found — id="${orderItemId}". No-op.`,
      );
      return;
    }

    const record = itemResult.Items[0];
    const pk = record.PK as string;
    const sk = record.SK as string;

    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.orderItemsTableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression:
            'SET refundStatusCode = :code, refundAmount = :amount, refundCurrency = :currency, refundIssuedAt = :issuedAt',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: {
            ':code': refundStatus.code,
            ':amount': refundStatus.amount,
            ':currency': refundStatus.currency,
            ':issuedAt': refundStatus.issuedAt?.toISOString() ?? null,
          },
        }),
      );
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) {
        console.warn(
          `[DynamoOrderRepository] updateOrderItemRefundStatus: conditional check failed for item "${orderItemId}". No-op.`,
        );
        return;
      }
      throw error;
    }
  }

  // ── Private mapping helpers ──────────────────────────────────────────────

  private mapToOrder(
    meta: Record<string, unknown>,
    items: OrderItem[],
  ): Order {
    return {
      id: meta.orderId as string,
      customerId: meta.customerId as string,
      placedDate: new Date(meta.placedDate as string),
      status: meta.status as Order['status'],
      paymentType: meta.paymentType as Order['paymentType'],
      items,
    };
  }

  private mapToOrderItem(record: Record<string, unknown>): OrderItem {
    return {
      id: record.orderItemId as string,
      orderId: record.orderId as string,
      customerId: record.customerId as string,
      productId: record.productId as string,
      variantId: record.variantId as string,
      productName: record.productName as string,
      productImage: record.productImage as string,
      unitPrice: record.unitPrice as number,
      quantity: record.quantity as number,
      deliveryDate: new Date(record.deliveryDate as string),
      deliveryStatus: record.deliveryStatus as OrderItem['deliveryStatus'],
      refundStatus: {
        code: record.refundStatusCode as RefundStatus['code'],
        amount: (record.refundAmount as number | null) ?? null,
        currency: (record.refundCurrency as string | null) ?? null,
        issuedAt: record.refundIssuedAt
          ? new Date(record.refundIssuedAt as string)
          : null,
      },
    };
  }
}
