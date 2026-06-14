import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOtpStore } from './InMemoryOtpStore.js';
import type { OtpRecord } from '../../domain/identity/OtpRecord.js';
import type { Session } from '../../domain/identity/Session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

function pastDate(offsetMs: number): Date {
  return new Date(Date.now() - offsetMs);
}

function makeOtpRecord(overrides: Partial<OtpRecord> = {}): OtpRecord {
  return {
    contact: 'priya@example.com',
    code: '123456',
    expiresAt: futureDate(10 * 60 * 1000), // 10 minutes from now
    attemptsRemaining: 3,
    customerId: null,
    lockedUntil: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    token: 'token-abc-123',
    customerId: 'customer-001',
    expiresAt: futureDate(30 * 24 * 60 * 60 * 1000), // 30 days from now
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryOtpStore', () => {
  let store: InMemoryOtpStore;

  beforeEach(() => {
    store = new InMemoryOtpStore();
  });

  // --- OTP: basic save / find ------------------------------------------------

  it('saveOtp then findOtp returns the saved record', async () => {
    const record = makeOtpRecord();
    await store.saveOtp(record);
    const found = await store.findOtp(record.contact);
    expect(found).toEqual(record);
  });

  it('findOtp returns null for an unknown contact', async () => {
    const result = await store.findOtp('unknown@example.com');
    expect(result).toBeNull();
  });

  // --- OTP: TTL expiry -------------------------------------------------------

  it('findOtp returns null for an expired record', async () => {
    const expired = makeOtpRecord({ expiresAt: pastDate(1) });
    await store.saveOtp(expired);
    const result = await store.findOtp(expired.contact);
    expect(result).toBeNull();
  });

  it('findOtp lazily deletes expired record so a second call also returns null', async () => {
    const expired = makeOtpRecord({ expiresAt: pastDate(1) });
    await store.saveOtp(expired);
    await store.findOtp(expired.contact); // triggers lazy delete
    const second = await store.findOtp(expired.contact);
    expect(second).toBeNull();
  });

  it('findOtp returns a record whose expiresAt is exactly now (boundary: not yet past)', async () => {
    // expiresAt is 1 second in the future — should be treated as valid
    const almostExpired = makeOtpRecord({ expiresAt: futureDate(1000) });
    await store.saveOtp(almostExpired);
    const result = await store.findOtp(almostExpired.contact);
    expect(result).not.toBeNull();
  });

  // --- OTP: overwrite semantics ----------------------------------------------

  it('saving a new OTP for the same contact replaces the old one', async () => {
    const first = makeOtpRecord({ code: '111111' });
    const second = makeOtpRecord({ code: '999999' });

    await store.saveOtp(first);
    await store.saveOtp(second);

    const found = await store.findOtp(first.contact);
    expect(found?.code).toBe('999999');
  });

  // --- OTP: deleteOtp -------------------------------------------------------

  it('deleteOtp removes an existing record', async () => {
    const record = makeOtpRecord();
    await store.saveOtp(record);
    await store.deleteOtp(record.contact);
    const result = await store.findOtp(record.contact);
    expect(result).toBeNull();
  });

  it('deleteOtp on a non-existent contact is a no-op (does not throw)', async () => {
    await expect(store.deleteOtp('ghost@example.com')).resolves.toBeUndefined();
  });

  // --- Session: round-trip --------------------------------------------------

  it('saveSession then findSession returns the correct session', async () => {
    const session = makeSession();
    await store.saveSession(session);
    const found = await store.findSession(session.token);
    expect(found).toEqual(session);
  });

  it('findSession returns null for an unknown token', async () => {
    const result = await store.findSession('no-such-token');
    expect(result).toBeNull();
  });

  // --- Session: TTL expiry --------------------------------------------------

  it('findSession returns null for an expired session', async () => {
    const expired = makeSession({ expiresAt: pastDate(1) });
    await store.saveSession(expired);
    const result = await store.findSession(expired.token);
    expect(result).toBeNull();
  });

  it('findSession lazily deletes expired session so a second call also returns null', async () => {
    const expired = makeSession({ expiresAt: pastDate(1) });
    await store.saveSession(expired);
    await store.findSession(expired.token); // triggers lazy delete
    const second = await store.findSession(expired.token);
    expect(second).toBeNull();
  });

  // --- Session: deleteSession -----------------------------------------------

  it('deleteSession removes an existing session', async () => {
    const session = makeSession();
    await store.saveSession(session);
    await store.deleteSession(session.token);
    const result = await store.findSession(session.token);
    expect(result).toBeNull();
  });

  it('deleteSession on a non-existent token is a no-op (does not throw)', async () => {
    await expect(store.deleteSession('ghost-token')).resolves.toBeUndefined();
  });

  // --- Isolation between OTPs and sessions -----------------------------------

  it('OTP operations do not interfere with session operations', async () => {
    const record = makeOtpRecord({ contact: 'user@example.com' });
    const session = makeSession({ token: 'tok-xyz' });

    await store.saveOtp(record);
    await store.saveSession(session);

    await store.deleteOtp(record.contact);

    // session should still be intact
    const foundSession = await store.findSession(session.token);
    expect(foundSession).toEqual(session);

    // OTP should be gone
    const foundOtp = await store.findOtp(record.contact);
    expect(foundOtp).toBeNull();
  });

  // --- Multiple contacts / tokens --------------------------------------------

  it('stores OTPs for multiple contacts independently', async () => {
    const r1 = makeOtpRecord({ contact: 'alice@example.com', code: '111111' });
    const r2 = makeOtpRecord({ contact: 'bob@example.com', code: '222222' });

    await store.saveOtp(r1);
    await store.saveOtp(r2);

    expect((await store.findOtp('alice@example.com'))?.code).toBe('111111');
    expect((await store.findOtp('bob@example.com'))?.code).toBe('222222');
  });

  it('stores sessions for multiple tokens independently', async () => {
    const s1 = makeSession({ token: 'token-1', customerId: 'cust-1' });
    const s2 = makeSession({ token: 'token-2', customerId: 'cust-2' });

    await store.saveSession(s1);
    await store.saveSession(s2);

    expect((await store.findSession('token-1'))?.customerId).toBe('cust-1');
    expect((await store.findSession('token-2'))?.customerId).toBe('cust-2');
  });
});
