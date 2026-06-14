/**
 * Represents a pending OTP verification record.
 * 
 * - lockedUntil: set when attemptsRemaining reaches 0.
 *   IdentityService checks this field before processing any OTP attempt.
 * - customerId: null for new sign-up flow; set to the existing customer's id for login.
 */
export interface OtpRecord {
  contact: string;               // email or E.164 phone
  code: string;                  // 6-digit numeric string
  expiresAt: Date;               // now + validityMinutes
  attemptsRemaining: number;     // default 3 (configurable)
  customerId: string | null;     // null for sign-up; set for existing customer login
  lockedUntil: Date | null;      // set when attemptsRemaining reaches 0
}
