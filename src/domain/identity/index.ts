export type { OtpRecord } from './OtpRecord.js';
export type { Session } from './Session.js';
export type { IOtpStore } from './IOtpStore.js';
export {
  OtpInvalidError,
  OtpExpiredError,
  OtpMaxAttemptsError,
  OtpLockedError,
  ContactAlreadyRegisteredError,
  ContactNotRegisteredError,
  SessionNotFoundError,
} from './errors.js';
