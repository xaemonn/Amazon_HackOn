/**
 * BedrockIdentityVerifier — Amazon Bedrock multimodal identity verification.
 *
 * Uses the Converse API with a multimodal model to compare customer-submitted
 * photos against the catalog product image and determine if the returned item
 * is genuine, a mismatch (different product), or inconclusive.
 *
 * Implements:
 *  - IIdentityVerifier (domain/grading)
 *
 * Requirements: 4.1, 16.2
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { IIdentityVerifier, IdentityVerificationResult } from '../../domain/grading/IIdentityVerifier.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { IdentityVerdict } from '../../domain/shared/types.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface BedrockIdentityVerifierConfig {
  /** AWS region for the Bedrock client */
  region?: string;
  /** Bedrock model ID (e.g., anthropic.claude-3-5-sonnet-20241022-v2:0) */
  modelId?: string;
  /** Request timeout in milliseconds (default: 5000 per Requirement 4.6) */
  timeoutMs?: number;
  /** Function to load image bytes from a storage key */
  loadImage: (storageKey: string) => Promise<Uint8Array>;
}

const DEFAULT_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_REGION = 'us-east-1';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const IDENTITY_VERIFICATION_PROMPT = `You are a product identity verification system. Compare the customer-submitted photos of a returned item against the catalog product image.

Determine whether the submitted photos show the SAME product as the catalog image.

Respond ONLY with a JSON object (no markdown, no explanation outside the JSON):
{
  "verdict": "genuine" | "mismatch" | "inconclusive",
  "confidence": <number between 0.0 and 1.0>
}

Verdict meanings:
- "genuine": The submitted photos clearly show the same product as the catalog image.
- "mismatch": The submitted photos show a different product (potential fraud or wrong item).
- "inconclusive": Cannot determine with sufficient confidence whether it's the same product.

Be strict: only return "genuine" if you are highly confident the items match. If in doubt, prefer "inconclusive".`;

// ─── Valid verdicts ───────────────────────────────────────────────────────────

const VALID_VERDICTS: ReadonlySet<string> = new Set(['genuine', 'mismatch', 'inconclusive']);

// ─── Implementation ───────────────────────────────────────────────────────────

export class BedrockIdentityVerifier implements IIdentityVerifier {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly timeoutMs: number;
  private readonly loadImage: (storageKey: string) => Promise<Uint8Array>;

  constructor(config: BedrockIdentityVerifierConfig) {
    this.client = new BedrockRuntimeClient({
      region: config.region ?? DEFAULT_REGION,
      requestHandler: {
        requestTimeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      } as never,
    });
    this.modelId = config.modelId ?? process.env['ZTR_BEDROCK_MODEL_ID'] ?? DEFAULT_MODEL_ID;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.loadImage = config.loadImage;
  }

  /**
   * Compare submitted media against the catalog image using Bedrock multimodal AI.
   *
   * @param submittedMedia    - Customer-captured photos (video entries are skipped).
   * @param catalogImageRef   - Storage key of the canonical catalog product image.
   * @param productId         - Catalog product identifier for context.
   * @returns                 An IdentityVerificationResult with verdict and confidence.
   */
  async verifyIdentity(
    submittedMedia: MediaReference[],
    catalogImageRef: string,
    productId: string
  ): Promise<IdentityVerificationResult> {
    // Filter to photo-only media (skip video)
    const photos = submittedMedia.filter(
      (m) => m.type !== 'video' && (m.format === 'jpeg' || m.format === 'png')
    );

    if (photos.length === 0) {
      return { verdict: 'inconclusive', confidence: 0.0 };
    }

    try {
      // Load all images concurrently
      const [catalogImageBytes, ...photoBytes] = await Promise.all([
        this.loadImage(catalogImageRef),
        ...photos.map((p) => this.loadImage(p.storageKey)),
      ]);

      // Build multimodal content blocks
      const contentBlocks: ContentBlock[] = [];

      // Add catalog image first (detect format from the file extension)
      const catalogExt = catalogImageRef.split('.').pop()?.toLowerCase();
      const catalogFormat: 'jpeg' | 'png' = catalogExt === 'png' ? 'png' : 'jpeg';
      contentBlocks.push({
        image: {
          format: catalogFormat,
          source: { bytes: catalogImageBytes },
        },
      });

      contentBlocks.push({
        text: `[Above: Catalog product image for product ID: ${productId}]\n\n[Below: Customer-submitted photos of the returned item]`,
      });

      // Add submitted photos
      for (let i = 0; i < photoBytes.length; i++) {
        const photo = photos[i];
        contentBlocks.push({
          image: {
            format: photo.format === 'jpeg' ? 'jpeg' : 'png',
            source: { bytes: photoBytes[i] },
          },
        });
      }

      // Add the verification prompt
      contentBlocks.push({
        text: IDENTITY_VERIFICATION_PROMPT,
      });

      const messages: Message[] = [
        {
          role: 'user',
          content: contentBlocks,
        },
      ];

      // Call Bedrock Converse API with timeout
      const response = await this.invokeWithTimeout(messages);

      // Parse the response
      return this.parseResponse(response);
    } catch (error: unknown) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          throw new Error(`Identity verification timed out after ${this.timeoutMs}ms`);
        }
        if (error.name === 'ThrottlingException' || error.message.includes('throttl')) {
          throw new Error('Identity verification throttled by Bedrock');
        }
      }
      throw new Error(
        `Identity verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Invoke Bedrock Converse API with an AbortController-based timeout.
   */
  private async invokeWithTimeout(messages: Message[]): Promise<string> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const command = new ConverseCommand({
        modelId: this.modelId,
        messages,
        inferenceConfig: {
          maxTokens: 256,
          temperature: 0.0,
        },
      });

      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });

      // Extract text from the response
      const outputContent = response.output?.message?.content;
      if (!outputContent || outputContent.length === 0) {
        throw new Error('Empty response from Bedrock model');
      }

      const textBlock = outputContent.find((block) => 'text' in block);
      if (!textBlock || !('text' in textBlock) || !textBlock.text) {
        throw new Error('No text content in Bedrock model response');
      }

      return textBlock.text;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse the model's JSON response into an IdentityVerificationResult.
   * Handles cases where the model wraps JSON in markdown code fences.
   */
  private parseResponse(rawResponse: string): IdentityVerificationResult {
    // Strip markdown code fences if present
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned) as { verdict?: string; confidence?: number };

      // Validate verdict
      const verdict = parsed.verdict;
      if (!verdict || !VALID_VERDICTS.has(verdict)) {
        return { verdict: 'inconclusive', confidence: 0.0 };
      }

      // Validate and clamp confidence
      let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.0;
      confidence = Math.max(0.0, Math.min(1.0, confidence));

      return {
        verdict: verdict as IdentityVerdict,
        confidence,
      };
    } catch {
      // If we can't parse the response, return inconclusive
      return { verdict: 'inconclusive', confidence: 0.0 };
    }
  }
}
