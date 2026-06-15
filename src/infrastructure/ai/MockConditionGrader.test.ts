/**
 * Unit tests for MockConditionGrader — deterministic, seeded condition grader.
 *
 * Validates:
 * - Each seeded productId returns the expected grade and confidence
 * - Default fallback for unknown productIds
 * - Invariant bounds (reasoning ≤ 500 chars, defects ≤ 10, confidence ∈ [0,1])
 * - Defensive copies (returned objects are independent)
 *
 * Validates: Requirements 16.3, 16.6
 */

import { describe, it, expect } from 'vitest';
import { MockConditionGrader } from './MockConditionGrader.js';

describe('MockConditionGrader', () => {
  const grader = new MockConditionGrader();
  const noCatalog = '';

  describe('seeded item grades', () => {
    it('should return grade A with confidence 0.95 for item-grade-a', async () => {
      const result = await grader.assessCondition([], 'item-grade-a', noCatalog);
      expect(result.grade).toBe('A');
      expect(result.confidence).toBe(0.95);
      expect(result.defects).toHaveLength(0);
    });

    it('should return grade B with confidence 0.90 for item-grade-b', async () => {
      const result = await grader.assessCondition([], 'item-grade-b', noCatalog);
      expect(result.grade).toBe('B');
      expect(result.confidence).toBe(0.90);
      expect(result.defects).toHaveLength(1);
      expect(result.defects[0].location).toBe('bottom-left corner');
      expect(result.defects[0].severity).toBe('minor');
    });

    it('should return grade C with confidence 0.85 for item-grade-c', async () => {
      const result = await grader.assessCondition([], 'item-grade-c', noCatalog);
      expect(result.grade).toBe('C');
      expect(result.confidence).toBe(0.85);
      expect(result.defects).toHaveLength(2);
      expect(result.defects[0].severity).toBe('moderate');
      expect(result.defects[1].severity).toBe('moderate');
    });

    it('should return grade D (product mismatch) with confidence 0.82 for item-grade-d', async () => {
      const result = await grader.assessCondition([], 'item-grade-d', noCatalog);
      expect(result.grade).toBe('D');
      expect(result.confidence).toBe(0.82);
      expect(result.defects.length).toBeGreaterThanOrEqual(1);
      expect(result.defects.some((d) => d.severity === 'severe')).toBe(true);
    });
  });

  describe('default fallback for unknown productIds', () => {
    it('should return grade B with confidence 0.70 for unknown productId', async () => {
      const result = await grader.assessCondition([], 'unknown-product-xyz', noCatalog);
      expect(result.grade).toBe('B');
      expect(result.confidence).toBe(0.70);
      expect(result.defects).toHaveLength(1);
    });

    it('should return default for empty productId', async () => {
      const result = await grader.assessCondition([], '', noCatalog);
      expect(result.grade).toBe('B');
      expect(result.confidence).toBe(0.70);
    });
  });

  describe('invariant bounds', () => {
    const allProductIds = ['item-grade-a', 'item-grade-b', 'item-grade-c', 'item-grade-d', 'unknown'];

    it.each(allProductIds)('reasoning ≤ 500 chars for productId=%s', async (productId) => {
      const result = await grader.assessCondition([], productId, noCatalog);
      expect(result.reasoning.length).toBeLessThanOrEqual(500);
    });

    it.each(allProductIds)('defects.length ≤ 10 for productId=%s', async (productId) => {
      const result = await grader.assessCondition([], productId, noCatalog);
      expect(result.defects.length).toBeLessThanOrEqual(10);
    });

    it.each(allProductIds)('confidence ∈ [0.0, 1.0] for productId=%s', async (productId) => {
      const result = await grader.assessCondition([], productId, noCatalog);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('defensive copies', () => {
    it('should return independent defect arrays between calls', async () => {
      const result1 = await grader.assessCondition([], 'item-grade-b', noCatalog);
      const result2 = await grader.assessCondition([], 'item-grade-b', noCatalog);

      // Mutate result1's defects — should not affect result2
      result1.defects[0].description = 'MUTATED';
      expect(result2.defects[0].description).not.toBe('MUTATED');
    });
  });

  describe('ignores media references parameter', () => {
    it('should return the same result regardless of media provided', async () => {
      const withMedia = await grader.assessCondition(
        [{ id: '1', type: 'photo_front', storageKey: 'key', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() }],
        'item-grade-a',
        noCatalog,
      );
      const withoutMedia = await grader.assessCondition([], 'item-grade-a', noCatalog);

      expect(withMedia.grade).toBe(withoutMedia.grade);
      expect(withMedia.confidence).toBe(withoutMedia.confidence);
    });
  });
});
