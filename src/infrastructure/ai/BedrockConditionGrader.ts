/**
 * BedrockConditionGrader — live Amazon Bedrock multimodal condition grader.
 *
 * Implements `IConditionGrader` using Amazon Bedrock's Converse API with a
 * multimodal model (Claude or Nova). Sends photos as images and extracts
 * representative frames from video references (placeholder for demo).
 *
 * Invariant bounds enforced:
 *   - reasoning ≤ 500 characters
 *   - defects.length ≤ 10
 *   - confidence ∈ [0.0, 1.0]
 *
 * Handles Bedrock API errors gracefully:
 *   - Timeout (configurable, default 10s)
 *   - Throttling (ThrottlingException)
 *   - Model invocation errors
 *
 * Requirements: 5.1, 16.1
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type ImageBlock,
} from '@aws-sdk/client-bedrock-runtime';

import type { IConditionGrader, ConditionGradeResult } from '../../domain/grading/IConditionGrader.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { ConditionGrade, Defect } from '../../domain/shared/types.js';
import { getConfig } from '../config/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Configuration options for the Bedrock adapter. */
export interface BedrockConditionGraderConfig {
  /** AWS region for Bedrock (e.g., 'us-east-1'). */
  region?: string;
  /** Bedrock model ID (e.g., 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'). */
  modelId?: string;
  /** Request timeout in milliseconds (overrides config). */
  timeoutMs?: number;
  /** Function to fetch image bytes from a storage key. */
  fetchMediaBytes: (storageKey: string) => Promise<Buffer>;
}

