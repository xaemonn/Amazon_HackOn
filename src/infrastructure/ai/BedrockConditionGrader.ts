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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
const DEFAULT_REGION = 'us-east-1';

/** Maximum frames to extract from video for multimodal input. */
const MAX_VIDEO_FRAMES = 5;

const VALID_GRADES: Set<string> = new Set(['A', 'B', 'C', 'D']);
const VALID_SEVERITIES: Set<string> = new Set(['minor', 'moderate', 'severe']);

// ─── Grading Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(productId: string): string {
  return `You are an expert product condition grader for a returns platform. Your job is to assess the physical condition of a returned item based on the provided photos (and video frames if available).

Product ID: ${productId}

Grade the item on a scale of A to D:
- A: Like new, no visible defects, all original components intact
- B: Light signs of use, minor cosmetic marks, fully functional
- C: Noticeable cosmetic wear, moderate scratches/dents, may need refurbishment
- D: Significant damage, cracked/broken parts, suitable for parts or recycling only

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
  "confidence": 0.0 to 1.0
}

Rules:
- "reasoning" must be at most 500 characters
- "defects" must have at most 10 items
- "confidence" must be between 0.0 and 1.0
- If no defects are visible, return an empty defects array
- Be concise and factual in your reasoning`;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class BedrockConditionGrader implements IConditionGrader {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly timeoutMs: number;
  private readonly fetchMediaBytes: (storageKey: string) => Promise<Buffer>;

  constructor(config: BedrockConditionGraderConfig) {
    const region = config.region ?? DEFAULT_REGION;
    this.modelId = config.modelId ?? DEFAULT_MODEL_ID;
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
   * Photos are sent as images directly. Video references are noted as
   * placeholders (in production, frames would be extracted and sent as images).
   */
  async assessCondition(
    mediaReferences: MediaReference[],
    productId: string
  ): Promise<ConditionGradeResult> {
    const contentBlocks = await this.buildContentBlocks(mediaReferences);
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

      return this.parseModelResponse(textBlock.text);
    } catch (error: unknown) {
      throw this.wrapError(error);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Build content blocks for the Converse API from media references.
   * Photos are sent as image blocks; video references include a text note
   * (frame extraction would be needed in production).
   */
  private async buildContentBlocks(
    mediaReferences: MediaReference[]
  ): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = [];
    const photos = mediaReferences.filter((m) => m.type !== 'video');
    const videos = mediaReferences.filter((m) => m.type === 'video');

    // Add photo images
    for (const photo of photos) {
      try {
        const imageBytes = await this.fetchMediaBytes(photo.storageKey);
        const imageBlock: ImageBlock = {
          format: photo.format as 'jpeg' | 'png',
          source: {
            bytes: imageBytes,
          },
        };
        blocks.push({ image: imageBlock });
      } catch {
        // If a photo can't be fetched, add a text note and continue
        blocks.push({
          text: `[Unable to load photo: ${photo.type} - ${photo.storageKey}]`,
        });
      }
    }

    // Handle video references
    // Bedrock multimodal models accept images but not raw video.
    // In production, we'd extract 3-5 evenly-spaced frames from the video.
    // For the demo, we note the video presence in a text block.
    if (videos.length > 0) {
      blocks.push({
        text: `[${videos.length} video(s) provided. In production, ${MAX_VIDEO_FRAMES} evenly-spaced frames would be extracted and sent as images. Video types: ${videos.map((v) => v.type).join(', ')}]`,
      });
    }

    // If no blocks could be built, add a fallback text
    if (blocks.length === 0) {
      blocks.push({
        text: '[No media could be loaded. Please grade based on available context only.]',
      });
    }

    // Add the grading instruction as the final text block
    blocks.push({
      text: 'Please assess the condition of this returned item based on the images above and provide your grading in the specified JSON format.',
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

    return { grade, reasoning, defects, confidence };
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
