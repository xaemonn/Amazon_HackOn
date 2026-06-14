/**
 * ReasonDetails value object.
 *
 * Validates and normalises the optional free-text that accompanies a
 * structured ReturnReason selection.
 *
 * Rules (Requirement 2.2, 2.3):
 * - null / undefined → return null
 * - Trim leading and trailing whitespace
 * - Whitespace-only after trim → return null
 * - Length after trim > 500 → throw ReasonDetailsError
 * - Otherwise → return trimmed string
 */

// ─── Error class ──────────────────────────────────────────────────────────────

/**
 * Thrown when the trimmed free-text exceeds 500 characters.
 *
 * Requirement 2.2
 */
export class ReasonDetailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReasonDetailsError';
    // Maintain correct prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Validation constant ──────────────────────────────────────────────────────

/** Maximum allowed length for trimmed reason details. */
export const MAX_REASON_DETAILS_LENGTH = 500;

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validate and normalise optional free-text reason details.
 *
 * @param input - The raw string from the UI, or null / undefined if omitted.
 * @returns The trimmed string (1–500 chars), or null if not provided / blank.
 * @throws {ReasonDetailsError} If the trimmed string exceeds 500 characters.
 *
 * Requirements: 2.2, 2.3
 */
export function validateReasonDetails(input: string | null | undefined): string | null {
  // No input provided
  if (input === null || input === undefined) {
    return null;
  }

  const trimmed = input.trim();

  // Whitespace-only → treat as not provided
  if (trimmed.length === 0) {
    return null;
  }

  // Exceeds character limit
  if (trimmed.length > MAX_REASON_DETAILS_LENGTH) {
    throw new ReasonDetailsError(
      `Reason details must not exceed ${MAX_REASON_DETAILS_LENGTH} characters`,
    );
  }

  return trimmed;
}
