/**
 * WrongItemHandler — Priority 0 (runs before every other handler)
 *
 * Intercepts returns with reason `wrong_item` or `not_as_described` and
 * checks whether the AI grading result actually verifies the customer's claim:
 *
 *   AI CONFIRMS the claim
 *   ──────────────────────
 *   wrong_item      → grade D OR identityVerdict === 'mismatch'
 *   not_as_described → reconciliation.status === 'aligns' | 'partially_aligns'
 *
 *   → route: `wrong_item_refund`  (full refund, item NOT listed on marketplace)
 *
 *   AI REJECTS / CANNOT VERIFY the claim
 *   ──────────────────────────────────────
 *   All other combinations (AI says item is genuine / description matches)
 *
 *   → route: `wrong_item_unverified`  (ask customer to retake clearer photos)
 *
 * Any other return reason passes straight through to the next handler.
 *
 * Requirement: wrong-item / not-as-described fast-track flow
 */

import { BaseDispositionHandler } from './BaseDispositionHandler.js';
import { ExplanationGenerator } from '../ExplanationGenerator.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';

const WRONG_ITEM_REASONS = new Set(['wrong_item', 'not_as_described'] as const);

export class WrongItemHandler extends BaseDispositionHandler {
  private readonly explanationGenerator = new ExplanationGenerator();

  handle(context: RoutingContext): RoutingResult | null {
    const { returnReason, conditionAssessment } = context;

    if (!WRONG_ITEM_REASONS.has(returnReason as 'wrong_item' | 'not_as_described')) {
      return this.passToNext(context);
    }

    const aiConfirms = this.aiVerifiesClaim(returnReason, conditionAssessment);

    if (aiConfirms) {
      return {
        route: 'wrong_item_refund',
        refundEstimate: {
          amount: context.itemValue,
          currency: context.currency,
          condition: 'wrong_item_confirmed',
          method: 'original_payment',
          isMinimumGuarantee: false,
          reasonAware: true,
        },
        explanation: this.explanationGenerator.generate('wrong_item_refund', {
          route: 'wrong_item_refund',
          handlerName: 'WrongItemHandler',
          slaHours: 0,
          hasNearbyBuyer: false,
        }),
        handlerName: 'WrongItemHandler',
        fallbackTriggered: false,
        degradedInputs: [],
      };
    }

    // AI could not confirm the claim — ask the customer to retake photos.
    return {
      route: 'wrong_item_unverified',
      refundEstimate: {
        amount: 0,
        currency: context.currency,
        condition: 'wrong_item_unverified',
        method: 'original_payment',
        isMinimumGuarantee: false,
        reasonAware: true,
      },
      explanation: this.explanationGenerator.generate('wrong_item_unverified', {
        route: 'wrong_item_unverified',
        handlerName: 'WrongItemHandler',
        slaHours: 0,
        hasNearbyBuyer: false,
      }),
      handlerName: 'WrongItemHandler',
      fallbackTriggered: false,
      degradedInputs: [],
    };
  }

  private aiVerifiesClaim(
    reason: string,
    assessment: RoutingContext['conditionAssessment'],
  ): boolean {
    if (reason === 'wrong_item') {
      // Grade D means the AI identified the item as a different product
      return (
        assessment.grade === 'D' ||
        assessment.identityVerdict === 'mismatch'
      );
    }

    if (reason === 'not_as_described') {
      // Reconciliation 'aligns' or 'partially_aligns' means the customer's
      // description is supported by photo evidence
      const status = assessment.reconciliation?.status;
      return status === 'aligns' || status === 'partially_aligns';
    }

    return false;
  }
}
