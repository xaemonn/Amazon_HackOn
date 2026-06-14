import type { DomainEvent } from '../IEventBus.js';
import type { DispositionRoute } from '../types.js';

/**
 * Published when the return lifecycle reaches the terminal `Completed` state.
 * Applies to routes that do not require physical pickup (returnless_refund,
 * donate_or_recycle) or after successful delivery on the AwaitingPickup / Listed paths.
 *
 * Subscribers: GreenLedger (credits), Notifications, Seller dashboard.
 *
 * Requirement: 14.4
 */
export interface ReturnCompletedEvent extends DomainEvent {
  eventType: 'ReturnCompleted';
  payload: {
    returnRequestId: string;
    customerId: string;
    route: DispositionRoute;
    completedAt: Date;
  };
}
