import type { OtpRecord } from '../../domain/identity/OtpRecord.js';
import type { Session } from '../../domain/identity/Session.js';
import type { IOtpStore } from '../../domain/identity/IOtpStore.js';

/**
 * In-memory implementation of IOtpStore.
 *
 * TTL is enforced lazily on read: any entry whose `expiresAt` is in the past
 * is treated as absent and deleted from the map at the moment it is accessed.
 */
export class InMemoryOtpStore implements IOtpStore {
  private readonly otps: Map<string, OtpRecord> = new Map();
  private readonly sessions: Map<string, Session> = new Map();

  // ---------------------------------------------------------------------------
  // OTP methods
  // ---------------------------------------------------------------------------

  async saveOtp(record: OtpRecord): Promise<void> {
    this.otps.set(record.contact, record);
  }

  async findOtp(contact: string): Promise<OtpRecord | null> {
    const record = this.otps.get(contact);
    if (!record) return null;

    if (record.expiresAt < new Date()) {
      this.otps.delete(contact);
      return null;
    }

    return record;
  }

  async deleteOtp(contact: string): Promise<void> {
    this.otps.delete(contact);
  }

  // ---------------------------------------------------------------------------
  // Session methods
  // ---------------------------------------------------------------------------

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.token, session);
  }

  async findSession(token: string): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session) return null;

    if (session.expiresAt < new Date()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}
