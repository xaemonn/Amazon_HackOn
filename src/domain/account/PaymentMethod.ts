export type PaymentMethodType = 'upi' | 'card' | 'cod';

export interface UpiMethod {
  type: 'upi';
  upiId: string;            // format: identifier@provider
}

export interface CardMethod {
  type: 'card';
  lastFour: string;         // masked — stored only
  expiryMonth: number;      // 1–12
  expiryYear: number;       // 4-digit year
  cardHolderName: string;   // 2–50 chars
}

export interface CodMethod {
  type: 'cod';
}

export type PaymentMethod = (UpiMethod | CardMethod | CodMethod) & {
  id: string;
  isPreferred: boolean;
  createdAt: Date;
};
