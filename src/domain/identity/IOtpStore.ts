import type { OtpRecord } from './OtpRecord.js';
import type { Session } from './Session.js';

/**
 * Storage contract for OTP records and Sessions.
 * In-memory implementation for local/demo; DynamoDB (with TTL) for AWS.
 */
export interface IOtpStore {
  saveOtp(record: OtpRecord): Promise<void>;
  findOtp(contact: string): Promise<OtpRecord | null>;
  deleteOtp(contact: string): Promise<void>;

  saveSession(session: Session): Promise<void>;
  findSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
}
