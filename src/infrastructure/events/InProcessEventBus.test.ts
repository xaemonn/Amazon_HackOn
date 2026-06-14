/**
 * Unit tests for InProcessEventBus.
 *
 * Covers:
 *  - Basic publish/subscribe delivery
 *  - Event deduplication (idempotent processing — Req 15.11)
 *  - Subscriber error isolation — one failing handler must not affect others
 *    and must not propagate to the publisher (Req 15.9, 15.10)
 *  - subscribe/unsubscribe mechanics
 *  - No-op unsubscribe of unregistered handler
 *  - Duplicate subscribe is a no-op (handler called only once)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InProcessEventBus } from './InProcessEventBus.js';
import type { DomainEvent } from '../../domain/shared/events.js';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'evt-001',
    eventType: 'TestEvent',
    timestamp: new Date(),
    payload: {},
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InProcessEventBus', () => {
  let bus: InProcessEventBus;

  beforeEach(() => {
    bus = new InProcessEventBus();
  });

  // ── Basic pub/sub ─────────────────────────────────────────────────────────

  it('delivers a published event to a single subscriber', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', handler);

    const event = makeEvent();
    await bus.publish(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('delivers a published event to multiple subscribers for the same eventType', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', h1);
    bus.subscribe('TestEvent', h2);

    await bus.publish(makeEvent());

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('does not deliver events to subscribers of a different eventType', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('OtherEvent', handler);

    await bus.publish(makeEvent({ eventType: 'TestEvent' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('no-ops when there are no subscribers for an eventType', async () => {
    // Should not throw
    await expect(bus.publish(makeEvent())).resolves.toBeUndefined();
  });

  // ── Idempotency (Req 15.11) ───────────────────────────────────────────────

  it('does not deliver a duplicate event (same eventId) to subscribers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', handler);

    const event = makeEvent();
    await bus.publish(event);
    await bus.publish(event); // second publish with same eventId

    expect(handler).toHaveBeenCalledOnce();
  });

  it('treats events with different eventIds as distinct', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', handler);

    await bus.publish(makeEvent({ eventId: 'evt-001' }));
    await bus.publish(makeEvent({ eventId: 'evt-002' }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  // ── Error isolation (Req 15.9, 15.10) ────────────────────────────────────

  it('does not propagate a subscriber error to the publisher', async () => {
    bus.subscribe('TestEvent', async () => {
      throw new Error('handler boom');
    });

    // publish() must resolve without throwing
    await expect(bus.publish(makeEvent())).resolves.toBeUndefined();
  });

  it('continues delivering to remaining subscribers when one throws', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('boom'));
    const successHandler = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('TestEvent', failingHandler);
    bus.subscribe('TestEvent', successHandler);

    await bus.publish(makeEvent());

    expect(failingHandler).toHaveBeenCalledOnce();
    expect(successHandler).toHaveBeenCalledOnce();
  });

  it('logs the subscriber error with eventId and eventType', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.subscribe('TestEvent', async () => {
      throw new Error('test error');
    });

    await bus.publish(makeEvent({ eventId: 'evt-log-test', eventType: 'TestEvent' }));

    expect(errorSpy).toHaveBeenCalledOnce();
    const [logMessage] = errorSpy.mock.calls[0] as [string];
    expect(logMessage).toContain('evt-log-test');
    expect(logMessage).toContain('TestEvent');
    expect(logMessage).toContain('test error');

    errorSpy.mockRestore();
  });

  // ── subscribe/unsubscribe mechanics ──────────────────────────────────────

  it('does not call a handler after it has been unsubscribed', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', handler);
    bus.unsubscribe('TestEvent', handler);

    await bus.publish(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribing a handler that was never registered is a no-op', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    // Should not throw
    expect(() => bus.unsubscribe('TestEvent', handler)).not.toThrow();
  });

  it('registering the same handler twice for the same eventType calls it only once', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('TestEvent', handler);
    bus.subscribe('TestEvent', handler); // duplicate — should be a no-op

    await bus.publish(makeEvent());

    expect(handler).toHaveBeenCalledOnce();
  });
});
