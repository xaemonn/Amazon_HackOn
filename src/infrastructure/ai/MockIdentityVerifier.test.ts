/**
 * Unit tests for MockIdentityVerifier — deterministic, seeded identity verifier.
 *
 * Validates:
 * - Each seeded productId returns the expected verdict and confidence
 * - Default fallback for unknown productIds
 * - Confidence always in [0.0, 1.0]
 * - Defensive copies
 *
 * Validates: Requirements 16.4, 16.6
 */

import { describe, it, expect } from 'vitest';
import { MockIdentityVerifier } from './MockIdentityVerifier.js';

describe('MockIdentityVerifier', () => {
  const verifier = new MockIdentityVerifier();

  describe('genuine verdicts', () => {
    it('should return genuine/0.95 for item-genuine', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'item-genuine');
      expect(result.verdict).toBe('genuine');
      expect(result.confidence).toBe(0.95);
    });

    it('should return genuine/0.95 for item-grade-a', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'item-grade-a');
      expect(result.verdict).toBe('genuine');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('mismatch verdicts', () => {
    it('should return mismatch/0.95 for item-mismatch', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'item-mismatch');
      expect(result.verdict).toBe('mismatch');
      expect(result.confidence).toBe(0.95);
    });

    it('should return mismatch/0.95 for item-fraud', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'item-fraud');
      expect(result.verdict).toBe('mismatch');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('inconclusive verdicts', () => {
    it('should return inconclusive/0.95 for item-ambiguous', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'item-ambiguous');
      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.95);
    });

    it('should return inconclusive/0.95 for item-inconclusive', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'item-inconclusive');
      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('default fallback for unknown productIds', () => {
    it('should return inconclusive/0.50 for unknown productId', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', 'unknown-product');
      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.50);
    });

    it('should return default for empty productId', async () => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', '');
      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.50);
    });
  });

  describe('confidence bounds', () => {
    const allProductIds = [
      'item-genuine', 'item-grade-a', 'item-mismatch', 'item-fraud',
      'item-ambiguous', 'item-inconclusive', 'unknown-xyz',
    ];

    it.each(allProductIds)('confidence ∈ [0.0, 1.0] for productId=%s', async (productId) => {
      const result = await verifier.verifyIdentity([], 'catalog.jpg', productId);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('ignores media and catalog parameters', () => {
    it('should return the same result regardless of media and catalog ref', async () => {
      const withMedia = await verifier.verifyIdentity(
        [{ id: '1', type: 'photo_front', storageKey: 'key', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() }],
        'different-catalog.png',
        'item-genuine',
      );
      const withoutMedia = await verifier.verifyIdentity([], '', 'item-genuine');

      expect(withMedia.verdict).toBe(withoutMedia.verdict);
      expect(withMedia.confidence).toBe(withoutMedia.confidence);
    });
  });
});
