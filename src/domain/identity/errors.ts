/**
 * Thrown when the OTP code provided does not match the stored code.
 */
export class OtpInvalidError extends Error {
  constructor() {
    super('Invalid OTP code');
    this.name = 'OtpInvalidError';
  }
}

/**
 * Thrown when the OTP has passed its expiry time.
 */
export class OtpExpiredError extends Error {
  constructor() {
    super('OTP has expired');
    this.name = 'OtpExpiredError';
  }
}

/**
 * Thrown when the maximum OTP attempt count has been reached.
 */
export class OtpMaxAttemptsError extends Error {
  constructor() {
    super('Maximum OTP attempts reached');
    this.name = 'OtpMaxAttemptsError';
  }
}

/**
 * Thrown when the account is locked due to too many failed OTP attempts.
 * retryAfterMs indicates how many milliseconds until the lock expires.
 */
export class OtpLockedError extends Error {
  public readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`OTP locked. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds`);
    this.name = 'OtpLockedError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Thrown when attempting to sign up with a contact that is already registered.
 */
export class ContactAlreadyRegisteredError extends Error {
  constructor(contact: string) {
    super(`Contact already registered: ${contact}`);
    this.name = 'ContactAlreadyRegisteredError';
  }
}

/**
 * Thrown when attempting to log in with a contact that has no registered account.
 */
export class ContactNotRegisteredError extends Error {
  constructor(contact: string) {
    super(`Contact not registered: ${contact}`);
    this.name = 'ContactNotRegisteredError';
  }
}

/**
 * Thrown when a session token is not found (expired or never existed).
 */
export class SessionNotFoundError extends Error {
  constructor(token: string) {
    super(`Session not found: ${token}`);
    this.name = 'SessionNotFoundError';
  }
}
