// src/application/cart/CheckoutService.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { Address } from '../../domain/account/Address.js';
import type { Customer } from '../../domain/account/Customer.js';
import type { ICustomerRepository } from '../../domain/account/ICustomerRepository.js';
import type { PaymentMethod } from '../../domain/account/PaymentMethod.js';
import type { CartConfig } from '../../domain/cart/CartConfig.js';
import type { ICartRepository } from '../../domain/cart/ICartRepository.js';
import type { IOrderMetadataRepository, OrderMetadata } from '../../domain/cart/IOrderMetadataRepository.js';
import type { IPaymentProvider, PaymentResult } from '../../domain/cart/IPaymentProvider.js';
import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { IOrderRepository } from '../../domain/ordering/IOrderRepository.js';
import type { IEventBus, DomainEvent } from '../../domain/shared/IEventBus.js';
import { ProductVariant } from '../../domain/catalog/ProductVariant.js';
import { CheckoutService } from './CheckoutService.js';
import type { ICartService, CartView } from './CartService.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 'addr-1',
    recipientName: 'Test User',
    streetLine1: '123 Test St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    country: 'India',
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    name: 'Test Customer',
    email: 'test@example.com',
    addresses: [makeAddress({ id: 'addr-1', isDefault: true })],
    paymentMethods: [],
    notificationPreferences: { email: true, sms: false, push: false },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeCartView(overrides: Partial<CartView> = {}): CartView {
  return {
    items: [
      {
        variantId: 'var-1',
        productId: 'prod-1',
        productName: 'Test Product',
        productImage: 'https://img.test/1.jpg',
        unitPrice: 100,
        condition: 'New' as const,
        quantity: 2,
      },
    ],
    saveForLater: [],
    subtotal: 200,
    itemCount: 2,
    canCheckout: true,
    ...overrides,
  };
}

const defaultConfig: CartConfig = {
  maxItemsPerCart: 50,
  maxQuantityPerItem: 10,
  maxQuantityAbsolute: 99,
  deliveryOptions: [
    { id: 'standard', name: 'Standard', minDays: 5, maxDays: 7, cost: 0 },
    { id: 'express', name: 'Express', minDays: 1, maxDays: 3, cost: 49 },
  ],
  expressFee: 49,
  highRtoPincodes: ['110001', '400001', '560001'],
  paymentTimeoutMs: 30000,
  eventRetryAttempts: 3,
  cartClearRetryAttempts: 3,
};

// ── Mock factories ────────────────────────────────────────────────────────────

