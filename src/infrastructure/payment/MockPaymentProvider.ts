import type { PaymentMethod } from '../../domain/account/PaymentMethod.js';
import type {
  IPaymentProvider,
  PaymentResult,
} from '../../domain/cart/IPaymentProvider.js';

/**
 * Deterministic mock payment provider for demo/testing.
 *
 * Success: returns transactionId "mock-txn-{amount}-{currency}" for valid amounts
 * and non-failing payment methods.
 *
 * Failure triggers:
 * - Amount outside [0.01, 999_999_999.99] → "amount out of range"
 * - UPI id "fail@test" or Card lastFour "0000" → "payment declined"
 */
export class MockPaymentProvider implements IPaymentProvider {
  async processPayment(
    amount: number,
    currency: string,
    paymentMethod: PaymentMethod
  ): Promise<PaymentResult> {
    // Validate amount range
    if (amount < 0.01 || amount > 999_999_999.99) {
      return { success: false, failureReason: 'amount out of range' };
    }

    // Check for deterministic failure triggers
    if (paymentMethod.type === 'upi' && paymentMethod.upiId === 'fail@test') {
      return { success: false, failureReason: 'payment declined' };
    }

    if (paymentMethod.type === 'card' && paymentMethod.lastFour === '0000') {
      return { success: false, failureReason: 'payment declined' };
    }

    // Success path
    return {
      success: true,
      transactionId: `mock-txn-${amount}-${currency}`,
    };
  }
}
