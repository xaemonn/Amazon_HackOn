import crypto from 'crypto';

import type { IAuthService, Customer as AuthCustomer, OrderItem as AuthOrderItem } from '../../domain/shared/IAuthService.js';
import type { ICustomerRepository } from '../../domain/account/ICustomerRepository.js';
import type { Customer } from '../../domain/account/Customer.js';
import { defaultAllEnabled } from '../../domain/account/NotificationPreferences.js';
import type { IOrderRepository } from '../../domain/ordering/IOrderRepository.js';
import type { IOtpStore } from '../../domain/identity/IOtpStore.js';
import { OtpInvalidError, OtpExpiredError, OtpLockedError } from '../../domain/identity/errors.js';
import type { AppConfig } from '../../infrastructure/config/index.js';
import type { IIdentityService } from './IIdentityService.js';

/**
 * RFC 5322 simplified email regex — covers the vast majority of valid email addresses.
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * E.164 phone number regex: +<country_code><number>, 2–15 digits after the +.
 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * IdentityService — implements both the application-layer OTP flow (IIdentityService)
 * and the domain-shared authentication contract (IAuthService) used by other modules.
 *
 * Responsibilities:
 *  - Validate contact format (email / E.164)
 *  - Send OTPs and manage the OTP lifecycle (expiry, lockout, attempt tracking)
 *  - Create Customer records on first sign-in
 *  - Issue and revoke sessions
 *  - Authenticate tokens and verify ownership for IAuthService consumers
 */
export class IdentityService implements IIdentityService, IAuthService {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly otpStore: IOtpStore,
    private readonly config: AppConfig,
  ) {}

  // ─── IIdentityService ────────────────────────────────────────────────────────

  async sendOtp(contact: string): Promise<{ otpSent: boolean; isExistingCustomer: boolean }> {
    if (!EMAIL_REGEX.test(contact) && !E164_REGEX.test(contact)) {
      throw new Error('Invalid contact format');
    }

    const existingCustomer = await this.customerRepo.findByContact(contact);

    // 6-digit numeric code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.otpStore.saveOtp({
      contact,
      code,
      expiresAt: new Date(Date.now() + this.config.otp.validityMinutes * 60_000),
      attemptsRemaining: this.config.otp.maxAttempts,
      customerId: existingCustomer?.id ?? null,
      lockedUntil: null,
    });

    return { otpSent: true, isExistingCustomer: !!existingCustomer };
  }

  async verifyOtp(contact: string, code: string): Promise<{ token: string; customerId: string }> {
    const record = await this.otpStore.findOtp(contact);

    // No record — treat as expired
    if (!record) {
      throw new OtpExpiredError();
    }

    const now = new Date();

    // Lockout check
    if (record.lockedUntil !== null && record.lockedUntil > now) {
      throw new OtpLockedError(record.lockedUntil.getTime() - now.getTime());
    }

    // Expiry check
    if (record.expiresAt <= now) {
      throw new OtpExpiredError();
    }

    // Wrong code
    if (record.code !== code) {
      const attemptsRemaining = record.attemptsRemaining - 1;

      if (attemptsRemaining <= 0) {
        const lockedUntil = new Date(Date.now() + this.config.otp.lockoutMinutes * 60_000);
        await this.otpStore.saveOtp({ ...record, attemptsRemaining: 0, lockedUntil });
        throw new OtpLockedError(this.config.otp.lockoutMinutes * 60_000);
      }

      await this.otpStore.saveOtp({ ...record, attemptsRemaining });
      throw new OtpInvalidError();
    }

    // ── Correct code ──────────────────────────────────────────────────────────

    let customerId: string;

    if (record.customerId === null) {
      // New customer — create a record
      customerId = crypto.randomUUID();
      const now = new Date();
      const newCustomer: Customer = {
        id: customerId,
        name: '',
        email: contact,
        addresses: [],
        paymentMethods: [],
        notificationPreferences: defaultAllEnabled(),
        createdAt: now,
        updatedAt: now,
      };
      await this.customerRepo.save(newCustomer);
    } else {
      customerId = record.customerId;
    }

    // Create and persist session (30-day TTL)
    const session = {
      token: crypto.randomUUID(),
      customerId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
    await this.otpStore.saveSession(session);
    await this.otpStore.deleteOtp(contact);

    return { token: session.token, customerId };
  }

  async logout(token: string): Promise<void> {
    await this.otpStore.deleteSession(token);
  }

  // ─── IAuthService ─────────────────────────────────────────────────────────────

  async authenticate(token: string): Promise<AuthCustomer | null> {
    const session = await this.otpStore.findSession(token);

    if (!session || session.expiresAt <= new Date()) {
      return null;
    }

    const customer = await this.customerRepo.findById(session.customerId);
    if (!customer) {
      return null;
    }

    return { id: customer.id, name: customer.name, email: customer.email };
  }

  async verifyOwnership(customerId: string, orderItemId: string): Promise<boolean> {
    const result = await this.orderRepo.findOrderItemById(orderItemId);
    if (!result) return false;
    return result.item.customerId === customerId;
  }

  async getOrderItem(orderItemId: string): Promise<AuthOrderItem | null> {
    const result = await this.orderRepo.findOrderItemById(orderItemId);
    if (!result) return null;

    const { order, item } = result;
    return {
      id: item.id,
      orderId: order.id,
      productId: item.productId,
      customerId: item.customerId,
      deliveryDate: item.deliveryDate,
      price: item.unitPrice,
      currency: 'INR',
      productName: item.productName,
      productImage: item.productImage,
      catalogImageRef: `catalog/${item.productId}.jpg`,
    };
  }

  async getOrderItemsByCustomer(customerId: string): Promise<AuthOrderItem[]> {
    const orders = await this.orderRepo.findByCustomerId(customerId);

    return orders
      .flatMap((order) =>
        order.items.map((item) => ({ order, item })),
      )
      .filter(({ item }) => item.customerId === customerId)
      .map(({ order, item }) => ({
        id: item.id,
        orderId: order.id,
        productId: item.productId,
        customerId: item.customerId,
        deliveryDate: item.deliveryDate,
        price: item.unitPrice,
        currency: 'INR',
        productName: item.productName,
        productImage: item.productImage,
        catalogImageRef: `catalog/${item.productId}.jpg`,
      }));
  }
}
