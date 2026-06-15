/**
 * GradingOrchestrator — application-layer service that coordinates the full
 * grading pipeline: identity verification, condition assessment, reason parsing,
 * fraud scoring, and event publication.
 *
 * Implements timeout + retry logic per requirements:
 *  - IIdentityVerifier: 5s timeout, 1 retry on failure (configurable delay)
 *  - IConditionGrader: 10s timeout, 1 retry on failure (configurable delay)
 *  - IReasonParser: called after condition grading succeeds (no retry spec)
 *
 * On total grading failure (condition grader fails after retry):
 *  - Produces fallback ConditionAssessment (confidence 0.0, grade null, requires_manual_review=true)
 *  - Does NOT publish FraudFlagged event
 *  - Always publishes ItemGraded event
 *
 * Requirements: 5.6, 5.7, 9.1, 9.2, 9.5, 9.6, 7.2, 7.5
 */

import { randomUUID } from 'crypto';
import type { IConditionGrader, ConditionGradeResult } from '../../domain/grading/IConditionGrader.js';
import type { IIdentityVerifier, IdentityVerificationResult } from '../../domain/grading/IIdentityVerifier.js';
import type { IReasonParser, ReasonReconciliation } from '../../domain/grading/IReasonParser.js';
import type { IFraudScoreCalculator, FraudScoreInputs } from '../../domain/grading/FraudScoreCalculator.js';
import type { ConditionAssessment } from '../../domain/grading/ConditionAssessment.js';
import type { IConditionAssessmentRepository } from '../../domain/grading/IConditionAssessmentRepository.js';
import type { IEventBus, ItemGradedEvent, FraudFlaggedEvent } from '../../domain/shared/events.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { AppConfig } from '../../infrastructure/config/index.js';

// ─── Input DTO ───────────────────────────────────────────────────────────────

export interface GradingInput {
  returnRequestId: string;
  productId: string;
  mediaReferences: MediaReference[];
  /** One or more catalog "as-new" reference images (front/back/close-up). */
  catalogImageRefs: string[];
  reasonText: string | null;
  customerId: string;
  returnHistoryCount90Days: number;
}

// ─── GradingOrchestrator ─────────────────────────────────────────────────────

export class GradingOrchestrator {
  constructor(
    private readonly conditionGrader: IConditionGrader,
    private readonly identityVerifier: IIdentityVerifier,
    private readonly reasonParser: IReasonParser,
    private readonly fraudScoreCalculator: IFraudScoreCalculator,
    private readonly eventBus: IEventBus,
    private readonly config: AppConfig,
    private readonly conditionAssessmentRepository?: IConditionAssessmentRepository,
  ) {}

