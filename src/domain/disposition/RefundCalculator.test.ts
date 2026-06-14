/**
 * Unit tests for RefundCalculator — reason-aware refund estimate calculation.
 *
 * Validates:
 * - Fault reasons → 100% refund for every route
 * - Choice reasons → route-based percentage from config
 * - isMinimumGuarantee logic
 * - Zero-value items
 * - Refund condition/method mapping per route
 * - reasonAware flag always true
 * - Amount clamped to non-negative integers
 *
 * Requirements: 12.1, 12.2, 11.3
 */

import { describe, it, expect } from 'vitest';
import { RefundCalculator } from './RefundCalculator.js';
import type { RefundPercentagesConfig } from '../../infrastructure/config/index.js';
import type { DispositionRoute, ReturnReason } from '../shared/types.js';

const DEFAULT_PERCENTAGES: RefundPercentagesConfig = {
  instant_match: 100,
  returnless_refund: 100,
  list_for_resale: 100,
  refurbishment: 80,
  donate_or_recycle: 0,
  manual_inspection: 60,
};

const FAULT_REASONS: ReturnReason[] = [
  'defective',
  'damaged_in_transit',
  'wrong_item',
  'not_as_described',
];

const CHOICE_REASONS: ReturnReason[] = ['changed_mind', 'size_fit'];

const ALL_ROUTES: DispositionRoute[] = [
  'instant_match',
  'returnless_refund',
  'list_for_resale',
  'refurbishment',
  'donate_or_recycle',
  'manual_inspection',
];

