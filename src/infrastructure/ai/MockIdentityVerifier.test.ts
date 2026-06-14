import { describe, it, expect } from 'vitest';
import { MockIdentityVerifier } from './MockIdentityVerifier.js';
import type { MediaReference } from '../../domain/shared/types.js';

describe('MockIdentityVerifier', () => {
  const verifier = new MockIdentityVerifier();

  // Dummy media — ignored by the mock but required by the interface.
  const dummyMedia: MediaReference[] = [
    {
      id: 'img-1',
      type: 'photo_front',
      storageKey: 'uploads/img-1.jpeg',
      format: 'jpeg',
      sizeBytes: 1024,
      capturedAt: new Date(),
    },
  ];
  const dummyCatalogRef = 'catalog/product-abc.jpeg';

  // ─── Seeded productId: genuine ───────────────────────────────────────────

  it('returns genuine/0.95 for productId "item-genuine"', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-genuine');
    expect(result.verdict).toBe('genuine');
    expect(result.confidence).toBe(0.95);
  });

  it('returns genuine/0.95 for productId "item-grade-a"', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-grade-a');
    expect(result.verdict).toBe('genuine');
    expect(result.confidence).toBe(0.95);
  });

  // ─── Seeded productId: mismatch ─────────────────────────────────────────

  it('returns mismatch/0.95 for productId "item-mismatch"', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-mismatch');
    expect(result.verdict).toBe('mismatch');
    expect(result.confidence).toBe(0.95);
  });

  it('returns mismatch/0.95 for productId "item-fraud"', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-fraud');
    expect(result.verdict).toBe('mismatch');
    expect(result.confidence).toBe(0.95);
  });

  // ─── Seeded productId: inconclusive ─────────────────────────────────────

  it('returns inconclusive/0.95 for productId "item-ambiguous"', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-ambiguous');
    expect(result.verdict).toBe('inconclusive');
    expect(result.confidence).toBe(0.95);
  });

  it('returns inconclusive/0.95 for productId "item-inconclusive"', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-inconclusive');
    expect(result.verdict).toBe('inconclusive');
    expect(result.confidence).toBe(0.95);
  });

  // ─── Default fallback (unknown productId) ───────────────────────────────

  it('returns inconclusive/0.50 for an unknown productId', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'unknown-xyz');
    expect(result.verdict).toBe('inconclusive');
    expect(result.confidence).toBe(0.50);
  });

  it('returns inconclusive/0.50 for an empty productId', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, '');
    expect(result.verdict).toBe('inconclusive');
    expect(result.confidence).toBe(0.50);
  });

  // ─── Interface contract: confidence in [0.0, 1.0] ──────────────────────

  it('always returns confidence in [0.0, 1.0]', async () => {
    const testIds = [
      'item-genuine',
      'item-grade-a',
      'item-mismatch',
      'item-fraud',
      'item-ambiguous',
      'item-inconclusive',
      'totally-random',
      '',
    ];

    for (const id of testIds) {
      const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, id);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    }
  });

  // ─── Interface contract: result shape ───────────────────────────────────

  it('returns an object matching IdentityVerificationResult shape', async () => {
    const result = await verifier.verifyIdentity(dummyMedia, dummyCatalogRef, 'item-genuine');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('confidence');
    expect(['genuine', 'mismatch', 'inconclusive']).toContain(result.verdict);
    expect(typeof result.confidence).toBe('number');
  });
});