/** Raw JSON shape expected from the model response. */
interface ModelResponsePayload {
  grade: string;
  reasoning: string;
  defects: Array<{
    location: string;
    severity: string;
    description: string;
  }>;
  confidence: number;
  authenticity?: {
    aiGenerated?: boolean;
    confidence?: number;
    note?: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const DEFAULT_REGION = 'us-east-1';

/** Maximum frames to extract from video for multimodal input. */
const MAX_VIDEO_FRAMES = 5;

const VALID_GRADES: Set<string> = new Set(['A', 'B', 'C', 'D']);
const VALID_SEVERITIES: Set<string> = new Set(['minor', 'moderate', 'severe']);

// ─── Grading Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(productId: string): string {
  return `You are an expert product condition grader for a returns platform.

You will receive:
1. A CATALOG IMAGE — the product as it looked when brand new (first image sent).
2. One or more RETURN PHOTOS — submitted by the customer returning this item.

Product ID: ${productId}

YOUR TASK:
FIRST — verify the returned item is the SAME product as in the catalog image.
  • If the photos clearly show a DIFFERENT object (wrong product, a person's face, blank wall, random household item, etc.), set grade to "D", confidence to 1.0, and explain the mismatch in reasoning.
  • If you cannot tell (blurry, no catalog image available), lower your confidence accordingly.

THEN — if the item is the correct product, grade its physical condition relative to the catalog image:
- A: Like new — matches catalog image, no visible defects, all components intact
- B: Light use — minor cosmetic marks, fully functional, close to catalog condition
- C: Noticeable wear — moderate scratches/dents/damage, refurbishment needed
- D: Significant damage — cracked/broken/missing parts, or WRONG ITEM returned

ALSO — assess image authenticity (anti-fraud):
Examine the RETURN PHOTOS for signs they are AI-generated, CGI/rendered, or digitally manipulated rather than genuine camera photos. Look for: unnaturally perfect/plastic surfaces, impossible lighting or reflections, warped text/logos, inconsistent shadows, missing real-world imperfections, or telltale generative artifacts. Report your verdict in the "authenticity" field.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences) in this exact format:
{
  "grade": "A" | "B" | "C" | "D",
  "reasoning": "Brief explanation of the grade (max 500 characters)",
  "defects": [
    {
      "location": "where on the item",
      "severity": "minor" | "moderate" | "severe",
      "description": "what the defect is"
    }
  ],
  "confidence": 0.0 to 1.0,
  "authenticity": {
    "aiGenerated": true | false,
    "confidence": 0.0 to 1.0,
    "note": "brief explanation of authenticity indicators (max 300 characters)"
  }
}

Rules:
- "reasoning" must be at most 500 characters
- "defects" must have at most 10 items; use an empty array if none
- "confidence" must be between 0.0 and 1.0
- If the item is the WRONG product, set grade "D" and describe the mismatch in reasoning
- Set "authenticity.aiGenerated" to true ONLY if you see clear signs of AI generation/manipulation; otherwise false
- Be concise and factual`;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class BedrockConditionGrader implements IConditionGrader {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly timeoutMs: number;
  private readonly fetchMediaBytes: (storageKey: string) => Promise<Buffer>;

  constructor(config: BedrockConditionGraderConfig) {
    const region = config.region ?? DEFAULT_REGION;
    this.modelId = config.modelId ?? process.env['ZTR_BEDROCK_MODEL_ID'] ?? DEFAULT_MODEL_ID;
    this.timeoutMs = config.timeoutMs ?? getConfig().gradingTimeouts.conditionGraderTimeoutMs;
    this.fetchMediaBytes = config.fetchMediaBytes;

    this.client = new BedrockRuntimeClient({
      region,
      requestHandler: {
        requestTimeout: this.timeoutMs,
      } as never,
    });
  }

  /**
   * Assess the condition of a returned item by sending its media to Bedrock.
   *
   * The catalog image is sent first so the model can compare the return photos
   * against the original "as-new" product before assigning a condition grade.
   */
  async assessCondition(
    mediaReferences: MediaReference[],
    productId: string,
    catalogImageRef: string
  ): Promise<ConditionGradeResult> {
    console.log('[BedrockConditionGrader] Grading started', {
      productId,
      catalogImageRef,
      mediaCount: mediaReferences.length,
      model: this.modelId,
    });
    const contentBlocks = await this.buildContentBlocks(mediaReferences, catalogImageRef);
    const systemPrompt = buildSystemPrompt(productId);

    const userMessage: Message = {
      role: 'user',
      content: contentBlocks,
    };

    try {
      const command = new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: systemPrompt }],
        messages: [userMessage],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.1,
        },
      });

      const response = await this.invokeWithTimeout(command);

      // Extract text from the response
      const outputMessage = response.output?.message;
      if (!outputMessage?.content || outputMessage.content.length === 0) {
        throw new Error('Empty response from Bedrock model');
      }

      const textBlock = outputMessage.content.find(
        (block) => 'text' in block && block.text
      );
      if (!textBlock || !('text' in textBlock) || !textBlock.text) {
        throw new Error('No text content in Bedrock model response');
      }

      const result = this.parseModelResponse(textBlock.text);
      console.log('[BedrockConditionGrader] Grading complete', { grade: result.grade, confidence: result.confidence });
      return result;
    } catch (error: unknown) {
      console.error('[BedrockConditionGrader] Grading failed', error);
      throw this.wrapError(error);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Build content blocks for the Converse API.
   *
   * Layout sent to the model:
   *   1. Catalog image (how the item looks brand-new) — used for identity + reference
   *   2. Separator text label
   *   3. Customer return photos (front, back, close-up)
   *   4. Video note (Bedrock does not accept raw video)
   *   5. Final instruction text
   */
  private async buildContentBlocks(
    mediaReferences: MediaReference[],
    catalogImageRef: string,
  ): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = [];

    // ── 1. Catalog reference image ──────────────────────────────────────────
    try {
      const catalogBytes = await this.fetchMediaBytes(catalogImageRef);
      if (catalogBytes.length > 0) {
        // Infer format from the file extension; default to jpeg
        const ext = catalogImageRef.split('.').pop()?.toLowerCase();
        const catalogFormat: 'jpeg' | 'png' = ext === 'png' ? 'png' : 'jpeg';
        const catalogBlock: ImageBlock = {
          format: catalogFormat,
          source: { bytes: catalogBytes },
        };
        blocks.push({ image: catalogBlock });
        blocks.push({
          text: '[CATALOG IMAGE — this is the product as it looked when brand new. Use this as your reference to verify identity and assess condition.]',
        });
      } else {
        blocks.push({
          text: '[No catalog image available — grade based on return photos only and lower your confidence accordingly.]',
        });
      }
    } catch {
      blocks.push({
        text: '[Catalog image could not be loaded — grade based on return photos only and lower your confidence accordingly.]',
      });
    }

    // ── 2. Customer return photos ───────────────────────────────────────────
    const photos = mediaReferences.filter((m) => m.type !== 'video');
    const videos = mediaReferences.filter((m) => m.type === 'video');

    if (photos.length > 0) {
      blocks.push({ text: '[RETURN PHOTOS — submitted by the customer:]' });
    }

    for (const photo of photos) {
      try {
        const imageBytes = await this.fetchMediaBytes(photo.storageKey);
        if (imageBytes.length > 0) {
          const imageBlock: ImageBlock = {
            format: photo.format as 'jpeg' | 'png',
            source: { bytes: imageBytes },
          };
          blocks.push({ image: imageBlock });
          blocks.push({ text: `[Return photo: ${photo.type}]` });
        } else {
          blocks.push({ text: `[Empty/missing photo: ${photo.type} — ${photo.storageKey}]` });
        }
      } catch {
        blocks.push({ text: `[Unable to load photo: ${photo.type} — ${photo.storageKey}]` });
      }
    }

    // ── 3. Video note ────────────────────────────────────────────────────────
    if (videos.length > 0) {
      blocks.push({
        text: `[${videos.length} video(s) submitted. In production, ${MAX_VIDEO_FRAMES} frames would be extracted. Consider the video as additional evidence of the item's condition.]`,
      });
    }

    // ── 4. Fallback if nothing loaded ────────────────────────────────────────
    if (blocks.every((b) => 'text' in b)) {
      blocks.push({
        text: '[No usable images could be loaded. Assign grade D with low confidence and flag for manual review.]',
      });
    }

    // ── 5. Final instruction ─────────────────────────────────────────────────
    blocks.push({
      text: 'Compare the return photos against the catalog image. Verify the item is correct, then grade its condition. Respond with the JSON object only.',
    });

    return blocks;
  }

  /**
   * Invoke the Bedrock Converse command with a timeout using AbortController.
   */
  private async invokeWithTimeout(command: ConverseCommand) {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse the model's JSON text response into a validated ConditionGradeResult.
   * Enforces invariant bounds on all fields.
   */
  private parseModelResponse(responseText: string): ConditionGradeResult {
    // Strip any markdown code fences the model might include
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: ModelResponsePayload;
    try {
      parsed = JSON.parse(cleaned) as ModelResponsePayload;
    } catch {
      throw new Error(
        `Failed to parse model response as JSON: ${responseText.substring(0, 200)}`
      );
    }

    // Validate and normalize grade
    const grade = this.normalizeGrade(parsed.grade);

    // Validate and clamp confidence
    const confidence = this.normalizeConfidence(parsed.confidence);

    // Validate and truncate reasoning
    const reasoning = this.normalizeReasoning(parsed.reasoning);

    // Validate and limit defects
    const defects = this.normalizeDefects(parsed.defects);

    // Normalize the authenticity (anti-fraud) signal
    const authenticity = {
      aiGenerated: parsed.authenticity?.aiGenerated === true,
      confidence: this.normalizeConfidence(parsed.authenticity?.confidence),
      note: this.normalizeAuthenticityNote(parsed.authenticity?.note),
    };

    return { grade, reasoning, defects, confidence, authenticity };
  }

  private normalizeAuthenticityNote(raw: unknown): string {
    const value = String(raw ?? '');
    return value.length > 300 ? value.substring(0, 300) : value;
  }

  private normalizeGrade(raw: unknown): ConditionGrade {
    const value = String(raw).toUpperCase().trim();
    if (VALID_GRADES.has(value)) {
      return value as ConditionGrade;
    }
    // Default to 'C' if the model returns an unrecognized grade
    return 'C';
  }

  private normalizeConfidence(raw: unknown): number {
    const value = Number(raw);
    if (Number.isNaN(value)) return 0.5;
    return Math.max(0.0, Math.min(1.0, value));
  }

  private normalizeReasoning(raw: unknown): string {
    const value = String(raw ?? '');
    // Truncate to 500 characters
    return value.length > 500 ? value.substring(0, 500) : value;
  }

  private normalizeDefects(raw: unknown): Defect[] {
    if (!Array.isArray(raw)) return [];

    // Limit to 10 defects
    const limited = raw.slice(0, 10);

    return limited
      .map((item): Defect | null => {
        if (!item || typeof item !== 'object') return null;

        const location = String(item.location ?? 'unknown');
        const severity = VALID_SEVERITIES.has(String(item.severity))
          ? (String(item.severity) as Defect['severity'])
          : 'minor';
        const description = String(item.description ?? '');

        return { location, severity, description };
      })
      .filter((d): d is Defect => d !== null);
  }

  /**
   * Wrap raw errors into descriptive Error objects with context.
   */
  private wrapError(error: unknown): Error {
    if (error instanceof Error) {
      const name = error.name;

      // Handle abort/timeout
      if (name === 'AbortError' || name === 'TimeoutError') {
        return new Error(
          `Bedrock condition grading timed out after ${this.timeoutMs}ms`
        );
      }

      // Handle throttling
      if (name === 'ThrottlingException' || name === 'TooManyRequestsException') {
        return new Error(
          'Bedrock condition grading throttled — too many requests. Please retry later.'
        );
      }

      // Handle model-specific errors
      if (name === 'ModelTimeoutException') {
        return new Error(
          'Bedrock model timed out while processing the request.'
        );
      }

      if (name === 'ModelNotReadyException') {
        return new Error(
          'Bedrock model is not ready. Please retry in a few moments.'
        );
      }

      if (name === 'ValidationException') {
        return new Error(
          `Bedrock validation error: ${error.message}`
        );
      }

      // Re-throw with context for other known errors
      return new Error(`Bedrock condition grading failed: ${error.message}`);
    }

    return new Error('Bedrock condition grading failed with an unknown error');
  }
}
