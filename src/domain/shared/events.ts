// Domain event types and IEventBus interface

import type {
  ConditionGrade,
  Defect,
  DispositionRoute,
  IdentityVerdict,
  MediaReference,
  RefundEstimate,
  ReturnReason,
} from './types.js';

// ─── Base Event & Bus ────────────────────────────────────────────────────────

/**
 * Base interface for all domain events flowing through the event bus.
 */
export interface DomainEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

/**
 * Handler function signature for event subscribers.
 */
export type EventHandler = (event: DomainEvent) => Promise<void>;

/**
 * The internal pub-sub mechanism through which modules communicate
 * via domain events without importing each other's internals.
 */
export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}

// ─── Domain Event Payloads ───────────────────────────────────────────────────

/**
 * Published when a customer initiates a return request.
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

/**
 * Published when AI grading completes (success or fallback).
 */
export interface ItemGradedEvent extends DomainEvent {
  eventType: 'ItemGraded';
  payload: {
    returnRequestId: string;
    grade: ConditionGrade | null;
    defects: Defect[];
    identityVerdict: IdentityVerdict;
    confidence: number;
    fraudScore: number;
    requiresManualReview: boolean;
  };
}

/**
 * Published when the Disposition Engine assigns a route to a graded item.
 */
export interface DispositionAssignedEvent extends DomainEvent {
  eventType: 'DispositionAssigned';
  payload: {
    returnRequestId: string;
    route: DispositionRoute;
    refundEstimate: RefundEstimate;
    explanation: string;
  };
}

/**
 * Published when the computed fraud score meets or exceeds the threshold.
 * Independent of state transitions — emitted during grading in parallel
 * with ItemGraded.
 */
export interface FraudFlaggedEvent extends DomainEvent {
  eventType: 'FraudFlagged';
  payload: {
    returnRequestId: string;
    fraudScore: number;
    reasons: string[];
  };
}

/**
 * Published when a graded item is routed to resale and a listing
 * should be created.
 */
export interface ListingRequestedEvent extends DomainEvent {
  eventType: 'ListingRequested';
  payload: {
    returnRequestId: string;
    productId: string;
    conditionGrade: ConditionGrade;
    assessmentSummary: string;
    mediaReferences: MediaReference[];
  };
}

/**
 * Published when a delivery job is created (for instant-match pickup,
 * manual-inspection warehouse delivery, or resale pickup-on-sale).
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

/**
 * Published when a return request is cancelled by the customer or system.
 */
export interface ReturnCancelledEvent extends DomainEvent {
  eventType: 'ReturnCancelled';
  payload: {
    returnRequestId: string;
    cancelledBy: string; // customerId, "system", or adminId
    reason: string;
  };
}

/**
 * Published when a return reaches the Completed state
 * (returnless refund, donate/recycle, or delivery confirmed).
 */
export interface ReturnCompletedEvent extends DomainEvent {
  eventType: 'ReturnCompleted';
  payload: {
    returnRequestId: string;
    route: DispositionRoute;
    refundAmount: number;
    refundCurrency: string;
  };
}

/**
 * Published when an item is routed to manual review (fraud, low confidence,
 * or admin override). Notifies the Admin module to add to the review queue.
 */
export interface ManualReviewInitiatedEvent extends DomainEvent {
  eventType: 'ManualReviewInitiated';
  payload: {
    returnRequestId: string;
    reasons: string[];
    fraudScore: number;
    confidence: number;
  };
}
