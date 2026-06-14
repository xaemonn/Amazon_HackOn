import type { DomainEvent } from '../IEventBus.js';
import type { ConditionGrade, MediaReference } from '../types.js';

/**
 * Published when the Disposition Engine routes an item to `list_for_resale`.
 * Triggers the DispositionAssigned → Listed state transition in the Returns Module
 * and prompts the Marketplace to draft a Second Life listing.
 *
 * Requirement: 15.6
 */
export interface ListingRequestedEvent extends DomainEvent {
  eventType: 'ListingRequested';
  payload: {
    returnRequestId: string;
    productId: string;
    conditionGrade: ConditionGrade;
    /** AI-generated condition summary to seed the listing description */
    assessmentSummary: string;
    mediaReferences: MediaReference[];
  };
}
