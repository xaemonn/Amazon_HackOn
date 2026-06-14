import { randomUUID } from 'crypto';
import type { Customer } from '../../domain/account/Customer.js';
import { enforceDefaultInvariant } from '../../domain/account/Customer.js';
import type { Address } from '../../domain/account/Address.js';
import type {
  PaymentMethod,
  UpiMethod,
  CardMethod,
  CodMethod,
} from '../../domain/account/PaymentMethod.js';
import type { NotificationPreferences } from '../../domain/account/NotificationPreferences.js';
import type { ICustomerRepository } from '../../domain/account/ICustomerRepository.js';
import {
  CustomerNotFoundError,
  AddressNotFoundError,
  AddressValidationError,
  DuplicatePaymentMethodError,
  PaymentMethodCapExceededError,
  PaymentMethodNotFoundError,
} from '../../domain/account/errors.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AddAddressFields = Omit<Address, 'id' | 'isDefault' | 'createdAt'>;
export type UpdateAddressFields = Partial<AddAddressFields>;

export type AddPaymentMethodInput =
  | Omit<UpiMethod, never>
  | Omit<CardMethod, never>
  | Omit<CodMethod, never>;

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IAccountService {
  // Profile (Req 3)
  getCustomer(customerId: string): Promise<Customer | null>;
  updateProfile(customerId: string, fields: { name: string }): Promise<Customer>;

  // Address Book (Req 4)
  addAddress(customerId: string, fields: AddAddressFields): Promise<Customer>;
  updateAddress(
    customerId: string,
    addressId: string,
    fields: UpdateAddressFields,
  ): Promise<Customer>;
  removeAddress(customerId: string, addressId: string): Promise<Customer>;
  setDefaultAddress(customerId: string, addressId: string): Promise<Customer>;

  // Payment Methods (Req 5)
  addPaymentMethod(
    customerId: string,
    method: AddPaymentMethodInput,
  ): Promise<Customer>;
  removePaymentMethod(customerId: string, methodId: string): Promise<Customer>;
  getPaymentMethods(customerId: string): Promise<PaymentMethod[]>;

  // Notification Preferences (Req 6)
  updateNotificationPreferences(
    customerId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<Customer>;
}

// ── Validation helpers ────────────────────────────────────────────────────────

const PINCODE_RE = /^\d{6}$/;
const UPI_RE = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9]+$/;

type AddressFieldName = keyof AddAddressFields;
const REQUIRED_ADDRESS_FIELDS: AddressFieldName[] = [
  'recipientName',
  'streetLine1',
  'city',
  'state',
  'pincode',
  'country',
];

function validateAddressFields(
  fields: AddAddressFields,
): string[] {
  const invalid: string[] = [];
  for (const field of REQUIRED_ADDRESS_FIELDS) {
    const value = fields[field];
    if (field === 'pincode') {
      if (!value || !PINCODE_RE.test(String(value).trim())) {
        invalid.push(field);
      }
    } else {
      if (!value || String(value).trim().length === 0) {
        invalid.push(field);
      }
    }
  }
  return invalid;
}

