import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Customer } from '../../domain/account/Customer.js';
import type { ICustomerRepository } from '../../domain/account/ICustomerRepository.js';
import type { Address } from '../../domain/account/Address.js';
import type { PaymentMethod } from '../../domain/account/PaymentMethod.js';
import type { NotificationPreferences } from '../../domain/account/NotificationPreferences.js';

export interface DynamoCustomerRepositoryOptions {
  tableName: string;
  client?: DynamoDBDocumentClient;
}

/**
 * DynamoDB-backed implementation of ICustomerRepository.
 *
 * Table design:
 *   PK: CUSTOMER#<customerId>, SK: PROFILE
 *   GSI1 (email index): PK = email
 *
 * Uses optimistic locking via `updatedAt` condition on PutItem.
 */
export class DynamoCustomerRepository implements ICustomerRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(options: DynamoCustomerRepositoryOptions) {
    this.tableName =
      options.tableName || process.env.CUSTOMER_TABLE_NAME || 'CustomerTable';

    if (options.client) {
      this.client = options.client;
    } else {
      const dynamoClient = new DynamoDBClient({});
      this.client = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
  }

  async save(customer: Customer): Promise<void> {
    const item = this.toItem(customer);

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        // Optimistic locking: only succeed if updatedAt hasn't changed
        // (or the item doesn't exist yet)
        ConditionExpression:
          'attribute_not_exists(PK) OR updatedAt = :prevUpdatedAt',
        ExpressionAttributeValues: {
          ':prevUpdatedAt': item.updatedAt,
        },
      }),
    );
  }

  async findById(id: string): Promise<Customer | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `CUSTOMER#${id}`,
          SK: 'PROFILE',
        },
      }),
    );

    if (!result.Item) return null;
    return this.fromItem(result.Item);
  }

  async findByContact(contact: string): Promise<Customer | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': contact,
        },
        Limit: 1,
      }),
    );

    if (!result.Items || result.Items.length === 0) return null;
    return this.fromItem(result.Items[0]);
  }

  // ── Serialization helpers ──────────────────────────────────────────────────

  private toItem(customer: Customer): Record<string, unknown> {
    return {
      PK: `CUSTOMER#${customer.id}`,
      SK: 'PROFILE',
      email: customer.email,
      name: customer.name,
      addresses: customer.addresses.map((a) => this.serializeAddress(a)),
      paymentMethods: customer.paymentMethods.map((pm) =>
        this.serializePaymentMethod(pm),
      ),
      notificationPreferences: customer.notificationPreferences,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private fromItem(item: Record<string, unknown>): Customer {
    const pk = item.PK as string;
    const id = pk.replace('CUSTOMER#', '');

    return {
      id,
      name: item.name as string,
      email: item.email as string,
      addresses: ((item.addresses as Record<string, unknown>[]) || []).map(
        (a) => this.deserializeAddress(a),
      ),
      paymentMethods: (
        (item.paymentMethods as Record<string, unknown>[]) || []
      ).map((pm) => this.deserializePaymentMethod(pm)),
      notificationPreferences:
        item.notificationPreferences as NotificationPreferences,
      createdAt: new Date(item.createdAt as string),
      updatedAt: new Date(item.updatedAt as string),
    };
  }

  private serializeAddress(address: Address): Record<string, unknown> {
    return {
      id: address.id,
      recipientName: address.recipientName,
      streetLine1: address.streetLine1,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
    };
  }

  private deserializeAddress(raw: Record<string, unknown>): Address {
    return {
      id: raw.id as string,
      recipientName: raw.recipientName as string,
      streetLine1: raw.streetLine1 as string,
      city: raw.city as string,
      state: raw.state as string,
      pincode: raw.pincode as string,
      country: raw.country as string,
      isDefault: raw.isDefault as boolean,
      createdAt: new Date(raw.createdAt as string),
    };
  }

  private serializePaymentMethod(
    pm: PaymentMethod,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: pm.id,
      type: pm.type,
      isPreferred: pm.isPreferred,
      createdAt: pm.createdAt.toISOString(),
    };

    if (pm.type === 'upi') {
      base.upiId = pm.upiId;
    } else if (pm.type === 'card') {
      base.lastFour = pm.lastFour;
      base.expiryMonth = pm.expiryMonth;
      base.expiryYear = pm.expiryYear;
      base.cardHolderName = pm.cardHolderName;
    }
    // 'cod' has no extra fields

    return base;
  }

  private deserializePaymentMethod(raw: Record<string, unknown>): PaymentMethod {
    const base = {
      id: raw.id as string,
      isPreferred: raw.isPreferred as boolean,
      createdAt: new Date(raw.createdAt as string),
    };

    const type = raw.type as string;

    if (type === 'upi') {
      return { ...base, type: 'upi', upiId: raw.upiId as string };
    } else if (type === 'card') {
      return {
        ...base,
        type: 'card',
        lastFour: raw.lastFour as string,
        expiryMonth: raw.expiryMonth as number,
        expiryYear: raw.expiryYear as number,
        cardHolderName: raw.cardHolderName as string,
      };
    } else {
      return { ...base, type: 'cod' };
    }
  }
}