function createMocks() {
  const cartService: ICartService = {
    getCart: vi.fn().mockResolvedValue(makeCartView()),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    moveToSaveForLater: vi.fn(),
    moveBackToCart: vi.fn(),
    clearCart: vi.fn().mockResolvedValue(undefined),
  };

  const cartRepo: ICartRepository = {
    findByCustomerId: vi.fn(),
    save: vi.fn(),
  };

  const paymentProvider: IPaymentProvider = {
    processPayment: vi.fn().mockResolvedValue({ success: true, transactionId: 'mock-txn-200-INR' }),
  };

  const orderRepo: IOrderRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findByCustomerId: vi.fn(),
    findOrderItemById: vi.fn(),
    updateOrderItemRefundStatus: vi.fn(),
  };

  const orderMetadataRepo: IOrderMetadataRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    findByOrderId: vi.fn(),
  };

  const eventBus: IEventBus = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const variantRepo: IVariantRepository = {
    findById: vi.fn().mockResolvedValue(
      new ProductVariant({ id: 'var-1', productId: 'prod-1', condition: 'New', price: 100, stock: 10 }),
    ),
    findByProductId: vi.fn(),
    save: vi.fn(),
    findByCondition: vi.fn(),
    findBySourceReturnId: vi.fn(),
  };

  const customerRepo: ICustomerRepository = {
    findById: vi.fn().mockResolvedValue(makeCustomer()),
    save: vi.fn(),
    findByContact: vi.fn(),
  };

  return {
    cartService,
    cartRepo,
    paymentProvider,
    orderRepo,
    orderMetadataRepo,
    eventBus,
    variantRepo,
    customerRepo,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CheckoutService', () => {
  let service: CheckoutService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new CheckoutService(
      mocks.cartService,
      mocks.cartRepo,
      mocks.paymentProvider,
      mocks.orderRepo,
      mocks.orderMetadataRepo,
      mocks.eventBus,
      mocks.variantRepo,
      defaultConfig,
      mocks.customerRepo,
    );
  });

  // ── getAddresses ────────────────────────────────────────────────────────────

  describe('getAddresses', () => {
    it('returns addresses sorted by isDefault first then createdAt descending', async () => {
      const addresses: Address[] = [
        makeAddress({ id: 'a1', isDefault: false, createdAt: new Date('2024-01-01') }),
        makeAddress({ id: 'a2', isDefault: true, createdAt: new Date('2024-02-01') }),
        makeAddress({ id: 'a3', isDefault: false, createdAt: new Date('2024-03-01') }),
      ];

      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ addresses }),
      );

      const result = await service.getAddresses('cust-1');

      expect(result[0].id).toBe('a2'); // default first
      expect(result[1].id).toBe('a3'); // then most recent
      expect(result[2].id).toBe('a1'); // then oldest
    });

    it('returns empty array when customer not found', async () => {
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(null);

      const result = await service.getAddresses('nonexistent');
      expect(result).toEqual([]);
    });
  });

  // ── getDeliveryOptions ──────────────────────────────────────────────────────

  describe('getDeliveryOptions', () => {
    it('returns configured delivery options', () => {
      const options = service.getDeliveryOptions();

      expect(options).toHaveLength(2);
      expect(options[0].id).toBe('standard');
      expect(options[1].id).toBe('express');
    });
  });

  // ── getPaymentMethods ───────────────────────────────────────────────────────

  describe('getPaymentMethods', () => {
    it('returns prepaid methods before COD', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-1', type: 'upi', upiId: 'user@upi', isPreferred: true, createdAt: new Date() },
        { id: 'pm-2', type: 'card', lastFour: '1234', expiryMonth: 12, expiryYear: 2025, cardHolderName: 'Test', isPreferred: false, createdAt: new Date() },
      ];

      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );

      const result = await service.getPaymentMethods('cust-1');

      expect(result[0].type).toBe('upi');
      expect(result[1].type).toBe('card');
      expect(result[2].type).toBe('cod');
    });

    it('sets COD as preferred when no prepaid method is preferred', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-1', type: 'upi', upiId: 'user@upi', isPreferred: false, createdAt: new Date() },
      ];

      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );

      const result = await service.getPaymentMethods('cust-1');

      expect(result.find((m) => m.type === 'cod')?.isPreferred).toBe(true);
    });

    it('sets COD as not preferred when a prepaid method is preferred', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-1', type: 'upi', upiId: 'user@upi', isPreferred: true, createdAt: new Date() },
      ];

      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );

      const result = await service.getPaymentMethods('cust-1');

      expect(result.find((m) => m.type === 'cod')?.isPreferred).toBe(false);
      expect(result.find((m) => m.type === 'upi')?.isPreferred).toBe(true);
    });

    it('returns only COD when customer not found', async () => {
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(null);

      const result = await service.getPaymentMethods('nonexistent');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('cod');
      expect(result[0].isPreferred).toBe(false);
    });
  });

  // ── isHighRtoPincode ────────────────────────────────────────────────────────

  describe('isHighRtoPincode', () => {
    it('returns true for pincodes in the high RTO list', () => {
      expect(service.isHighRtoPincode('400001')).toBe(true);
      expect(service.isHighRtoPincode('110001')).toBe(true);
    });

    it('returns false for pincodes not in the list', () => {
      expect(service.isHighRtoPincode('999999')).toBe(false);
    });

    it('returns false when highRtoPincodes is empty', () => {
      const emptyConfig = { ...defaultConfig, highRtoPincodes: [] };
      const svc = new CheckoutService(
        mocks.cartService, mocks.cartRepo, mocks.paymentProvider,
        mocks.orderRepo, mocks.orderMetadataRepo, mocks.eventBus,
        mocks.variantRepo, emptyConfig, mocks.customerRepo,
      );
      expect(svc.isHighRtoPincode('400001')).toBe(false);
    });
  });

  // ── validateStock ───────────────────────────────────────────────────────────

  describe('validateStock', () => {
    it('returns valid when all items have sufficient stock', async () => {
      const result = await service.validateStock('cust-1');
      expect(result.valid).toBe(true);
      expect(result.unavailableItems).toHaveLength(0);
    });

    it('returns invalid when item quantity exceeds stock', async () => {
      vi.mocked(mocks.variantRepo.findById).mockResolvedValue(
        new ProductVariant({ id: 'var-1', productId: 'prod-1', condition: 'New', price: 100, stock: 1 }),
      );

      const result = await service.validateStock('cust-1');

      expect(result.valid).toBe(false);
      expect(result.unavailableItems).toHaveLength(1);
      expect(result.unavailableItems[0].variantId).toBe('var-1');
      expect(result.unavailableItems[0].requestedQty).toBe(2);
      expect(result.unavailableItems[0].availableStock).toBe(1);
    });

    it('returns invalid when variant not found (stock=0)', async () => {
      vi.mocked(mocks.variantRepo.findById).mockResolvedValue(null);

      const result = await service.validateStock('cust-1');

      expect(result.valid).toBe(false);
      expect(result.unavailableItems[0].availableStock).toBe(0);
    });
  });

  // ── placeOrder ──────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    const codParams = { addressId: 'addr-1', deliveryOptionId: 'standard', paymentMethodId: 'cod' };

    it('rejects order when stock validation fails', async () => {
      vi.mocked(mocks.variantRepo.findById).mockResolvedValue(
        new ProductVariant({ id: 'var-1', productId: 'prod-1', condition: 'New', price: 100, stock: 0 }),
      );

      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('STOCK_VALIDATION_FAILED');
    });

    it('rejects order when cart is empty', async () => {
      vi.mocked(mocks.cartService.getCart).mockResolvedValue(
        makeCartView({ items: [], subtotal: 0, itemCount: 0, canCheckout: false }),
      );

      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('EMPTY_CART');
    });

    it('places a COD order successfully', async () => {
      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
      expect(result.estimatedDelivery).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(mocks.paymentProvider.processPayment).not.toHaveBeenCalled();
      expect(mocks.orderRepo.save).toHaveBeenCalled();
      expect(mocks.cartService.clearCart).toHaveBeenCalledWith('cust-1');
      expect(mocks.eventBus.publish).toHaveBeenCalled();
    });

    it('places a prepaid order with successful payment', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-upi', type: 'upi', upiId: 'user@upi', isPreferred: true, createdAt: new Date() },
      ];
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );

      const params = { addressId: 'addr-1', deliveryOptionId: 'standard', paymentMethodId: 'pm-upi' };
      const result = await service.placeOrder('cust-1', params);

      expect(result.success).toBe(true);
      expect(mocks.paymentProvider.processPayment).toHaveBeenCalledWith(200, 'INR', paymentMethods[0]);
    });

    it('fails when payment is declined', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-upi', type: 'upi', upiId: 'fail@test', isPreferred: true, createdAt: new Date() },
      ];
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );
      vi.mocked(mocks.paymentProvider.processPayment).mockResolvedValue({
        success: false,
        failureReason: 'Payment declined',
      });

      const params = { addressId: 'addr-1', deliveryOptionId: 'standard', paymentMethodId: 'pm-upi' };
      const result = await service.placeOrder('cust-1', params);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('Payment declined');
      expect(mocks.orderRepo.save).not.toHaveBeenCalled();
    });

    it('fails gracefully on payment timeout', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-upi', type: 'upi', upiId: 'user@upi', isPreferred: true, createdAt: new Date() },
      ];
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );

      // Use a short timeout for testing
      const quickConfig = { ...defaultConfig, paymentTimeoutMs: 10 };
      const svc = new CheckoutService(
        mocks.cartService, mocks.cartRepo, mocks.paymentProvider,
        mocks.orderRepo, mocks.orderMetadataRepo, mocks.eventBus,
        mocks.variantRepo, quickConfig, mocks.customerRepo,
      );

      vi.mocked(mocks.paymentProvider.processPayment).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, transactionId: 'late' }), 100)),
      );

      const params = { addressId: 'addr-1', deliveryOptionId: 'standard', paymentMethodId: 'pm-upi' };
      const result = await svc.placeOrder('cust-1', params);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('PAYMENT_TIMEOUT');
      expect(mocks.orderRepo.save).not.toHaveBeenCalled();
    });

    it('preserves cart when order persistence fails', async () => {
      vi.mocked(mocks.orderRepo.save).mockRejectedValue(new Error('DB error'));

      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('ORDER_PERSISTENCE_FAILED');
      expect(mocks.cartService.clearCart).not.toHaveBeenCalled();
      expect(mocks.eventBus.publish).not.toHaveBeenCalled();
    });

    it('computes highRtoFlag=true for COD + high-RTO pincode', async () => {
      // Default address pincode is 400001 which is in highRtoPincodes
      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);

      const savedMetadata = vi.mocked(mocks.orderMetadataRepo.save).mock.calls[0][0] as OrderMetadata;
      expect(savedMetadata.highRtoFlag).toBe(true);

      // Check event payload
      const publishedEvent = vi.mocked(mocks.eventBus.publish).mock.calls[0][0] as DomainEvent;
      expect(publishedEvent.payload.highRtoFlag).toBe(true);
    });

    it('computes highRtoFlag=false for prepaid + high-RTO pincode', async () => {
      const paymentMethods: PaymentMethod[] = [
        { id: 'pm-upi', type: 'upi', upiId: 'user@upi', isPreferred: true, createdAt: new Date() },
      ];
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ paymentMethods }),
      );

      const params = { addressId: 'addr-1', deliveryOptionId: 'standard', paymentMethodId: 'pm-upi' };
      const result = await service.placeOrder('cust-1', params);

      expect(result.success).toBe(true);

      const savedMetadata = vi.mocked(mocks.orderMetadataRepo.save).mock.calls[0][0] as OrderMetadata;
      expect(savedMetadata.highRtoFlag).toBe(false);
    });

    it('computes highRtoFlag=false for COD + non-RTO pincode', async () => {
      const addresses = [makeAddress({ id: 'addr-1', isDefault: true, pincode: '999999' })];
      vi.mocked(mocks.customerRepo.findById).mockResolvedValue(
        makeCustomer({ addresses }),
      );

      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);

      const savedMetadata = vi.mocked(mocks.orderMetadataRepo.save).mock.calls[0][0] as OrderMetadata;
      expect(savedMetadata.highRtoFlag).toBe(false);
    });

    it('retries event publication on failure', async () => {
      vi.mocked(mocks.eventBus.publish)
        .mockRejectedValueOnce(new Error('Bus error'))
        .mockRejectedValueOnce(new Error('Bus error'))
        .mockResolvedValueOnce(undefined);

      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);
      expect(mocks.eventBus.publish).toHaveBeenCalledTimes(3);
    });

    it('retries cart clear on failure', async () => {
      vi.mocked(mocks.cartService.clearCart)
        .mockRejectedValueOnce(new Error('Clear error'))
        .mockResolvedValueOnce(undefined);

      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);
      expect(mocks.cartService.clearCart).toHaveBeenCalledTimes(2);
    });

    it('publishes OrderPlaced event with correct payload', async () => {
      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);

      const publishedEvent = vi.mocked(mocks.eventBus.publish).mock.calls[0][0] as DomainEvent;
      expect(publishedEvent.eventType).toBe('OrderPlaced');
      expect(publishedEvent.payload.customerId).toBe('cust-1');
      expect(publishedEvent.payload.paymentType).toBe('cod');
      expect(publishedEvent.payload.orderId).toBe(result.orderId);
      expect(Array.isArray(publishedEvent.payload.orderItemIds)).toBe(true);
    });

    it('returns error when address not found', async () => {
      const params = { addressId: 'nonexistent', deliveryOptionId: 'standard', paymentMethodId: 'cod' };
      const result = await service.placeOrder('cust-1', params);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('ADDRESS_NOT_FOUND');
    });

    it('returns error when delivery option not found', async () => {
      const params = { addressId: 'addr-1', deliveryOptionId: 'nonexistent', paymentMethodId: 'cod' };
      const result = await service.placeOrder('cust-1', params);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('DELIVERY_OPTION_NOT_FOUND');
    });

    it('creates Order with correct structure', async () => {
      const result = await service.placeOrder('cust-1', codParams);

      expect(result.success).toBe(true);

      const savedOrder = vi.mocked(mocks.orderRepo.save).mock.calls[0][0];
      expect(savedOrder.status).toBe('placed');
      expect(savedOrder.paymentType).toBe('cod');
      expect(savedOrder.customerId).toBe('cust-1');
      expect(savedOrder.items).toHaveLength(1);
      expect(savedOrder.items[0].deliveryStatus).toBe('pending');
      expect(savedOrder.items[0].refundStatus).toEqual({
        code: 'none',
        amount: null,
        currency: null,
        issuedAt: null,
      });
    });
  });
});
