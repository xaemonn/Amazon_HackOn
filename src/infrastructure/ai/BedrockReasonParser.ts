/**
 * BedrockReasonParser — Amazon Bedrock-powered reason parser and reconciler.
 *
 * Sends the customer's free-text return reason and the list of observed defects
 * to a Bedrock text model, which extracts structured claims and reconciles each
 * claim against the photographic evidence.
 *
 * Implements:
 *  - IReasonParser (dedicated interface from domain/grading/IReasonParser.ts)
 *  - IReasonParser (barrel export interface from domain/grading/index.ts) via alias
 *
 * Requirements: 6.1, 6.2
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';

import type { IReasonParser as IReasonParserBarrel, ReasonReconciliation, ParsedClaim, ClaimType, ClaimVerdict, ReconciliationStatus } from '../../domain/grading/index.js';
import type { IReasonParser as IReasonParserDedicated } from '../../domain/grading/IReasonParser.js';
import type { Defect } from '../../domain/shared/types.js';

// ─── Types for Bedrock response parsing ──────────────────────────────────────

interface BedrockClaimResponse {
  claimType: string;
  itemArea: string;
  description: string;
  verdict: string;
}

interface BedrockReconciliationResponse {
  status: string;
  claims: BedrockClaimResponse[];
}

// ─── Valid values for type narrowing ─────────────────────────────────────────

const VALID_CLAIM_TYPES: ClaimType[] = [
  'damage_description',
  'missing_component',
  'cosmetic_issue',
  'functional_defect',
];

const VALID_VERDICTS: ClaimVerdict[] = ['supported', 'unsupported', 'inconclusive'];

const VALID_STATUSES: ReconciliationStatus[] = [
  'aligns',
  'partially_aligns',
  'contradicts',
  'unparseable',
];

// ─── Implementation ───────────────────────────────────────────────────────────

export class BedrockReasonParser implements IReasonParserBarrel, IReasonParserDedicated {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(options?: { region?: string; modelId?: string }) {
    this.client = new BedrockRuntimeClient({
      region: options?.region ?? process.env.AWS_REGION ?? 'us-east-1',
    });
    this.modelId =
      options?.modelId ??
      process.env.ZTR_BEDROCK_MODEL_ID ??
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
  }

  /**
   * Parse reason — dedicated file interface (IReasonParser from IReasonParser.ts).
   *
   * Sends free-text + defects to Bedrock for structured claim extraction
   * and reconciliation against observed evidence.
   */
  async parseReason(
    freeText: string,
    defects: Defect[],
    _productId: string
  ): Promise<ReasonReconciliation> {
    return this.parseAndReconcile(freeText, defects);
  }

  /**
   * Parse and reconcile — barrel export interface (IReasonParser from index.ts).
   *
   * Primary implementation that calls Bedrock to extract claims and reconcile
   * them against observed defects.
   */
  async parseAndReconcile(
    freeText: string,
    observedDefects: Defect[]
  ): Promise<ReasonReconciliation> {
    const trimmed = freeText.trim();

    // If text is empty, return unparseable immediately without calling the model
    if (trimmed.length === 0) {
      return {
        status: 'unparseable',
        claims: [],
        rawText: freeText,
      };
    }

    try {
      const prompt = this.buildPrompt(trimmed, observedDefects);
      const responseText = await this.invokeModel(prompt);
      const parsed = this.parseModelResponse(responseText);

      return {
        status: parsed.status,
        claims: parsed.claims,
        rawText: freeText,
      };
    } catch {
      // Graceful degradation: on any failure, return unparseable with empty claims
      return {
        status: 'unparseable',
        claims: [],
        rawText: freeText,
      };
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Build the structured prompt sent to Bedrock for claim extraction and reconciliation.
   */
  private buildPrompt(freeText: string, defects: Defect[]): string {
    const defectsDescription =
      defects.length > 0
        ? defects
            .map(
              (d, i) =>
                `  ${i + 1}. Location: "${d.location}", Severity: ${d.severity}, Description: "${d.description}"`
            )
            .join('\n')
        : '  (No defects observed in photos)';

    return `You are an AI assistant that analyzes customer return reasons and reconciles them against photographic evidence.

## Task
1. Extract structured claims from the customer's free-text return reason.
2. For each claim, determine a verdict by comparing it against the observed defects from photos.
3. Determine the overall reconciliation status.

## Customer's Free-Text Return Reason
"${freeText}"

## Observed Defects from Photos
${defectsDescription}

## Instructions

Extract each distinct claim the customer makes. For each claim, assign:
- claimType: one of "damage_description", "missing_component", "cosmetic_issue", "functional_defect"
- itemArea: the part of the item referenced (e.g., "screen", "charging port", "body")
- description: a normalized description of what the customer claims
- verdict: compare the claim against observed defects:
  - "supported" — a matching defect confirms the claim
  - "unsupported" — observed defects contradict or do not corroborate the claim
  - "inconclusive" — not enough evidence to confirm or deny (e.g., no defects observed at all)

Then determine the overall status:
- "aligns" — ALL claims are supported
- "partially_aligns" — at least one claim is supported AND at least one is unsupported or inconclusive
- "contradicts" — NO claims are supported (all are unsupported)
- "unparseable" — the text cannot be parsed into meaningful claims

## Output Format
Respond with ONLY a valid JSON object (no markdown fencing, no explanation) in this exact format:
{
  "status": "<aligns|partially_aligns|contradicts|unparseable>",
  "claims": [
    {
      "claimType": "<damage_description|missing_component|cosmetic_issue|functional_defect>",
      "itemArea": "<string>",
      "description": "<string>",
      "verdict": "<supported|unsupported|inconclusive>"
    }
  ]
}`;
  }

  /**
   * Invoke the Bedrock model using the Converse API.
   */
  private async invokeModel(prompt: string): Promise<string> {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ];

    const command = new ConverseCommand({
      modelId: this.modelId,
      messages,
      inferenceConfig: {
        maxTokens: 1024,
        temperature: 0.1, // Low temperature for deterministic structured output
      },
    });

    const response = await this.client.send(command);

    const outputContent = response.output?.message?.content;
    if (!outputContent || outputContent.length === 0) {
      throw new Error('Empty response from Bedrock model');
    }

    const textBlock = outputContent.find((block) => 'text' in block);
    if (!textBlock || !('text' in textBlock) || !textBlock.text) {
      throw new Error('No text content in Bedrock model response');
    }

    return textBlock.text;
  }

  /**
   * Parse the raw model response text into a validated ReasonReconciliation.
   * Strips any markdown code fencing and validates all enum values.
   */
  private parseModelResponse(responseText: string): { status: ReconciliationStatus; claims: ParsedClaim[] } {
    // Strip potential markdown code fencing
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed: BedrockReconciliationResponse = JSON.parse(cleaned);

    // Validate and narrow the status
    const status = this.validateStatus(parsed.status);

    // Validate and narrow each claim
    const claims: ParsedClaim[] = [];
    if (Array.isArray(parsed.claims)) {
      for (const rawClaim of parsed.claims) {
        const claim = this.validateClaim(rawClaim);
        if (claim) {
          claims.push(claim);
        }
      }
    }

    // If no valid claims were extracted, treat as unparseable
    if (claims.length === 0 && status !== 'unparseable') {
      return { status: 'unparseable', claims: [] };
    }

    return { status, claims };
  }

  /**
   * Validate and narrow a status string to a ReconciliationStatus.
   */
  private validateStatus(raw: string): ReconciliationStatus {
    if (VALID_STATUSES.includes(raw as ReconciliationStatus)) {
      return raw as ReconciliationStatus;
    }
    return 'unparseable';
  }

  /**
   * Validate and narrow a raw claim object into a ParsedClaim, or null if invalid.
   */
  private validateClaim(raw: BedrockClaimResponse): ParsedClaim | null {
    if (!raw || typeof raw !== 'object') return null;

    const claimType = raw.claimType as ClaimType;
    if (!VALID_CLAIM_TYPES.includes(claimType)) return null;

    const verdict = raw.verdict as ClaimVerdict;
    if (!VALID_VERDICTS.includes(verdict)) return null;

    if (typeof raw.itemArea !== 'string' || raw.itemArea.trim().length === 0) return null;
    if (typeof raw.description !== 'string' || raw.description.trim().length === 0) return null;

    return {
      claimType,
      itemArea: raw.itemArea.trim(),
      description: raw.description.trim(),
      verdict,
    };
  }
}
