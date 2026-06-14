/**
 * IIdentityService — Application-layer OTP authentication flow.
 *
 * This is the application-facing contract for the identity/OTP flow.
 * It is separate from IAuthService (which is the domain-shared auth contract
 * used by other modules for token verification and ownership checks).
 */
export interface IIdentityService {
  /**
   * Send an OTP to the given contact (email or E.164 phone number).
   * @returns whether the OTP was sent and whether this contact belongs to an existing customer.
   */
  sendOtp(contact: string): Promise<{ otpSent: boolean; isExistingCustomer: boolean }>;

  /**
   * Verify an OTP code for a contact. On success, creates or loads the customer,
   * creates a session, and returns a bearer token + customerId.
   * @throws {OtpExpiredError} if the OTP is expired or not found.
   * @throws {OtpLockedError} if the contact is locked due to too many failed attempts.
   * @throws {OtpInvalidError} if the code is incorrect.
   */
  verifyOtp(contact: string, code: string): Promise<{ token: string; customerId: string }>;

  /**
   * Log out by deleting the session associated with the given token.
   */
  logout(token: string): Promise<void>;
}
