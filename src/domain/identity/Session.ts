/**
 * An authenticated session issued after successful OTP verification.
 */
export interface Session {
  token: string;        // opaque random UUID used as bearer token
  customerId: string;
  expiresAt: Date;      // now + 30 days (configurable)
}