function validateUpdateAddressFields(
  fields: UpdateAddressFields,
): string[] {
  const invalid: string[] = [];
  for (const field of REQUIRED_ADDRESS_FIELDS) {
    if (!(field in fields)) continue; // skip fields not being updated
    const value = fields[field as keyof UpdateAddressFields];
    if (field === 'pincode') {
      if (value === undefined || !PINCODE_RE.test(String(value).trim())) {
        invalid.push(field);
      }
    } else {
      if (value === undefined || String(value).trim().length === 0) {
        invalid.push(field);
      }
    }
  }
  return invalid;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class AccountService implements IAccountService {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  // ── Profile ───────────────────────────────────────────────────────────────

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customerRepo.findById(customerId);
  }

  async updateProfile(
    customerId: string,
    fields: { name: string },
  ): Promise<Customer> {
    const trimmed = fields.name.trim();
    if (trimmed.length === 0) {
      throw new AddressValidationError('Name is required and cannot be empty or whitespace');
    }

    const customer = await this.loadOrThrow(customerId);
    const updated: Customer = {
      ...customer,
      name: trimmed,
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  // ── Address Book ──────────────────────────────────────────────────────────

  async addAddress(
    customerId: string,
    fields: AddAddressFields,
  ): Promise<Customer> {
    const invalidFields = validateAddressFields(fields);
    if (invalidFields.length > 0) {
      throw new AddressValidationError(
        `Address validation failed for fields: ${invalidFields.join(', ')}`,
        invalidFields,
      );
    }

    const customer = await this.loadOrThrow(customerId);

    const newAddress: Address = {
      id: randomUUID(),
      recipientName: fields.recipientName.trim(),
      streetLine1: fields.streetLine1.trim(),
      city: fields.city.trim(),
      state: fields.state.trim(),
      pincode: fields.pincode.trim(),
      country: fields.country.trim(),
      isDefault: false,
      createdAt: new Date(),
    };

    const addresses = enforceDefaultInvariant([
      ...customer.addresses,
      newAddress,
    ]);

    const updated: Customer = {
      ...customer,
      addresses,
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    fields: UpdateAddressFields,
  ): Promise<Customer> {
    const invalidFields = validateUpdateAddressFields(fields);
    if (invalidFields.length > 0) {
      throw new AddressValidationError(
        `Address validation failed for fields: ${invalidFields.join(', ')}`,
        invalidFields,
      );
    }

    const customer = await this.loadOrThrow(customerId);
    const existing = customer.addresses.find((a) => a.id === addressId);
    if (!existing) {
      throw new AddressNotFoundError(customerId, addressId);
    }

    const trimIfPresent = (v: string | undefined): string | undefined =>
      v !== undefined ? v.trim() : undefined;

    const updatedAddress: Address = {
      ...existing,
      recipientName: trimIfPresent(fields.recipientName) ?? existing.recipientName,
      streetLine1: trimIfPresent(fields.streetLine1) ?? existing.streetLine1,
      city: trimIfPresent(fields.city) ?? existing.city,
      state: trimIfPresent(fields.state) ?? existing.state,
      pincode: trimIfPresent(fields.pincode) ?? existing.pincode,
      country: trimIfPresent(fields.country) ?? existing.country,
    };

    const addresses = enforceDefaultInvariant(
      customer.addresses.map((a) => (a.id === addressId ? updatedAddress : a)),
    );

    const updated: Customer = {
      ...customer,
      addresses,
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  async removeAddress(
    customerId: string,
    addressId: string,
  ): Promise<Customer> {
    const customer = await this.loadOrThrow(customerId);
    if (!customer.addresses.find((a) => a.id === addressId)) {
      throw new AddressNotFoundError(customerId, addressId);
    }

    const remaining = customer.addresses.filter((a) => a.id !== addressId);
    const addresses = enforceDefaultInvariant(remaining);

    const updated: Customer = {
      ...customer,
      addresses,
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  async setDefaultAddress(
    customerId: string,
    addressId: string,
  ): Promise<Customer> {
    const customer = await this.loadOrThrow(customerId);
    if (!customer.addresses.find((a) => a.id === addressId)) {
      throw new AddressNotFoundError(customerId, addressId);
    }

    // Mark target as default; enforceDefaultInvariant will clear any other defaults
    const withNewDefault = customer.addresses.map((a) => ({
      ...a,
      isDefault: a.id === addressId,
    }));
    const addresses = enforceDefaultInvariant(withNewDefault);

    const updated: Customer = {
      ...customer,
      addresses,
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  // ── Payment Methods ───────────────────────────────────────────────────────

  async addPaymentMethod(
    customerId: string,
    method: AddPaymentMethodInput,
  ): Promise<Customer> {
    const customer = await this.loadOrThrow(customerId);

    if (customer.paymentMethods.length >= 10) {
      throw new PaymentMethodCapExceededError(10);
    }

    // Validate by type
    if (method.type === 'upi') {
      const upiMethod = method as UpiMethod;
      if (!UPI_RE.test(upiMethod.upiId)) {
        throw new AddressValidationError(
          `Invalid UPI ID format: "${upiMethod.upiId}". Expected format: identifier@provider`,
        );
      }
      const duplicate = customer.paymentMethods.find(
        (m) => m.type === 'upi' && (m as UpiMethod).upiId === upiMethod.upiId,
      );
      if (duplicate) {
        throw new DuplicatePaymentMethodError(upiMethod.upiId);
      }
    } else if (method.type === 'card') {
      const cardMethod = method as CardMethod;
      const cardErrors: string[] = [];
      if (!/^\d{4}$/.test(cardMethod.lastFour)) {
        cardErrors.push('lastFour (must be exactly 4 digits)');
      }
      if (cardMethod.expiryMonth < 1 || cardMethod.expiryMonth > 12) {
        cardErrors.push('expiryMonth (must be 1–12)');
      }
      if (!/^\d{4}$/.test(String(cardMethod.expiryYear))) {
        cardErrors.push('expiryYear (must be a 4-digit year)');
      }
      const nameLen = cardMethod.cardHolderName?.trim().length ?? 0;
      if (nameLen < 2 || nameLen > 50) {
        cardErrors.push('cardHolderName (must be 2–50 chars)');
      }
      if (cardErrors.length > 0) {
        throw new AddressValidationError(
          `Card validation failed: ${cardErrors.join('; ')}`,
          cardErrors,
        );
      }
    }
    // COD requires no extra validation

    const newMethod: PaymentMethod = {
      ...method,
      id: randomUUID(),
      isPreferred: false,
      createdAt: new Date(),
    } as PaymentMethod;

    const updated: Customer = {
      ...customer,
      paymentMethods: [...customer.paymentMethods, newMethod],
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  async removePaymentMethod(
    customerId: string,
    methodId: string,
  ): Promise<Customer> {
    const customer = await this.loadOrThrow(customerId);
    if (!customer.paymentMethods.find((m) => m.id === methodId)) {
      throw new PaymentMethodNotFoundError(customerId, methodId);
    }

    const updated: Customer = {
      ...customer,
      paymentMethods: customer.paymentMethods.filter((m) => m.id !== methodId),
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  async getPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
    const customer = await this.getCustomer(customerId);
    return customer?.paymentMethods ?? [];
  }

  // ── Notification Preferences ──────────────────────────────────────────────

  async updateNotificationPreferences(
    customerId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<Customer> {
    const customer = await this.loadOrThrow(customerId);

    // Deep-merge: preserve unmentioned event types and channels
    const merged: NotificationPreferences = { ...customer.notificationPreferences };
    for (const eventType of Object.keys(prefs) as Array<keyof NotificationPreferences>) {
      const channelUpdates = prefs[eventType];
      if (channelUpdates) {
        merged[eventType] = {
          ...merged[eventType],
          ...channelUpdates,
        };
      }
    }

    const updated: Customer = {
      ...customer,
      notificationPreferences: merged,
      updatedAt: new Date(),
    };
    await this.customerRepo.save(updated);
    return updated;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async loadOrThrow(customerId: string): Promise<Customer> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }
    return customer;
  }
}
