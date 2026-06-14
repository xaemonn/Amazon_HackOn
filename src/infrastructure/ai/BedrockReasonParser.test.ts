/**
 * Unit tests for BedrockReasonParser.
 *
 * Since the adapter calls Amazon Bedrock, we mock the BedrockRuntimeClient
 * to test parsing, validation, and error-handling logic without live API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Defect } from '../../domain/shared/types.js';

// ─── Mock the AWS SDK ─────────────────────────────────────────────────────────

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send: sendMock })),
  ConverseCommand: vi.fn((input: unknown) => input),
}));

// ─── Import after mock setup ──────────────────────────────────────────────────

import { BedrockReasonParser } from './BedrockReasonParser.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBedrockResponse(jsonBody: object): object {
  return {
    output: {
      message: {
        content: [{ text: JSON.stringify(jsonBody) }],
      },
    },
  };
}

const sampleDefects: Defect[] = [
  { location: 'screen', severity: 'moderate', description: 'Visible crack on display' },
  { location: 'body', severity: 'minor', description: 'Light scuff on back panel' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BedrockReasonParser', () => {
  let parser: BedrockReasonParser;

  beforeEach(() => {
    parser = new BedrockReasonParser({ region: 'us-east-1' });
    sendMock.mockReset();
  });

  describe('parseReason', () => {
    it('returns unparseable for empty text without calling Bedrock', async () => {
      const result = await parser.parseReason('', sampleDefects, 'product-123');

      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
      expect(result.rawText).toBe('');
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('returns unparseable for whitespace-only text without calling Bedrock', async () => {
      const result = await parser.parseReason('   \n  ', sampleDefects, 'product-123');

      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('parses a valid aligns response from Bedrock', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'aligns',
          claims: [
            {
              claimType: 'damage_description',
              itemArea: 'screen',
              description: 'Cracked display glass',
              verdict: 'supported',
            },
          ],
        })
      );

      const result = await parser.parseReason(
        'The screen is cracked',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('aligns');
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]).toEqual({
        claimType: 'damage_description',
        itemArea: 'screen',
        description: 'Cracked display glass',
        verdict: 'supported',
      });
      expect(result.rawText).toBe('The screen is cracked');
    });

    it('parses partially_aligns with multiple claims', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'partially_aligns',
          claims: [
            {
              claimType: 'damage_description',
              itemArea: 'screen',
              description: 'Cracked screen',
              verdict: 'supported',
            },
            {
              claimType: 'missing_component',
              itemArea: 'charger',
              description: 'Charger is missing',
              verdict: 'unsupported',
            },
          ],
        })
      );

      const result = await parser.parseReason(
        'Screen cracked and charger missing',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('partially_aligns');
      expect(result.claims).toHaveLength(2);
      expect(result.claims[0].verdict).toBe('supported');
      expect(result.claims[1].verdict).toBe('unsupported');
    });

    it('parses contradicts when no claims supported', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'contradicts',
          claims: [
            {
              claimType: 'functional_defect',
              itemArea: 'device',
              description: 'Device won\'t power on',
              verdict: 'unsupported',
            },
          ],
        })
      );

      const result = await parser.parseReason(
        'The device won\'t turn on at all',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('contradicts');
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].verdict).toBe('unsupported');
    });

    it('returns unparseable on Bedrock API error', async () => {
      sendMock.mockRejectedValueOnce(new Error('Bedrock service unavailable'));

      const result = await parser.parseReason(
        'The item is damaged',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
      expect(result.rawText).toBe('The item is damaged');
    });

    it('returns unparseable when model returns invalid JSON', async () => {
      sendMock.mockResolvedValueOnce({
        output: {
          message: {
            content: [{ text: 'This is not JSON at all' }],
          },
        },
      });

      const result = await parser.parseReason(
        'My item is broken',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
    });

    it('returns unparseable when model returns empty content', async () => {
      sendMock.mockResolvedValueOnce({
        output: {
          message: {
            content: [],
          },
        },
      });

      const result = await parser.parseReason(
        'Screen is shattered',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
    });

    it('strips markdown code fences from model response', async () => {
      sendMock.mockResolvedValueOnce({
        output: {
          message: {
            content: [
              {
                text: '```json\n' + JSON.stringify({
                  status: 'aligns',
                  claims: [
                    {
                      claimType: 'cosmetic_issue',
                      itemArea: 'surface',
                      description: 'Surface scratches visible',
                      verdict: 'supported',
                    },
                  ],
                }) + '\n```',
              },
            ],
          },
        },
      });

      const result = await parser.parseReason(
        'Item has scratches',
        sampleDefects,
        'product-123'
      );

      expect(result.status).toBe('aligns');
      expect(result.claims).toHaveLength(1);
    });

    it('filters out claims with invalid claimType', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'aligns',
          claims: [
            {
              claimType: 'invalid_type',
              itemArea: 'screen',
              description: 'Bad claim',
              verdict: 'supported',
            },
            {
              claimType: 'damage_description',
              itemArea: 'screen',
              description: 'Good claim',
              verdict: 'supported',
            },
          ],
        })
      );

      const result = await parser.parseReason(
        'The screen is cracked',
        sampleDefects,
        'product-123'
      );

      // Invalid claim filtered, only valid one remains
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].description).toBe('Good claim');
    });

    it('filters out claims with invalid verdict', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'aligns',
          claims: [
            {
              claimType: 'damage_description',
              itemArea: 'screen',
              description: 'Invalid verdict',
              verdict: 'maybe',
            },
          ],
        })
      );

      const result = await parser.parseReason(
        'Screen cracked',
        sampleDefects,
        'product-123'
      );

      // No valid claims → unparseable
      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
    });

    it('returns unparseable if status is invalid and no valid claims', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'invalid_status',
          claims: [],
        })
      );

      const result = await parser.parseReason(
        'Some text',
        [],
        'product-123'
      );

      expect(result.status).toBe('unparseable');
      expect(result.claims).toEqual([]);
    });
  });

  describe('parseAndReconcile (barrel interface)', () => {
    it('delegates to the same logic as parseReason', async () => {
      sendMock.mockResolvedValueOnce(
        makeBedrockResponse({
          status: 'aligns',
          claims: [
            {
              claimType: 'damage_description',
              itemArea: 'body',
              description: 'Dented body panel',
              verdict: 'supported',
            },
          ],
        })
      );

      const result = await parser.parseAndReconcile(
        'The body is dented',
        sampleDefects
      );

      expect(result.status).toBe('aligns');
      expect(result.claims).toHaveLength(1);
      expect(result.rawText).toBe('The body is dented');
    });
  });
});
