import type { DomainEvent } from '../IEventBus.js';

/**
 * Published when a return is routed to `manual_inspection` and the ReturnRequest
 * transitions to the ManualReview state.
 * Subscribers: Admin ops console (fraud/review queue), Notifications.
 *
 * Requirement: 14.4
 */
export interface ManualReviewInitiatedEvent extends DomainEvent {
  eventType: 'ManualReviewInitiated';
  payload: {
    returnRequestId: string;
    /** Human-readable reasons that triggered the manual review */
    reasons: string[];
    initiatedAt: Date;
  };
}
