/**
 * RoutingResult — the output of a disposition handler that claims the item.
 *
 * Contains the route, refund estimate, explanation, and audit metadata.
 *
 * Requirements: 10.1, 12.1, 13.1
 */

import type { DispositionRoute, RefundEstimate } from '../shared/types.js';

export interface RoutingResult {
  /** The disposition route assigned to the item. */
  route: DispositionRoute;
  /** Refund estimate for the customer. */
  refundEstimate: RefundEstimate;
  /** Plain-language explanation of the decision (≤160 chars). */
  explanation: string;
  /** Name of the handler that made this decision. */
  handlerName: string;
  /** Whether this was a fallback/default decision. */
  fallbackTriggered: boolean;
  /** Input signals that were unavailable/degraded during evaluation. */
  degradedInputs: string[];
}
