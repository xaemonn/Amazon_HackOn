// src/application/cart/CheckoutService.ts

import { randomUUID } from 'crypto';

import type { Address } from '../../domain/account/Address.js';
import type { ICustomerRepository } from '../../domain/account/ICustomerRepository.js';
import type { PaymentMethod } from '../../domain/account/PaymentMethod.js';
import type { CartConfig, DeliveryOption } from '../../domain/cart/CartConfig.js';
import type { ICartRepository } from '../../domain/cart/ICartRepository.js';
import type { IOrderMetadataRepository, OrderMetadata } from '../../domain/cart/IOrderMetadataRepository.js';
import type { IPaymentProvider } from '../../domain/cart/IPaymentProvider.js';
import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { IOrderRepository } from '../../domain/ordering/IOrderRepository.js';
import type { Order, PaymentType } from '../../domain/ordering/Order.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import type { IEventBus } from '../../domain/shared/IEventBus.js';
import type { ICartService } from './CartService.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaceOrderParams {
  addressId: string;
  deliveryOptionId: string;
  paymentMethodId: string; // or 'cod'
}

export interface StockValidationResult {
  valid: boolean;
  unavailableItems: Array<{
    variantId: string;
    productName: string;
    requestedQty: number;
    availableStock: number;
  }>;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  estimatedDelivery?: { min: Date; max: Date };
  items?: OrderItemSummary[];
  error?: string;
  failureReason?: string;
}

export interface OrderItemSummary {
  productName: string;
  productImage: string;
  quantity: number;
  unitPrice: number;
}

export interface PaymentMethodView {
  id: string;
  type: 'upi' | 'card' | 'cod';
  label: string;
  isPreferred: boolean;
}

export interface ICheckoutService {
  getAddresses(customerId: string): Promise<Address[]>;
  getDeliveryOptions(): DeliveryOption[];
  getPaymentMethods(customerId: string): Promise<PaymentMethodView[]>;
  isHighRtoPincode(pincode: string): boolean;
  validateStock(customerId: string): Promise<StockValidationResult>;
  placeOrder(customerId: string, params: PlaceOrderParams): Promise<PlaceOrderResult>;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class CheckoutService implements ICheckoutService {
  constructor(
    private readonly cartService: ICartService,
    private readonly cartRepo: ICartRepository,
    private readonly paymentProvider: IPaymentProvider,
    private readonly orderRepo: IOrderRepository,
    private readonly orderMetadataRepo: IOrderMetadataRepository,
    private readonly eventBus: IEventBus,
    private readonly variantRepo: IVariantRepository,
    private readonly config: CartConfig,
    private readonly customerRepo: ICustomerRepository,
  ) {}

  // ── getAddresses ────────────────────────────────────────────────────────────

  async getAddresses(customerId: string): Promise<Address[]> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      return [];
    }

    // Sort: isDefault first, then by createdAt descending
    return [...customer.addresses].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  // ── getDeliveryOptions ──────────────────────────────────────────────────────

  getDeliveryOptions(): DeliveryOption[] {
    return this.config.deliveryOptions;
  }

  // ── getPaymentMethods ───────────────────────────────────────────────────────

