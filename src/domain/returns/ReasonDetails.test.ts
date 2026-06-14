/**
 * Tests for the ReasonDetails value object (validateReasonDetails).
 *
 * Covers:
 * - null / undefined → null
 * - Whitespace-only → null
 * - Leading/trailing whitespace trimmed
 * - Exactly 500 chars after trim → returns value
 * - More than 500 chars after trim → throws ReasonDetailsError
 *
 * Requirements: 2.2, 2.3
 */

import { describe, it, expect } from 'vitest';
import {
  validateReasonDetails,
  ReasonDetailsError,
  MAX_REASON_DETAILS_LENGTH,
} from './ReasonDetails.js';

describe('validateReasonDetails', () => {
  // ── Absent input ──────────────────────────────────────────────────────────

  it('returns null for null input', () => {
    expect(validateReasonDetails(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(validateReasonDetails(undefined)).toBeNull();
  });

  // ── Whitespace-only ───────────────────────────────────────────────────────

  it('returns null for an empty string', () => {
    expect(validateReasonDetails('')).toBeNull();
  });

  it('returns null for a string of only spaces', () => {
    expect(validateReasonDetails('   ')).toBeNull();
  });

  it('returns null for a string of tabs and newlines', () => {
    expect(validateReasonDetails('\t\n\r  ')).toBeNull();
  });

  // ── Trimming ──────────────────────────────────────────────────────────────

  it('trims leading whitespace', () => {
    expect(validateReasonDetails('   hello')).toBe('hello');
  });

  it('trims trailing whitespace', () => {
    expect(validateReasonDetails('hello   ')).toBe('hello');
  });

  it('trims both ends', () => {
    expect(validateReasonDetails('  hello world  ')).toBe('hello world');
  });

  it('does not alter internal whitespace', () => {
    expect(validateReasonDetails('  hello   world  ')).toBe('hello   world');
  });

  // ── Normal valid input ────────────────────────────────────────────────────

  it('returns a single-character string', () => {
    expect(validateReasonDetails('x')).toBe('x');
  });

  it('returns a normal sentence', () => {
    const input = 'The screen is cracked at the top-left corner.';
    expect(validateReasonDetails(input)).toBe(input);
  });

  // ── Boundary: exactly 500 chars ───────────────────────────────────────────

  it('accepts a string of exactly 500 characters', () => {
    const exactly500 = 'a'.repeat(MAX_REASON_DETAILS_LENGTH);
    const result = validateReasonDetails(exactly500);
    expect(result).toBe(exactly500);
    expect(result!.length).toBe(500);
  });

  it('accepts a 500-char string with surrounding whitespace', () => {
    const exactly500 = 'a'.repeat(MAX_REASON_DETAILS_LENGTH);
    const result = validateReasonDetails(`  ${exactly500}  `);
    expect(result).toBe(exactly500);
  });

  // ── Boundary: 501 chars → throws ──────────────────────────────────────────

  it('throws ReasonDetailsError for a 501-char string', () => {
    const tooLong = 'a'.repeat(MAX_REASON_DETAILS_LENGTH + 1);
    expect(() => validateReasonDetails(tooLong)).toThrowError(ReasonDetailsError);
  });

  it('throws ReasonDetailsError with the correct message', () => {
    const tooLong = 'a'.repeat(MAX_REASON_DETAILS_LENGTH + 1);
    expect(() => validateReasonDetails(tooLong)).toThrowError(
      'Reason details must not exceed 500 characters',
    );
  });

  it('throws when trimmed length exceeds 500 (not raw length)', () => {
    // 501 non-whitespace chars surrounded by spaces; raw length > 501
    const tooLong = '  ' + 'a'.repeat(MAX_REASON_DETAILS_LENGTH + 1) + '  ';
    expect(() => validateReasonDetails(tooLong)).toThrowError(ReasonDetailsError);
  });

  it('does NOT throw when whitespace padding makes raw length > 500 but trimmed ≤ 500', () => {
    // 500 real chars + 10 spaces on each side — raw = 520, trimmed = 500
    const padded = ' '.repeat(10) + 'a'.repeat(MAX_REASON_DETAILS_LENGTH) + ' '.repeat(10);
    expect(() => validateReasonDetails(padded)).not.toThrow();
  });
});

describe('ReasonDetailsError', () => {
  it('is an instance of Error', () => {
    const err = new ReasonDetailsError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the name ReasonDetailsError', () => {
    const err = new ReasonDetailsError('test');
    expect(err.name).toBe('ReasonDetailsError');
  });
});
