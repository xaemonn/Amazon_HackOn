import type { DomainEvent } from '../IEventBus.js';

/**
 * Published when a return request is cancelled, either by the customer or by
 * an admin (e.g. after a fraud determination).
 *
 * Requirement: 14.4
 */
export interface ReturnCancelledEvent extends DomainEvent {
  eventType: 'ReturnCancelled';
  payload: {
    returnRequestId: string;
    customerId: string;
    cancelledAt: Date;
    /** 'customer', an adminId, or 'system' */
    actor: string;
  };
}