  async getPaymentMethods(customerId: string): Promise<PaymentMethodView[]> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      return [this.buildCodView(false)];
    }

    const prepaidMethods: PaymentMethodView[] = customer.paymentMethods
      .filter((pm): pm is PaymentMethod & { type: 'upi' | 'card' } =>
        pm.type === 'upi' || pm.type === 'card',
      )
      .map((pm) => ({
        id: pm.id,
        type: pm.type,
        label: this.buildPaymentLabel(pm),
        isPreferred: pm.isPreferred,
      }));

    // Determine if any prepaid method is preferred
    const hasPreferredPrepaid = prepaidMethods.some((m) => m.isPreferred);

    // COD option — preferred only if no prepaid method is preferred
    const codView = this.buildCodView(!hasPreferredPrepaid);

    // Order: prepaid first, then COD
    return [...prepaidMethods, codView];
  }

  // ── isHighRtoPincode ────────────────────────────────────────────────────────

  isHighRtoPincode(pincode: string): boolean {
    if (!this.config.highRtoPincodes || this.config.highRtoPincodes.length === 0) {
      return false;
    }
    return this.config.highRtoPincodes.includes(pincode);
  }

  // ── validateStock ───────────────────────────────────────────────────────────

  async validateStock(customerId: string): Promise<StockValidationResult> {
    const cartView = await this.cartService.getCart(customerId);
    const unavailableItems: StockValidationResult['unavailableItems'] = [];

    for (const item of cartView.items) {
      const variant = await this.variantRepo.findById(item.variantId);
      const availableStock = variant?.stock ?? 0;

      if (item.quantity > availableStock) {
        unavailableItems.push({
          variantId: item.variantId,
          productName: item.productName,
          requestedQty: item.quantity,
          availableStock,
        });
      }
    }

    return {
      valid: unavailableItems.length === 0,
      unavailableItems,
    };
  }

  // ── placeOrder ──────────────────────────────────────────────────────────────

  async placeOrder(customerId: string, params: PlaceOrderParams): Promise<PlaceOrderResult> {
    // 1. Validate stock
    const stockResult = await this.validateStock(customerId);
    if (!stockResult.valid) {
      return {
        success: false,
        error: 'Some items have insufficient stock',
        failureReason: 'STOCK_VALIDATION_FAILED',
      };
    }

    // 2. Check empty cart
    const cartView = await this.cartService.getCart(customerId);
    if (cartView.items.length === 0) {
      return {
        success: false,
        error: 'Cart is empty',
        failureReason: 'EMPTY_CART',
      };
    }

    // 3. Look up address
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      return {
        success: false,
        error: 'Customer not found',
        failureReason: 'CUSTOMER_NOT_FOUND',
      };
    }

    const address = customer.addresses.find((a) => a.id === params.addressId);
    if (!address) {
      return {
        success: false,
        error: 'Address not found',
        failureReason: 'ADDRESS_NOT_FOUND',
      };
    }

    // 4. Look up delivery option
    const deliveryOption = this.config.deliveryOptions.find(
      (opt) => opt.id === params.deliveryOptionId,
    );
    if (!deliveryOption) {
      return {
        success: false,
        error: 'Delivery option not found',
        failureReason: 'DELIVERY_OPTION_NOT_FOUND',
      };
    }

    // 5. Determine payment type
    const isCod = params.paymentMethodId === 'cod';
    const paymentType: PaymentType = isCod ? 'cod' : 'prepaid';

    // 6. Process payment for prepaid orders
    if (!isCod) {
      const paymentMethod = customer.paymentMethods.find(
        (pm) => pm.id === params.paymentMethodId,
      );
      if (!paymentMethod) {
        return {
          success: false,
          error: 'Payment method not found',
          failureReason: 'PAYMENT_METHOD_NOT_FOUND',
        };
      }

      const total = cartView.subtotal + deliveryOption.cost;

      try {
        const paymentResult = await this.withTimeout(
          this.paymentProvider.processPayment(total, 'INR', paymentMethod),
          this.config.paymentTimeoutMs,
        );

        if (!paymentResult.success) {
          return {
            success: false,
            error: 'Payment failed',
            failureReason: paymentResult.failureReason ?? 'PAYMENT_DECLINED',
          };
        }
      } catch {
        // Timeout or unexpected error
        return {
          success: false,
          error: 'Payment processing failed. Please try again.',
          failureReason: 'PAYMENT_TIMEOUT',
        };
      }
    }

    // 7. Create Order + OrderItems
    const orderId = randomUUID();
    const now = new Date();

    const orderItems: OrderItem[] = cartView.items.map((item) => ({
      id: randomUUID(),
      orderId,
      customerId,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      productImage: item.productImage,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      deliveryDate: this.computeDeliveryDate(now, deliveryOption.maxDays),
      deliveryStatus: 'pending' as const,
      refundStatus: {
        code: 'none' as const,
        amount: null,
        currency: null,
        issuedAt: null,
      },
    }));

    const order: Order = {
      id: orderId,
      customerId,
      placedDate: now,
      status: 'placed',
      paymentType,
      items: orderItems,
    };

    // 8. Persist Order
    try {
      await this.orderRepo.save(order);
    } catch {
      return {
        success: false,
        error: 'Could not place order. Please try again.',
        failureReason: 'ORDER_PERSISTENCE_FAILED',
      };
    }

    // 9. Compute and persist highRtoFlag
    const highRtoFlag = this.computeHighRtoFlag(address.pincode, paymentType);
    const metadata: OrderMetadata = {
      orderId,
      highRtoFlag,
      createdAt: now,
    };

    try {
      await this.orderMetadataRepo.save(metadata);
    } catch {
      // Non-blocking: order is already persisted, log and continue
    }

    // 10. Clear cart with retry
    await this.retryOperation(
      () => this.cartService.clearCart(customerId),
      this.config.cartClearRetryAttempts,
    );

    // 11. Publish OrderPlaced event with retry
    const orderItemIds = orderItems.map((item) => item.id);
    await this.retryOperation(
      () =>
        this.eventBus.publish({
          eventId: randomUUID(),
          eventType: 'OrderPlaced',
          timestamp: now,
          payload: {
            orderId,
            customerId,
            paymentType,
            orderItemIds,
            highRtoFlag,
          },
        }),
      this.config.eventRetryAttempts,
    );

    // 12. Return success result
    const estimatedDelivery = {
      min: this.computeDeliveryDate(now, deliveryOption.minDays),
      max: this.computeDeliveryDate(now, deliveryOption.maxDays),
    };

    const items: OrderItemSummary[] = cartView.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    return {
      success: true,
      orderId,
      estimatedDelivery,
      items,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildCodView(isPreferred: boolean): PaymentMethodView {
    return {
      id: 'cod',
      type: 'cod',
      label: 'Cash on Delivery',
      isPreferred,
    };
  }

  private buildPaymentLabel(pm: PaymentMethod): string {
    if (pm.type === 'upi') {
      return `UPI: ${pm.upiId}`;
    }
    if (pm.type === 'card') {
      return `Card: ****${pm.lastFour}`;
    }
    return 'Cash on Delivery';
  }

  private computeHighRtoFlag(pincode: string, paymentType: PaymentType): boolean {
    if (!this.config.highRtoPincodes || this.config.highRtoPincodes.length === 0) {
      return false;
    }
    return this.config.highRtoPincodes.includes(pincode) && paymentType === 'cod';
  }

  private computeDeliveryDate(from: Date, days: number): Date {
    const date = new Date(from);
    date.setDate(date.getDate() + days);
    return date;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Payment processing timed out'));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async retryOperation(
    operation: () => Promise<void>,
    maxAttempts: number,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await operation();
        return;
      } catch {
        if (attempt === maxAttempts) {
          // Exhausted retries — log and swallow (non-blocking per spec)
          return;
        }
      }
    }
  }
}
