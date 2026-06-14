import type { DomainEvent } from '../IEventBus.js';

/**
 * Published by the Grading Module in parallel with ItemGraded when
 * fraudScore >= configured threshold (default 0.7).
 *
 * This event is NOT tied to a state transition — it is an independent signal
 * that propagates immediately to the Admin module and Disposition Engine.
 *
 * Requirement: 14.4
 */
export interface FraudFlaggedEvent extends DomainEvent {
  eventType: 'FraudFlagged';
  payload: {
    returnRequestId: string;
    /** Fraud score in [0.0, 1.0] */
    fraudScore: number;
    /** Human-readable reasons that contributed to the score */
    reasons: string[];
  };
}
