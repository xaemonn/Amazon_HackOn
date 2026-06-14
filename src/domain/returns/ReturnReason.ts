/**
 * ReturnReason value object.
 *
 * Re-exports the ReturnReason type from the shared module and provides
 * domain helpers: a readonly array of all valid values, a type-guard,
 * and fault-vs-choice classification helpers used by the Disposition Engine's
 * reason-aware refund logic.
 *
 * Requirements: 2.1, 2.3, 12.1
 */

import type { ReturnReason } from '../shared/types.js';

// ─── Re-export the canonical type ────────────────────────────────────────────

export type { ReturnReason };

// ─── Readonly value array ─────────────────────────────────────────────────────

/**
 * All 6 valid return reason codes.
 * Use this array for iteration, select-option generation, and validation.
 *
 * Requirement 2.1 — exactly 6 mutually exclusive options.
 */
export const RETURN_REASONS = [
  'defective',
  'damaged_in_transit',
  'wrong_item',
  'size_fit',
  'not_as_described',
  'changed_mind',
] as const satisfies readonly ReturnReason[];

// ─── Type guard ───────────────────────────────────────────────────────────────

/**
 * Returns true if `value` is one of the 6 valid ReturnReason codes.
 *
 * @param value - Any unknown value to test.
 */
export function isValidReturnReason(value: unknown): value is ReturnReason {
  return (RETURN_REASONS as readonly string[]).includes(value as string);
}

// ─── Fault / choice classification ───────────────────────────────────────────

/**
 * Fault reasons — the customer is NOT at fault.
 * These drive a 100% refund regardless of condition grade.
 *
 * Design: "Reason-Aware Refund Logic"
 */
const FAULT_REASONS = new Set<ReturnReason>([
  'defective',
  'damaged_in_transit',
  'wrong_item',
  'not_as_described',
]);

/**
 * Returns true when the reason means the customer is not at fault.
 * Fault reasons always yield a 100% refund (see Disposition Engine design).
 *
 * @param reason - A validated ReturnReason value.
 */
export function isFaultReason(reason: ReturnReason): boolean {
  return FAULT_REASONS.has(reason);
}

/**
 * Returns true when the reason is a voluntary customer choice.
 * Choice reasons use route-based refund percentages.
 *
 * @param reason - A validated ReturnReason value.
 */
export function isChoiceReason(reason: ReturnReason): boolean {
  return !FAULT_REASONS.has(reason);
}
