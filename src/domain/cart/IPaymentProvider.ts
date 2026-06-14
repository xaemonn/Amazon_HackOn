import type { PaymentMethod } from '../account/PaymentMethod.js';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;   // present when success=true
  failureReason?: string;   // present when success=false
}

export interface IPaymentProvider {
  processPayment(
    amount: number,          // 0.01–999,999,999.99
    currency: string,        // "INR"
    paymentMethod: PaymentMethod
  ): Promise<PaymentResult>;
}
