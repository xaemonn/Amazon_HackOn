/**
 * Domain errors for the Account module.
 * Each error carries a descriptive message and, where relevant, additional
 * context that consumers (API handlers, UI) can use for targeted responses.
 */

export class CustomerNotFoundError extends Error {
  readonly customerId: string;

  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`);
    this.name = 'CustomerNotFoundError';
    this.customerId = customerId;
  }
}

export class AddressNotFoundError extends Error {
  readonly customerId: string;
  readonly addressId: string;

  constructor(customerId: string, addressId: string) {
    super(`Address ${addressId} not found for customer ${customerId}`);
    this.name = 'AddressNotFoundError';
    this.customerId = customerId;
    this.addressId = addressId;
  }
}

export class AddressValidationError extends Error {
  /** Field names that failed validation. Empty when the error is on a non-field concern (e.g. name). */
  readonly invalidFields: string[];

  constructor(message: string, invalidFields: string[] = []) {
    super(message);
    this.name = 'AddressValidationError';
    this.invalidFields = invalidFields;
  }
}

export class DuplicatePaymentMethodError extends Error {
  readonly upiId: string;

  constructor(upiId: string) {
    super(`Payment method with UPI ID "${upiId}" is already saved`);
    this.name = 'DuplicatePaymentMethodError';
    this.upiId = upiId;
  }
}

export class PaymentMethodCapExceededError extends Error {
  readonly cap: number;

  constructor(cap: number = 10) {
    super(`Cannot add more than ${cap} payment methods`);
    this.name = 'PaymentMethodCapExceededError';
    this.cap = cap;
  }
}

export class PaymentMethodNotFoundError extends Error {
  readonly customerId: string;
  readonly methodId: string;

  constructor(customerId: string, methodId: string) {
    super(`Payment method ${methodId} not found for customer ${customerId}`);
    this.name = 'PaymentMethodNotFoundError';
    this.customerId = customerId;
    this.methodId = methodId;
  }
}
