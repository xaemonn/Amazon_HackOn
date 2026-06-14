/**
 * Unit tests for BedrockConditionGrader.
 *
 * Uses a mocked BedrockRuntimeClient to verify:
 *   - Correct parsing of model responses
 *   - Invariant enforcement (reasoning ≤ 500, defects ≤ 10, confidence clamped)
 *   - Error handling (timeout, throttling, parse failures)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BedrockConditionGrader } from './BedrockConditionGrader.js';
import type { MediaReference } from '../../domain/shared/types.js';

// ─── Mock AWS SDK ─────────────────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  ConverseCommand: vi.fn().mockImplementation((input) => input),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const samplePhotos: MediaReference[] = [
  {
    id: 'photo-1',
    type: 'photo_front',
    storageKey: 'returns/abc/front.jpeg',
    format: 'jpeg',
    sizeBytes: 1024,
    capturedAt: new Date('2024-01-01'),
  },
  {
    id: 'photo-2',
    type: 'photo_back',
    storageKey: 'returns/abc/back.jpeg',
    format: 'jpeg',
    sizeBytes: 1024,
    capturedAt: new Date('2024-01-01'),
  },
];

const sampleVideoMedia: MediaReference = {
  id: 'video-1',
  type: 'video',
  storageKey: 'returns/abc/video.mp4',
  format: 'mp4',
  sizeBytes: 5_000_000,
  capturedAt: new Date('2024-01-01'),
};

function makeGrader(
  fetchMediaBytes?: (key: string) => Promise<Buffer>
) {
  return new BedrockConditionGrader({
    region: 'us-east-1',
    modelId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    timeoutMs: 10_000,
    fetchMediaBytes: fetchMediaBytes ?? (() => Promise.resolve(Buffer.from('fake-image-data'))),
  });
}

function makeBedrockResponse(jsonPayload: object) {
  return {
    output: {
      message: {
        content: [{ text: JSON.stringify(jsonPayload) }],
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BedrockConditionGrader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assessCondition — successful responses', () => {
    it('parses a valid grade A response correctly', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'A',
          reasoning: 'Item is in pristine condition, no visible defects.',
          defects: [],
          confidence: 0.95,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.grade).toBe('A');
      expect(result.reasoning).toBe('Item is in pristine condition, no visible defects.');
      expect(result.defects).toEqual([]);
      expect(result.confidence).toBe(0.95);
    });

    it('parses a response with defects correctly', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'C',
          reasoning: 'Moderate wear observed.',
          defects: [
            { location: 'top panel', severity: 'moderate', description: 'Scratches' },
            { location: 'right edge', severity: 'minor', description: 'Small dent' },
          ],
          confidence: 0.82,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-456', '');

      expect(result.grade).toBe('C');
      expect(result.defects).toHaveLength(2);
      expect(result.defects[0].severity).toBe('moderate');
      expect(result.defects[1].location).toBe('right edge');
      expect(result.confidence).toBe(0.82);
    });

    it('handles video media references with a text note', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'B',
          reasoning: 'Light use observed.',
          defects: [{ location: 'corner', severity: 'minor', description: 'Scuff' }],
          confidence: 0.88,
        })
      );

      const mediaWithVideo = [...samplePhotos, sampleVideoMedia];
      const result = await grader.assessCondition(mediaWithVideo, 'product-789', '');

      expect(result.grade).toBe('B');
      expect(result.confidence).toBe(0.88);
    });
  });

  describe('assessCondition — invariant enforcement', () => {
    it('truncates reasoning to 500 characters', async () => {
      const grader = makeGrader();
      const longReasoning = 'A'.repeat(600);
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'B',
          reasoning: longReasoning,
          defects: [],
          confidence: 0.9,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.reasoning.length).toBe(500);
    });

    it('limits defects to 10 items', async () => {
      const grader = makeGrader();
      const manyDefects = Array.from({ length: 15 }, (_, i) => ({
        location: `location-${i}`,
        severity: 'minor',
        description: `defect ${i}`,
      }));
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'D',
          reasoning: 'Many defects.',
          defects: manyDefects,
          confidence: 0.6,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.defects.length).toBe(10);
    });

    it('clamps confidence above 1.0 to 1.0', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'A',
          reasoning: 'Perfect.',
          defects: [],
          confidence: 1.5,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.confidence).toBe(1.0);
    });

    it('clamps confidence below 0.0 to 0.0', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'D',
          reasoning: 'Damaged.',
          defects: [],
          confidence: -0.3,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.confidence).toBe(0.0);
    });

    it('defaults unrecognized grade to C', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'X',
          reasoning: 'Unknown.',
          defects: [],
          confidence: 0.5,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.grade).toBe('C');
    });

    it('defaults invalid severity to minor', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'B',
          reasoning: 'Some defects.',
          defects: [{ location: 'top', severity: 'extreme', description: 'Bad' }],
          confidence: 0.7,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.defects[0].severity).toBe('minor');
    });
  });

  describe('assessCondition — error handling', () => {
    it('wraps timeout errors with a descriptive message', async () => {
      const grader = makeGrader();
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'AbortError';
      mockSend.mockRejectedValueOnce(timeoutError);

      await expect(grader.assessCondition(samplePhotos, 'product-123', ''))
        .rejects.toThrow('timed out after 10000ms');
    });

    it('wraps throttling errors with a descriptive message', async () => {
      const grader = makeGrader();
      const throttleError = new Error('Rate exceeded');
      throttleError.name = 'ThrottlingException';
      mockSend.mockRejectedValueOnce(throttleError);

      await expect(grader.assessCondition(samplePhotos, 'product-123', ''))
        .rejects.toThrow('throttled');
    });

    it('throws on empty model response', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce({
        output: { message: { content: [] } },
      });

      await expect(grader.assessCondition(samplePhotos, 'product-123', ''))
        .rejects.toThrow('Empty response');
    });

    it('throws on invalid JSON response', async () => {
      const grader = makeGrader();
      mockSend.mockResolvedValueOnce({
        output: {
          message: {
            content: [{ text: 'not valid json at all' }],
          },
        },
      });

      await expect(grader.assessCondition(samplePhotos, 'product-123', ''))
        .rejects.toThrow('Failed to parse model response');
    });

    it('handles photo fetch failure gracefully and still calls model', async () => {
      const failingFetch = () => Promise.reject(new Error('S3 error'));
      const grader = makeGrader(failingFetch);
      mockSend.mockResolvedValueOnce(
        makeBedrockResponse({
          grade: 'B',
          reasoning: 'Based on available context.',
          defects: [],
          confidence: 0.6,
        })
      );

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.grade).toBe('B');
      expect(result.confidence).toBe(0.6);
    });

    it('strips markdown code fences from response', async () => {
      const grader = makeGrader();
      const jsonStr = JSON.stringify({
        grade: 'A',
        reasoning: 'Clean.',
        defects: [],
        confidence: 0.95,
      });
      mockSend.mockResolvedValueOnce({
        output: {
          message: {
            content: [{ text: '```json\n' + jsonStr + '\n```' }],
          },
        },
      });

      const result = await grader.assessCondition(samplePhotos, 'product-123', '');

      expect(result.grade).toBe('A');
      expect(result.confidence).toBe(0.95);
    });
  });
});
