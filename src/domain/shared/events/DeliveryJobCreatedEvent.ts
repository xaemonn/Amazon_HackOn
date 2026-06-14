import type { DomainEvent } from '../IEventBus.js';

/**
 * Published when a physical pickup-and-delivery job needs to be dispatched.
 * Emitted on:
 *   - DispositionAssigned → AwaitingPickup (instant_match / refurbishment routes)
 *   - DispositionAssigned → ManualReview (manual_inspection route; ships to warehouse)
 *
 * Subscriber: FlexRoute module (dispatch logic).
 *
 * Requirement: 15.6
 */
export interface DeliveryJobCreatedEvent extends DomainEvent {
  eventType: 'DeliveryJobCreated';
  payload: {
    returnRequestId: string;
    pickupAddress: string;
    dropAddress: string;
    itemId: string;
    priority: 'standard' | 'urgent';
  };
}
