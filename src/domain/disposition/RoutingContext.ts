/**
 * RoutingContext — the input to the Disposition Engine's chain of handlers.
 *
 * Aggregates all signals needed for routing: the condition assessment,
 * item value, nearby demand, return reason, and return history.
 *
 * Requirements: 10.1, 10.3, 10.12
 */

import type { ConditionGrade, ReturnReason } from '../shared/types.js';
import type { ConditionAssessment } from '../grading/ConditionAssessment.js';

/**
 * Represents a nearby buyer demand signal for instant-match routing.
 */
export interface DemandSignal {
  /** The buyer who wants this item. */
  buyerId: string;
  /** Distance in km from the seller to the buyer. */
  distanceKm: number;
  /** Type of demand: active order or wishlist. */
  matchType: 'active_order' | 'wishlist';
}

/**
 * The complete context passed to the disposition chain for routing evaluation.
 */
export interface RoutingContext {
  /** The return request being routed. */
  returnRequestId: string;
  /** The AI condition assessment for this item. */
  conditionAssessment: ConditionAssessment;
  /** The monetary value of the item (in local currency). */
  itemValue: number;
  /** Currency code (e.g. 'INR'). */
  currency: string;
  /** Nearby buyer demand signal, or null if none available. */
  nearbyDemand: DemandSignal | null;
  /** The product being returned. */
  productId: string;
  /** The customer's stated return reason. */
  returnReason: ReturnReason;
  /** Return history for frequency/fraud checks. */
  returnHistory: { count90Days: number };
}