describe('RefundCalculator', () => {
  const calculator = new RefundCalculator(DEFAULT_PERCENTAGES);

  describe('isFaultReason static method', () => {
    it.each(FAULT_REASONS)('should return true for fault reason: %s', (reason) => {
      expect(RefundCalculator.isFaultReason(reason)).toBe(true);
    });

    it.each(CHOICE_REASONS)('should return false for choice reason: %s', (reason) => {
      expect(RefundCalculator.isFaultReason(reason)).toBe(false);
    });
  });

  describe('fault reasons → 100% refund regardless of route', () => {
    for (const reason of FAULT_REASONS) {
      for (const route of ALL_ROUTES) {
        it(`should give 100% refund for reason=${reason}, route=${route}`, () => {
          const result = calculator.calculate(1000, 'INR', route, reason);
          expect(result.amount).toBe(1000);
        });
      }
    }
  });

  describe('choice reasons → route-based percentage from config', () => {
    it.each(CHOICE_REASONS)(
      'should give 100%% for instant_match with reason=%s',
      (reason) => {
        const result = calculator.calculate(1000, 'INR', 'instant_match', reason);
        expect(result.amount).toBe(1000);
      },
    );

    it.each(CHOICE_REASONS)(
      'should give 100%% for returnless_refund with reason=%s',
      (reason) => {
        const result = calculator.calculate(1000, 'INR', 'returnless_refund', reason);
        expect(result.amount).toBe(1000);
      },
    );

    it.each(CHOICE_REASONS)(
      'should give 100%% for list_for_resale with reason=%s',
      (reason) => {
        const result = calculator.calculate(1000, 'INR', 'list_for_resale', reason);
        expect(result.amount).toBe(1000);
      },
    );

    it.each(CHOICE_REASONS)(
      'should give 80%% for refurbishment with reason=%s',
      (reason) => {
        const result = calculator.calculate(1000, 'INR', 'refurbishment', reason);
        expect(result.amount).toBe(800);
      },
    );

    it.each(CHOICE_REASONS)(
      'should give 0%% for donate_or_recycle with reason=%s',
      (reason) => {
        const result = calculator.calculate(1000, 'INR', 'donate_or_recycle', reason);
        expect(result.amount).toBe(0);
      },
    );

    it.each(CHOICE_REASONS)(
      'should give 60%% for manual_inspection with reason=%s',
      (reason) => {
        const result = calculator.calculate(1000, 'INR', 'manual_inspection', reason);
        expect(result.amount).toBe(600);
      },
    );
  });

  describe('isMinimumGuarantee logic', () => {
    it('should set isMinimumGuarantee=true for manual_inspection with choice reason', () => {
      const result = calculator.calculate(1000, 'INR', 'manual_inspection', 'changed_mind');
      expect(result.isMinimumGuarantee).toBe(true);
    });

    it('should set isMinimumGuarantee=true for refurbishment with choice reason', () => {
      const result = calculator.calculate(1000, 'INR', 'refurbishment', 'size_fit');
      expect(result.isMinimumGuarantee).toBe(true);
    });

    it('should set isMinimumGuarantee=false for manual_inspection with fault reason', () => {
      const result = calculator.calculate(1000, 'INR', 'manual_inspection', 'defective');
      expect(result.isMinimumGuarantee).toBe(false);
    });

    it('should set isMinimumGuarantee=false for refurbishment with fault reason', () => {
      const result = calculator.calculate(1000, 'INR', 'refurbishment', 'damaged_in_transit');
      expect(result.isMinimumGuarantee).toBe(false);
    });

    it('should set isMinimumGuarantee=false for instant_match with choice reason', () => {
      const result = calculator.calculate(1000, 'INR', 'instant_match', 'changed_mind');
      expect(result.isMinimumGuarantee).toBe(false);
    });

    it('should set isMinimumGuarantee=false for returnless_refund with choice reason', () => {
      const result = calculator.calculate(1000, 'INR', 'returnless_refund', 'size_fit');
      expect(result.isMinimumGuarantee).toBe(false);
    });

    it('should set isMinimumGuarantee=false for list_for_resale with choice reason', () => {
      const result = calculator.calculate(1000, 'INR', 'list_for_resale', 'changed_mind');
      expect(result.isMinimumGuarantee).toBe(false);
    });

    it('should set isMinimumGuarantee=false for donate_or_recycle with choice reason', () => {
      const result = calculator.calculate(1000, 'INR', 'donate_or_recycle', 'size_fit');
      expect(result.isMinimumGuarantee).toBe(false);
    });
  });

  describe('zero-value items', () => {
    it('should return amount=0 for zero-value item with fault reason', () => {
      const result = calculator.calculate(0, 'INR', 'instant_match', 'defective');
      expect(result.amount).toBe(0);
    });

    it('should return amount=0 for zero-value item with choice reason', () => {
      const result = calculator.calculate(0, 'INR', 'refurbishment', 'changed_mind');
      expect(result.amount).toBe(0);
    });

    it('should clamp negative values to 0', () => {
      const result = calculator.calculate(-100, 'INR', 'instant_match', 'defective');
      expect(result.amount).toBe(0);
    });
  });

  describe('refund condition mapping per route', () => {
    it('should return immediate for instant_match', () => {
      const result = calculator.calculate(1000, 'INR', 'instant_match', 'defective');
      expect(result.condition).toBe('immediate');
    });

    it('should return immediate for returnless_refund', () => {
      const result = calculator.calculate(1000, 'INR', 'returnless_refund', 'defective');
      expect(result.condition).toBe('immediate');
    });

    it('should return upon_sale for list_for_resale', () => {
      const result = calculator.calculate(1000, 'INR', 'list_for_resale', 'defective');
      expect(result.condition).toBe('upon_sale');
    });

    it('should return after_review for refurbishment', () => {
      const result = calculator.calculate(1000, 'INR', 'refurbishment', 'defective');
      expect(result.condition).toBe('after_review');
    });

    it('should return after_review for donate_or_recycle', () => {
      const result = calculator.calculate(1000, 'INR', 'donate_or_recycle', 'defective');
      expect(result.condition).toBe('after_review');
    });

    it('should return after_review for manual_inspection', () => {
      const result = calculator.calculate(1000, 'INR', 'manual_inspection', 'defective');
      expect(result.condition).toBe('after_review');
    });
  });

  describe('refund method mapping per route', () => {
    it('should return original_payment for instant_match', () => {
      const result = calculator.calculate(1000, 'INR', 'instant_match', 'defective');
      expect(result.method).toBe('original_payment');
    });

    it('should return original_payment for returnless_refund', () => {
      const result = calculator.calculate(1000, 'INR', 'returnless_refund', 'defective');
      expect(result.method).toBe('original_payment');
    });

    it('should return original_payment for list_for_resale', () => {
      const result = calculator.calculate(1000, 'INR', 'list_for_resale', 'defective');
      expect(result.method).toBe('original_payment');
    });

    it('should return original_payment for refurbishment', () => {
      const result = calculator.calculate(1000, 'INR', 'refurbishment', 'defective');
      expect(result.method).toBe('original_payment');
    });

    it('should return store_credit for donate_or_recycle', () => {
      const result = calculator.calculate(1000, 'INR', 'donate_or_recycle', 'defective');
      expect(result.method).toBe('store_credit');
    });

    it('should return original_payment for manual_inspection', () => {
      const result = calculator.calculate(1000, 'INR', 'manual_inspection', 'defective');
      expect(result.method).toBe('original_payment');
    });
  });

  describe('reasonAware flag', () => {
    it('should always set reasonAware=true', () => {
      for (const route of ALL_ROUTES) {
        for (const reason of [...FAULT_REASONS, ...CHOICE_REASONS]) {
          const result = calculator.calculate(500, 'INR', route, reason);
          expect(result.reasonAware).toBe(true);
        }
      }
    });
  });

  describe('currency passthrough', () => {
    it('should preserve the provided currency', () => {
      const result = calculator.calculate(1000, 'USD', 'instant_match', 'defective');
      expect(result.currency).toBe('USD');
    });

    it('should preserve INR currency', () => {
      const result = calculator.calculate(1000, 'INR', 'refurbishment', 'size_fit');
      expect(result.currency).toBe('INR');
    });
  });

  describe('rounding behavior', () => {
    it('should round to nearest integer', () => {
      // 999 * 80 / 100 = 799.2 → 799
      const result = calculator.calculate(999, 'INR', 'refurbishment', 'changed_mind');
      expect(result.amount).toBe(799);
    });

    it('should round 0.5 up', () => {
      // 5 * 60 / 100 = 3.0 → 3
      const result = calculator.calculate(5, 'INR', 'manual_inspection', 'size_fit');
      expect(result.amount).toBe(3);
    });

    it('should handle fractional item values', () => {
      // 1299 * 60 / 100 = 779.4 → 779
      const result = calculator.calculate(1299, 'INR', 'manual_inspection', 'changed_mind');
      expect(result.amount).toBe(779);
    });
  });

  describe('custom refund percentages', () => {
    it('should use provided percentages for choice reasons', () => {
      const customPercentages: RefundPercentagesConfig = {
        instant_match: 90,
        returnless_refund: 85,
        list_for_resale: 75,
        refurbishment: 50,
        donate_or_recycle: 10,
        manual_inspection: 40,
      };
      const customCalc = new RefundCalculator(customPercentages);

      const result = customCalc.calculate(1000, 'INR', 'refurbishment', 'changed_mind');
      expect(result.amount).toBe(500);
    });

    it('should still give 100% for fault reasons with custom percentages', () => {
      const customPercentages: RefundPercentagesConfig = {
        instant_match: 50,
        returnless_refund: 50,
        list_for_resale: 50,
        refurbishment: 50,
        donate_or_recycle: 50,
        manual_inspection: 50,
      };
      const customCalc = new RefundCalculator(customPercentages);

      const result = customCalc.calculate(1000, 'INR', 'refurbishment', 'defective');
      expect(result.amount).toBe(1000);
    });
  });
});
