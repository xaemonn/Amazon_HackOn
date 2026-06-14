import type { DomainEvent } from '../IEventBus.js';
import type { DispositionRoute, RefundEstimate } from '../types.js';

/**
 * Published by the Disposition Engine after the chain of responsibility assigns
 * a route and computes a refund estimate.
 * Subscribers: ReturnsModule (state transition), Notifications, Marketplace (listing).
 *
 * Requirement: 15.5
 */
export interface DispositionAssignedEvent extends DomainEvent {
  eventType: 'DispositionAssigned';
  payload: {
    returnRequestId: string;
    route: DispositionRoute;
    refundEstimate: RefundEstimate;
    /** Plain-language explanation, ≤160 chars, no internal jargon */
    explanation: string;
  };
}
