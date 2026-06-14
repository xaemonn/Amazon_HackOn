export type RefundStatusCode = 'none' | 'refund_issued';

export interface RefundStatus {
  code: RefundStatusCode;
  amount: number | null;
  currency: string | null;
  issuedAt: Date | null;
}
