/**
 * InProcessEventBus — synchronous in-process pub/sub implementation of IEventBus.
 *
 * Used in local/demo mode as the dev-time stand-in for Amazon EventBridge.
 *
 * Design notes:
 *  - Subscriptions are keyed by eventType; each key holds a Set of handlers,
 *    so registering the same handler twice for the same type is a no-op.
 *  - Deduplication: once an eventId has been processed it is remembered in a
 *    Set<string> and any subsequent publish() call with the same id is silently
 *    skipped (idempotent processing — Requirement 15.11).
 *  - Isolation: if a subscriber handler throws, the error is logged with the
 *    eventId and eventType, but execution continues for all remaining subscribers
 *    and the publisher never sees the exception (log-on-failure — Req 15.9/15.10).
 *
 * Requirements: 15.9, 15.10, 15.11
 */

import type { DomainEvent, EventHandler, IEventBus } from '../../domain/shared/events.js';

export class InProcessEventBus implements IEventBus {
  /** handlers keyed by eventType; Set ensures no duplicate registrations */
  private readonly subscribers = new Map<string, Set<EventHandler>>();

  /** tracks processed event IDs for idempotent delivery */
  private readonly processedIds = new Set<string>();

  // ─── IEventBus ─────────────────────────────────────────────────────────────

  /**
   * Publish a domain event to all registered subscribers.
   *
   * - If the eventId has already been processed, the call is a no-op.
   * - Each handler is awaited individually; a handler error is caught, logged,
   *   and does NOT affect other handlers or propagate to the caller.
   */
  async publish(event: DomainEvent): Promise<void> {
    // Idempotency guard — skip already-processed events (Req 15.11)
    if (this.processedIds.has(event.eventId)) {
      return;
    }
    this.processedIds.add(event.eventId);

    const handlers = this.subscribers.get(event.eventType);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        // Log-on-failure: isolate the error so other subscribers and the
        // publisher are unaffected (Req 15.9, 15.10).
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[EventBus] Subscriber error for event ${event.eventId} (${event.eventType}): ${message}`
        );
      }
    }
  }

  /**
   * Register a handler for a given eventType.
   * Registering the same handler reference twice for the same type is a no-op.
   */
  subscribe(eventType: string, handler: EventHandler): void {
    let handlers = this.subscribers.get(eventType);
    if (!handlers) {
      handlers = new Set<EventHandler>();
      this.subscribers.set(eventType, handlers);
    }
    handlers.add(handler);
  }

  /**
   * Remove a previously registered handler.
   * Unsubscribing a handler that was never registered is a no-op.
   */
  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.subscribers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }
}
