import type { DomainEvent } from '../IEventBus.js';
import type { ReturnReason, MediaReference } from '../types.js';

/**
 * Published when a customer successfully initiates a return request.
 * Subscribers: GradingModule (triggers grading pipeline).
 *
 * Requirement: 15.1
 */
export interface ReturnInitiatedEvent extends DomainEvent {
  eventType: 'ReturnInitiated';
  payload: {
    returnRequestId: string;
    customerId: string;
    orderItemId: string;
    productId: string;
    reasonCode: ReturnReason;
    mediaReferences: MediaReference[];
  };
}
