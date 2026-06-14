/**
 * Tests for the ReturnReason value object.
 *
 * Covers:
 * - All 6 valid reasons recognised by isValidReturnReason
 * - Invalid values rejected
 * - Fault vs choice reason classification
 *
 * Requirements: 2.1, 2.3
 */

import { describe, it, expect } from 'vitest';
import {
  RETURN_REASONS,
  isValidReturnReason,
  isFaultReason,
  isChoiceReason,
  type ReturnReason,
} from './ReturnReason.js';

describe('RETURN_REASONS', () => {
  it('contains exactly 6 values', () => {
    expect(RETURN_REASONS).toHaveLength(6);
  });

  it('contains all expected reason codes', () => {
    const expected: ReturnReason[] = [
      'defective',
      'damaged_in_transit',
      'wrong_item',
      'size_fit',
      'not_as_described',
      'changed_mind',
    ];
    for (const reason of expected) {
      expect(RETURN_REASONS).toContain(reason);
    }
  });
});

describe('isValidReturnReason', () => {
  it.each(RETURN_REASONS)('recognises "%s" as a valid reason', (reason) => {
    expect(isValidReturnReason(reason)).toBe(true);
  });

  it.each([
    'DEFECTIVE',
    'Defective',
    'wrong-item',
    'size',
    '',
    null,
    undefined,
    42,
    {},
    [],
  ])('rejects %j as invalid', (value) => {
    expect(isValidReturnReason(value)).toBe(false);
  });
});

describe('isFaultReason', () => {
  const faultReasons: ReturnReason[] = [
    'defective',
    'damaged_in_transit',
    'wrong_item',
    'not_as_described',
  ];
  const choiceReasons: ReturnReason[] = ['size_fit', 'changed_mind'];

  it.each(faultReasons)('classifies "%s" as a fault reason', (reason) => {
    expect(isFaultReason(reason)).toBe(true);
  });

  it.each(choiceReasons)('does NOT classify "%s" as a fault reason', (reason) => {
    expect(isFaultReason(reason)).toBe(false);
  });
});

describe('isChoiceReason', () => {
  const choiceReasons: ReturnReason[] = ['size_fit', 'changed_mind'];
  const faultReasons: ReturnReason[] = [
    'defective',
    'damaged_in_transit',
    'wrong_item',
    'not_as_described',
  ];

  it.each(choiceReasons)('classifies "%s" as a choice reason', (reason) => {
    expect(isChoiceReason(reason)).toBe(true);
  });

  it.each(faultReasons)('does NOT classify "%s" as a choice reason', (reason) => {
    expect(isChoiceReason(reason)).toBe(false);
  });
});

describe('fault + choice are mutually exclusive and exhaustive', () => {
  it('every valid reason is either fault or choice, never both', () => {
    for (const reason of RETURN_REASONS) {
      const fault = isFaultReason(reason);
      const choice = isChoiceReason(reason);
      expect(fault !== choice).toBe(true);
    }
  });

  it('there are exactly 4 fault reasons and 2 choice reasons', () => {
    const faults = RETURN_REASONS.filter(isFaultReason);
    const choices = RETURN_REASONS.filter(isChoiceReason);
    expect(faults).toHaveLength(4);
    expect(choices).toHaveLength(2);
  });
});
