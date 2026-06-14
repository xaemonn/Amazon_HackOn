import type { DomainEvent } from '../IEventBus.js';
import type { ConditionGrade, Defect, IdentityVerdict } from '../types.js';

/**
 * Published by the Grading Module after identity verification, condition grading,
 * reason parsing and fraud scoring are complete (or a fallback is produced).
 * Subscribers: DispositionEngine, Notifications, Admin ops console.
 *
 * Requirement: 15.3
 */
export interface ItemGradedEvent extends DomainEvent {
  eventType: 'ItemGraded';
  payload: {
    returnRequestId: string;
    /** null when grading failed and a fallback assessment was produced */
    grade: ConditionGrade | null;
    defects: Defect[];
    identityVerdict: IdentityVerdict;
    /** Grading confidence in [0.0, 1.0]; 0.0 on total failure */
    confidence: number;
    /** Fraud score in [0.0, 1.0] */
    fraudScore: number;
    requiresManualReview: boolean;
  };
}
