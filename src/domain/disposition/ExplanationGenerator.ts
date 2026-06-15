/**
 * ExplanationGenerator — produces plain-language disposition explanations.
 *
 * Each explanation is a single sentence ≤160 characters containing:
 * - The reason for the routing decision
 * - The immediate next step for the customer
 *
 * Uses customer-friendly language only. MUST NOT include:
 * - Internal system identifiers, module names, route codes
 * - Raw grade labels (e.g., "Grade A"), confidence scores
 * - Any technical jargon
 *
 * For manual_inspection route, MUST NOT use: "fraud", "suspicious",
 * "flagged", "violation", "denied", "penalty".
 * MUST include expected review timeframe (slaHours).
 *
 * Requirements: 13.1, 13.2, 13.4, 13.5
 */

import type { DispositionRoute } from '../shared/types.js';

export interface ExplanationContext {
  /** The disposition route assigned. */
  route: DispositionRoute;
  /** Name of the handler that made the decision. */
  handlerName: string;
  /** SLA hours for manual review timeframe. */
  slaHours: number;
  /** Whether a nearby buyer demand signal matched. */
  hasNearbyBuyer: boolean;
}

export interface IExplanationGenerator {
  generate(route: DispositionRoute, context: ExplanationContext): string;
}

export class ExplanationGenerator implements IExplanationGenerator {
  generate(route: DispositionRoute, context: ExplanationContext): string {
    switch (route) {
      case 'instant_match':
        return 'Your item is like-new and a buyer nearby wants it. Your refund is processed immediately.';

      case 'list_for_resale':
        return 'Your item has been listed in the returned marketplace. Your refund is processed once it sells.';

      case 'refurbishment':
        return 'Your item has minor wear and will be sent for refurbishment. Your refund is being processed.';

      case 'returnless_refund':
        return 'You can keep the item — no return needed. A full refund has been processed to your original payment method.';

      case 'donate_or_recycle':
        return 'Your item will be donated or responsibly recycled. Thank you for helping reduce waste.';

      case 'manual_inspection':
        return `Our team needs to review your return. You'll hear back within ${context.slaHours} hours.`;

      case 'wrong_item_refund':
        return 'We confirmed you received the wrong item. A full refund has been initiated — no return needed.';

      case 'wrong_item_unverified':
        return 'We couldn\'t confirm your claim from the photos provided. Please retake clearer photos and try again.';

      default:
        return `Our team needs to review your return. You'll hear back within ${context.slaHours} hours.`;
    }
  }
}
