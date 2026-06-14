export interface Address {
  id: string;
  recipientName: string;    // 1–80 chars trimmed
  streetLine1: string;      // 1–100 chars trimmed
  city: string;             // 1–60 chars trimmed
  state: string;            // 1–60 chars trimmed
  pincode: string;          // exactly 6 numeric digits
  country: string;          // 1–60 chars trimmed
  isDefault: boolean;
  createdAt: Date;
}