  /**
   * Execute the full grading pipeline and publish domain events.
   * Returns the produced ConditionAssessment.
   */
  async grade(input: GradingInput): Promise<ConditionAssessment> {
    const { gradingTimeouts, fraud } = this.config;

    // ── Steps 1 & 2: Identity Verification + Condition Grading (in parallel) ──
    // These are independent Bedrock calls; running them concurrently roughly
    // halves the total grading wall-clock time.
    let identityResult: IdentityVerificationResult | null = null;
    let identityFailed = false;
    let conditionResult: ConditionGradeResult | null = null;
    let conditionFailed = false;

    const [identitySettled, conditionSettled] = await Promise.allSettled([
      this.callWithTimeoutAndRetry(
        () => this.identityVerifier.verifyIdentity(
          input.mediaReferences,
          input.catalogImageRefs[0] ?? `catalog/${input.productId}.jpg`,
          input.productId,
        ),
        gradingTimeouts.identityVerifierTimeoutMs,
        gradingTimeouts.maxRetries,
        gradingTimeouts.retryDelayMs,
      ),
      this.callWithTimeoutAndRetry(
        () => this.conditionGrader.assessCondition(
          input.mediaReferences,
          input.productId,
          input.catalogImageRefs,
          input.reasonText ?? undefined,
        ),
        gradingTimeouts.conditionGraderTimeoutMs,
        gradingTimeouts.maxRetries,
        gradingTimeouts.retryDelayMs,
      ),
    ]);

    if (identitySettled.status === 'fulfilled') {
      identityResult = identitySettled.value;
    } else {
      console.error('[GradingOrchestrator] Identity verification failed:', identitySettled.reason instanceof Error ? identitySettled.reason.message : identitySettled.reason);
      identityFailed = true;
    }

    if (conditionSettled.status === 'fulfilled') {
      conditionResult = conditionSettled.value;
    } else {
      console.error('[GradingOrchestrator] Condition grading failed:', conditionSettled.reason instanceof Error ? conditionSettled.reason.message : conditionSettled.reason);
      conditionFailed = true;
    }

    // ── Step 3: Reason Parsing (only if condition grading succeeded + free-text exists)
    let reconciliation: ReasonReconciliation = {
      status: 'unparseable',
      claims: [],
      rawText: input.reasonText ?? '',
    };

    if (!conditionFailed && conditionResult && input.reasonText) {
      try {
        reconciliation = await this.reasonParser.parseReason(
          input.reasonText,
          conditionResult.defects,
          input.productId,
        );
      } catch {
        // Reason parsing failed — keep default unparseable reconciliation
      }
    }

    // ── Step 4: Build the ConditionAssessment ────────────────────────────

    const identityVerdict = identityResult?.verdict ?? 'inconclusive';
    const identityConfidence = identityResult?.confidence ?? 0.0;

    const manualReviewReasons: string[] = [];

    // ── Fraud / mismatch signals that genuinely warrant human review ──────
    // Per product policy, a return only goes to manual review when there is a
    // real fraud signal — chiefly: the customer's stated reason does NOT match
    // what the photos show, or the wrong item was returned, or the photos look
    // manipulated. Benign uncertainty (inconclusive identity, an unparseable
    // free-text reason) must NOT block automated grade-based disposition.

    const unsupportedClaimCount = reconciliation.claims.filter(
      (c) => c.verdict === 'unsupported',
    ).length;

    // (1) Reason ↔ image mismatch: stated reason is contradicted by the photos,
    //     or specific claims are unsupported by the visual evidence.
    const reasonMismatch =
      !!input.reasonText &&
      (reconciliation.status === 'contradicts' || unsupportedClaimCount > 0);
    if (reasonMismatch) {
      manualReviewReasons.push('reason_photo_mismatch');
    }

    // (2) Wrong item returned (identity mismatch) — clear fraud.
    if (identityVerdict === 'mismatch') {
      manualReviewReasons.push('item_mismatch');
    }

    // (3) Suspected AI-generated / manipulated photos.
    const authenticity = conditionResult?.authenticity;
    const suspectedAiImages =
      authenticity?.aiGenerated === true && authenticity.confidence >= 0.5;
    if (suspectedAiImages) {
      manualReviewReasons.push('suspected_ai_generated_images');
    }

    // (4) Technical failures — the AI couldn't verify identity or assess
    //     condition at all. Safe-default to human review (Req 9.1, 9.2, 9.5).
    //     NOTE: this is a *failure* of the check, NOT a benign 'inconclusive'
    //     verdict or an unparseable free-text reason — those must NOT block.
    if (identityFailed) {
      manualReviewReasons.push('identity_verification_unavailable');
    }
    if (conditionFailed) {
      manualReviewReasons.push('condition_grading_timeout');
    }

    // ── Step 5: Compute Fraud Score (aggregate signal) ───────────────────

    const fraudInputs: FraudScoreInputs = {
      identityVerdict: identityFailed ? null : identityVerdict,
      identityConfidence: identityFailed ? null : identityConfidence,
      reconciliationStatus: conditionFailed ? null : reconciliation.status,
      unsupportedClaimCount,
      returnHistoryCount90Days: input.returnHistoryCount90Days,
    };

    const fraudResult = this.fraudScoreCalculator.compute(fraudInputs);

    // Manual review fires for genuine fraud/mismatch and technical failures —
    // but NOT for a benign 'inconclusive' identity verdict or an unparseable
    // free-text reason on their own (those previously blocked clean returns).
    const requiresManualReview =
      conditionFailed ||
      identityFailed ||
      reasonMismatch ||
      identityVerdict === 'mismatch' ||
      suspectedAiImages ||
      (fraudResult.requiresManualReview && fraudResult.score >= fraud.threshold);

    // Surface the aggregate fraud reasons only when they actually block.
    if (requiresManualReview && fraudResult.requiresManualReview) {
      for (const reason of fraudResult.manualReviewReasons) {
        if (!manualReviewReasons.includes(reason)) {
          manualReviewReasons.push(reason);
        }
      }
    }

    // ── Build Assessment ─────────────────────────────────────────────────

    const assessment: ConditionAssessment = conditionFailed
      ? {
          // Fallback assessment (Req 9.1, 9.2, 9.6)
          returnRequestId: input.returnRequestId,
          grade: null,
          defects: [],
          reasoning: '',
          confidence: 0.0,
          identityVerdict,
          identityConfidence,
          fraudScore: fraudResult.score,
          reconciliation,
          requiresManualReview: true,
          manualReviewReasons,
          authenticity,
          gradedAt: new Date(),
        }
      : {
          returnRequestId: input.returnRequestId,
          grade: conditionResult!.grade,
          defects: conditionResult!.defects,
          reasoning: conditionResult!.reasoning,
          confidence: conditionResult!.confidence,
          identityVerdict,
          identityConfidence,
          fraudScore: fraudResult.score,
          reconciliation,
          requiresManualReview,
          manualReviewReasons,
          authenticity,
          gradedAt: new Date(),
        };

    // ── Step 6: Publish Events ───────────────────────────────────────────

    // Publish FraudFlagged ONLY when:
    //  - fraudScore >= threshold AND
    //  - condition grading did NOT fail (Req 9.2: grading failure SHALL NOT publish FraudFlagged)
    if (!conditionFailed && assessment.fraudScore >= fraud.threshold) {
      const fraudEvent: FraudFlaggedEvent = {
        eventId: randomUUID(),
        eventType: 'FraudFlagged',
        timestamp: new Date(),
        payload: {
          returnRequestId: input.returnRequestId,
          fraudScore: assessment.fraudScore,
          reasons: manualReviewReasons,
        },
      };
      await this.eventBus.publish(fraudEvent);
    }

    // Persist the condition assessment BEFORE publishing events so that
    // downstream subscribers (e.g. DispositionOrchestrator) can look it up.
    if (this.conditionAssessmentRepository) {
      await this.conditionAssessmentRepository.save(assessment);
    }

    // Always publish ItemGraded event (Req 5.7)
    const itemGradedEvent: ItemGradedEvent = {
      eventId: randomUUID(),
      eventType: 'ItemGraded',
      timestamp: new Date(),
      payload: {
        returnRequestId: input.returnRequestId,
        grade: assessment.grade,
        defects: assessment.defects,
        identityVerdict: assessment.identityVerdict,
        confidence: assessment.confidence,
        fraudScore: assessment.fraudScore,
        requiresManualReview: assessment.requiresManualReview,
      },
    };
    await this.eventBus.publish(itemGradedEvent);

    return assessment;
  }

  // ─── Timeout + Retry Helper ──────────────────────────────────────────────

  private async callWithTimeoutAndRetry<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    maxRetries: number,
    retryDelayMs: number,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await this.delay(retryDelayMs);
      }
      try {
        return await this.withTimeout(fn(), timeoutMs);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
