/**
 * Core event bus abstractions for the domain layer.
 * Infrastructure implementations (in-process, EventBridge) must satisfy these interfaces.
 *
 * Requirements: 15.1, 15.3, 15.5, 15.6
 */

export interface DomainEvent {
  /** Globally unique identifier for this event instance (used for idempotency). */
  eventId: string;
  /** Discriminator string matching one of the concrete event types. */
  eventType: string;
  /** Wall-clock time when the event was created. */
  timestamp: Date;
  /** Event-specific payload; typed further by each concrete event interface. */
  payload: Record<string, unknown>;
}

/** Async handler invoked by the event bus when a subscribed event is delivered. */
export type EventHandler = (event: DomainEvent) => Promise<void>;

/**
 * IEventBus — the single communication channel between domain modules.
 *
 * Modules MUST NOT import each other's internal classes. All cross-module
 * communication goes through this interface (publish) and registered handlers
 * (subscribe).
 *
 * Requirements: 15.1, 15.3
 */
export interface IEventBus {
  /**
   * Publish a domain event to all registered subscribers for `event.eventType`.
   * Implementations must not let a failing subscriber affect other subscribers
   * or the publisher (log-on-failure semantics).
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Register `handler` to be called whenever an event of `eventType` is published.
   * Registering the same handler twice for the same eventType is a no-op.
   */
  subscribe(eventType: string, handler: EventHandler): void;

  /**
   * Remove a previously registered handler.
   * Unsubscribing a handler that was never registered is a no-op.
   */
  unsubscribe(eventType: string, handler: EventHandler): void;
}
