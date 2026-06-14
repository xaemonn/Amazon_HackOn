/**
 * BedrockIdentityVerifier — unit tests.
 *
 * Tests the response parsing, confidence clamping, error handling,
 * and media filtering logic. Bedrock API calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BedrockIdentityVerifier } from './BedrockIdentityVerifier.js';
import type { MediaReference } from '../../domain/shared/types.js';

// ─── Mock the AWS SDK ─────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  const mockSend = vi.fn();
  return {
    BedrockRuntimeClient: vi.fn(() => ({ send: mockSend })),
    ConverseCommand: vi.fn((input: unknown) => input),
    __mockSend: mockSend,
  };
});

// Access the mock send function
async function getMockSend() {
  const mod = await import('@aws-sdk/client-bedrock-runtime');
  return (mod as unknown as { __mockSend: ReturnType<typeof vi.fn> }).__mockSend;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makePhoto(overrides: Partial<MediaReference> = {}): MediaReference {
  return {
    id: 'photo-1',
    type: 'photo_front',
    storageKey: 'photos/front.jpeg',
    format: 'jpeg',
    sizeBytes: 1024,
    capturedAt: new Date(),
    ...overrides,
  };
}

function makeBedrockResponse(text: string) {
  return {
    output: {
      message: {
        content: [{ text }],
      },
    },
  };
}

const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const mockLoadImage = vi.fn().mockResolvedValue(fakeImageBytes);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BedrockIdentityVerifier', () => {
  let verifier: BedrockIdentityVerifier;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSend = await getMockSend();
    mockLoadImage.mockResolvedValue(fakeImageBytes);

    verifier = new BedrockIdentityVerifier({
      region: 'us-east-1',
      modelId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      timeoutMs: 5000,
      loadImage: mockLoadImage,
    });
  });

  describe('successful verification', () => {
    it('returns genuine verdict when model confirms match', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "genuine", "confidence": 0.95}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.verdict).toBe('genuine');
      expect(result.confidence).toBe(0.95);
    });

    it('returns mismatch verdict when model detects different product', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "mismatch", "confidence": 0.88}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-456'
      );

      expect(result.verdict).toBe('mismatch');
      expect(result.confidence).toBe(0.88);
    });

    it('returns inconclusive verdict when model is uncertain', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "inconclusive", "confidence": 0.45}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-789'
      );

      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.45);
    });
  });

  describe('response parsing', () => {
    it('handles markdown code fences in response', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('```json\n{"verdict": "genuine", "confidence": 0.92}\n```')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.verdict).toBe('genuine');
      expect(result.confidence).toBe(0.92);
    });

    it('clamps confidence above 1.0 to 1.0', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "genuine", "confidence": 1.5}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.confidence).toBe(1.0);
    });

    it('clamps confidence below 0.0 to 0.0', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "mismatch", "confidence": -0.3}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.confidence).toBe(0.0);
    });

    it('returns inconclusive for invalid JSON response', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('This is not JSON at all')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.0);
    });

    it('returns inconclusive for invalid verdict value', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "unknown_value", "confidence": 0.8}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.0);
    });

    it('handles missing confidence field (defaults to 0.0)', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "genuine"}')
      );

      const result = await verifier.verifyIdentity(
        [makePhoto()],
        'catalog/product.png',
        'product-123'
      );

      expect(result.verdict).toBe('genuine');
      expect(result.confidence).toBe(0.0);
    });
  });

  describe('media filtering', () => {
    it('skips video media and only uses photos', async () => {
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse('{"verdict": "genuine", "confidence": 0.9}')
      );

      const media: MediaReference[] = [
        makePhoto({ id: 'p1', type: 'photo_front', storageKey: 'photos/front.jpeg' }),
        {
          id: 'v1',
          type: 'video',
          storageKey: 'videos/clip.mp4',
          format: 'mp4',
          sizeBytes: 5000,
          capturedAt: new Date(),
        },
        makePhoto({ id: 'p2', type: 'photo_back', storageKey: 'photos/back.png', format: 'png' }),
      ];

      await verifier.verifyIdentity(media, 'catalog/product.png', 'product-123');

      // Should load catalog image + 2 photos (not the video)
      expect(mockLoadImage).toHaveBeenCalledTimes(3);
      expect(mockLoadImage).toHaveBeenCalledWith('catalog/product.png');
      expect(mockLoadImage).toHaveBeenCalledWith('photos/front.jpeg');
      expect(mockLoadImage).toHaveBeenCalledWith('photos/back.png');
    });

    it('returns inconclusive when no photos are provided', async () => {
      const media: MediaReference[] = [
        {
          id: 'v1',
          type: 'video',
          storageKey: 'videos/clip.mp4',
          format: 'mp4',
          sizeBytes: 5000,
          capturedAt: new Date(),
        },
      ];

      const result = await verifier.verifyIdentity(media, 'catalog/product.png', 'product-123');

      expect(result.verdict).toBe('inconclusive');
      expect(result.confidence).toBe(0.0);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws a timeout error when the request times out', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      mockSend.mockRejectedValueOnce(timeoutError);

      await expect(
        verifier.verifyIdentity([makePhoto()], 'catalog/product.png', 'product-123')
      ).rejects.toThrow(/timed out/);
    });

    it('throws a throttling error when Bedrock throttles', async () => {
      const throttleError = new Error('Rate exceeded');
      throttleError.name = 'ThrottlingException';
      mockSend.mockRejectedValueOnce(throttleError);

      await expect(
        verifier.verifyIdentity([makePhoto()], 'catalog/product.png', 'product-123')
      ).rejects.toThrow(/throttled/);
    });

    it('throws a generic error for unknown failures', async () => {
      mockSend.mockRejectedValueOnce(new Error('Something unexpected'));

      await expect(
        verifier.verifyIdentity([makePhoto()], 'catalog/product.png', 'product-123')
      ).rejects.toThrow(/Identity verification failed/);
    });

    it('throws when model returns empty response', async () => {
      mockSend.mockResolvedValueOnce({ output: { message: { content: [] } } });

      await expect(
        verifier.verifyIdentity([makePhoto()], 'catalog/product.png', 'product-123')
      ).rejects.toThrow(/Empty response/);
    });
  });
});
