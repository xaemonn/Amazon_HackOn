/**
 * GradingOrchestrator unit tests.
 *
 * Covers:
 * - Happy path: identity + condition + reason parsing → ItemGraded published
 * - Fraud score >= threshold → FraudFlagged published (Req 7.2, 7.5)
 * - Identity verification failure + retry → inconclusive fallback (Req 9.5)
 * - Condition grading failure + retry → fallback assessment (Req 9.1, 9.2)
 * - Both fail → fallback + no FraudFlagged (Req 9.6)
 * - Reason parser failure → unparseable reconciliation
 * - No reason text → reason parsing skipped
 * - Grading failure does NOT publish FraudFlagged even if fraud score is high
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GradingOrchestrator, type GradingInput } from './GradingOrchestrator.js';
import type { IConditionGrader, ConditionGradeResult } from '../../domain/grading/IConditionGrader.js';
import type { IIdentityVerifier, IdentityVerificationResult } from '../../domain/grading/IIdentityVerifier.js';
import type { IReasonParser, ReasonReconciliation } from '../../domain/grading/IReasonParser.js';
import type { IFraudScoreCalculator, FraudScoreResult } from '../../domain/grading/FraudScoreCalculator.js';
import type { IEventBus, DomainEvent } from '../../domain/shared/events.js';
import type { AppConfig } from '../../infrastructure/config/index.js';
import { DEFAULT_CONFIG } from '../../infrastructure/config/index.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockEventBus(): IEventBus & { publishedEvents: DomainEvent[] } {
  const publishedEvents: DomainEvent[] = [];
  return {
    publishedEvents,
    publish: vi.fn(async (event: DomainEvent) => { publishedEvents.push(event); }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

function createMockConditionGrader(result?: ConditionGradeResult): IConditionGrader {
  const defaultResult: ConditionGradeResult = {
    grade: 'A',
    reasoning: 'Item is in like-new condition.',
    defects: [],
    confidence: 0.95,
  };
  return {
    assessCondition: vi.fn().mockResolvedValue(result ?? defaultResult),
  };
}

function createMockIdentityVerifier(result?: IdentityVerificationResult): IIdentityVerifier {
  const defaultResult: IdentityVerificationResult = {
    verdict: 'genuine',
    confidence: 0.95,
  };
  return {
    verifyIdentity: vi.fn().mockResolvedValue(result ?? defaultResult),
  };
}

function createMockReasonParser(result?: ReasonReconciliation): IReasonParser {
  const defaultResult: ReasonReconciliation = {
    status: 'aligns',
    claims: [{ claimType: 'damage_description', itemArea: 'screen', description: 'cracked', verdict: 'supported' }],
    rawText: 'screen is cracked',
  };
  return {
    parseReason: vi.fn().mockResolvedValue(result ?? defaultResult),
  };
}

function createMockFraudCalculator(result?: Partial<FraudScoreResult>): IFraudScoreCalculator {
  const defaultResult: FraudScoreResult = {
    score: 0.1,
    requiresManualReview: false,
    manualReviewReasons: [],
    missingSignals: [],
  };
  return {
    compute: vi.fn().mockReturnValue({ ...defaultResult, ...result }),
  };
}

function createTestConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    gradingTimeouts: {
      conditionGraderTimeoutMs: 500,   // short for tests
      identityVerifierTimeoutMs: 300,  // short for tests
      retryDelayMs: 10,                // minimal delay for tests
      maxRetries: 1,
    },
    fraud: {
      ...DEFAULT_CONFIG.fraud,
      threshold: 0.7,
    },
    ...overrides,
  };
}

function createDefaultInput(overrides?: Partial<GradingInput>): GradingInput {
  return {
    returnRequestId: 'ret-001',
    productId: 'prod-001',
    mediaReferences: [
      { id: 'm1', type: 'photo_front', storageKey: 'key1', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() },
      { id: 'm2', type: 'photo_back', storageKey: 'key2', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() },
      { id: 'm3', type: 'photo_closeup', storageKey: 'key3', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() },
      { id: 'm4', type: 'video', storageKey: 'key4', format: 'mp4', sizeBytes: 5000, capturedAt: new Date() },
    ],
    catalogImageRef: 'catalog/prod-001.jpg',
    reasonText: 'The screen is cracked in the top-left corner',
    customerId: 'cust-001',
    returnHistoryCount90Days: 1,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GradingOrchestrator', () => {
  let eventBus: IEventBus & { publishedEvents: DomainEvent[] };
  let conditionGrader: IConditionGrader;
  let identityVerifier: IIdentityVerifier;
  let reasonParser: IReasonParser;
  let fraudCalculator: IFraudScoreCalculator;
  let config: AppConfig;

  beforeEach(() => {
    eventBus = createMockEventBus();
    conditionGrader = createMockConditionGrader();
    identityVerifier = createMockIdentityVerifier();
    reasonParser = createMockReasonParser();
    fraudCalculator = createMockFraudCalculator();
    config = createTestConfig();
  });

  function createOrchestrator() {
    return new GradingOrchestrator(
      conditionGrader,
      identityVerifier,
      reasonParser,
      fraudCalculator,
      eventBus,
      config,
    );
  }

  describe('happy path', () => {
    it('should produce a complete assessment with all services succeeding', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput();

      const assessment = await orchestrator.grade(input);

      expect(assessment.returnRequestId).toBe('ret-001');
      expect(assessment.grade).toBe('A');
      expect(assessment.confidence).toBe(0.95);
      expect(assessment.identityVerdict).toBe('genuine');
      expect(assessment.identityConfidence).toBe(0.95);
      expect(assessment.reconciliation.status).toBe('aligns');
      expect(assessment.requiresManualReview).toBe(false);
      expect(assessment.gradedAt).toBeInstanceOf(Date);
    });

    it('should call IIdentityVerifier with correct parameters', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput();

      await orchestrator.grade(input);

      expect(identityVerifier.verifyIdentity).toHaveBeenCalledWith(
        input.mediaReferences,
        input.catalogImageRef,
        input.productId,
      );
    });

    it('should call IConditionGrader with correct parameters', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput();

      await orchestrator.grade(input);

      expect(conditionGrader.assessCondition).toHaveBeenCalledWith(
        input.mediaReferences,
        input.productId,
        input.catalogImageRef,
        input.reasonText ?? undefined,
      );
    });

    it('should call IReasonParser when reasonText is provided and condition grading succeeds', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput();

      await orchestrator.grade(input);

      expect(reasonParser.parseReason).toHaveBeenCalledWith(
        input.reasonText,
        [], // defects from condition result
        input.productId,
      );
    });

    it('should always publish ItemGraded event on success', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput();

      await orchestrator.grade(input);

      const itemGraded = eventBus.publishedEvents.find(e => e.eventType === 'ItemGraded');
      expect(itemGraded).toBeDefined();
      expect(itemGraded!.payload.returnRequestId).toBe('ret-001');
      expect(itemGraded!.payload.grade).toBe('A');
      expect(itemGraded!.payload.confidence).toBe(0.95);
      expect(itemGraded!.payload.identityVerdict).toBe('genuine');
    });

    it('should NOT publish FraudFlagged when fraudScore < threshold', async () => {
      fraudCalculator = createMockFraudCalculator({ score: 0.3 });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const fraudEvents = eventBus.publishedEvents.filter(e => e.eventType === 'FraudFlagged');
      expect(fraudEvents).toHaveLength(0);
    });
  });

  describe('FraudFlagged event publication (Req 7.2, 7.5)', () => {
    it('should publish FraudFlagged when fraudScore >= threshold', async () => {
      fraudCalculator = createMockFraudCalculator({ score: 0.8, requiresManualReview: false, manualReviewReasons: [] });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const fraudEvent = eventBus.publishedEvents.find(e => e.eventType === 'FraudFlagged');
      expect(fraudEvent).toBeDefined();
      expect(fraudEvent!.payload.fraudScore).toBe(0.8);
      expect(fraudEvent!.payload.returnRequestId).toBe('ret-001');
    });

    it('should publish FraudFlagged when fraudScore equals threshold exactly (Req 7.5)', async () => {
      fraudCalculator = createMockFraudCalculator({ score: 0.7, requiresManualReview: false, manualReviewReasons: [] });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const fraudEvent = eventBus.publishedEvents.find(e => e.eventType === 'FraudFlagged');
      expect(fraudEvent).toBeDefined();
      expect(fraudEvent!.payload.fraudScore).toBe(0.7);
    });
  });

  describe('identity verification failure (Req 9.5)', () => {
    it('should set identity to inconclusive when verifier fails after retry', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.identityVerdict).toBe('inconclusive');
      expect(assessment.identityConfidence).toBe(0.0);
      expect(assessment.requiresManualReview).toBe(true);
      expect(assessment.manualReviewReasons).toContain('identity_verification_unavailable');
    });

    it('should retry identity verifier once before failing', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('timeout')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      // 1 initial attempt + 1 retry = 2 calls
      expect(identityVerifier.verifyIdentity).toHaveBeenCalledTimes(2);
    });

    it('should succeed on retry if first call fails', async () => {
      const successResult: IdentityVerificationResult = { verdict: 'genuine', confidence: 0.92 };
      identityVerifier = {
        verifyIdentity: vi.fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce(successResult),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.identityVerdict).toBe('genuine');
      expect(assessment.identityConfidence).toBe(0.92);
    });

    it('should still proceed with condition grading when identity fails (Req 9.5)', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.grade).toBe('A');
      expect(conditionGrader.assessCondition).toHaveBeenCalled();
    });

    it('should publish ItemGraded even when identity verification fails', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const itemGraded = eventBus.publishedEvents.find(e => e.eventType === 'ItemGraded');
      expect(itemGraded).toBeDefined();
    });
  });

  describe('condition grading failure (Req 9.1, 9.2)', () => {
    it('should produce fallback assessment when condition grader fails after retry', async () => {
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('AI service error')),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.grade).toBeNull();
      expect(assessment.confidence).toBe(0.0);
      expect(assessment.defects).toEqual([]);
      expect(assessment.reasoning).toBe('');
      expect(assessment.requiresManualReview).toBe(true);
      expect(assessment.manualReviewReasons).toContain('condition_grading_timeout');
    });

    it('should retry condition grader once before failing', async () => {
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('timeout')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      // 1 initial attempt + 1 retry = 2 calls
      expect(conditionGrader.assessCondition).toHaveBeenCalledTimes(2);
    });

    it('should succeed on retry if first condition grading call fails', async () => {
      const successResult: ConditionGradeResult = {
        grade: 'B',
        reasoning: 'Minor wear detected.',
        defects: [{ location: 'corner', severity: 'minor', description: 'small scratch' }],
        confidence: 0.88,
      };
      conditionGrader = {
        assessCondition: vi.fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce(successResult),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.grade).toBe('B');
      expect(assessment.confidence).toBe(0.88);
    });

    it('should NOT publish FraudFlagged when condition grading fails (Req 9.2)', async () => {
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      // High fraud score that would otherwise trigger FraudFlagged
      fraudCalculator = createMockFraudCalculator({ score: 0.95 });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const fraudEvents = eventBus.publishedEvents.filter(e => e.eventType === 'FraudFlagged');
      expect(fraudEvents).toHaveLength(0);
    });

    it('should still publish ItemGraded on condition grading failure', async () => {
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const itemGraded = eventBus.publishedEvents.find(e => e.eventType === 'ItemGraded');
      expect(itemGraded).toBeDefined();
      expect(itemGraded!.payload.grade).toBeNull();
      expect(itemGraded!.payload.confidence).toBe(0.0);
      expect(itemGraded!.payload.requiresManualReview).toBe(true);
    });

    it('should NOT call reason parser when condition grading fails', async () => {
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      expect(reasonParser.parseReason).not.toHaveBeenCalled();
    });
  });

  describe('both identity and condition grading fail (Req 9.6)', () => {
    it('should produce fallback assessment with both flags', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('fail')),
      };
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.grade).toBeNull();
      expect(assessment.confidence).toBe(0.0);
      expect(assessment.identityVerdict).toBe('inconclusive');
      expect(assessment.identityConfidence).toBe(0.0);
      expect(assessment.requiresManualReview).toBe(true);
      expect(assessment.manualReviewReasons).toContain('identity_verification_unavailable');
      expect(assessment.manualReviewReasons).toContain('condition_grading_timeout');
    });

    it('should NOT publish FraudFlagged when both fail', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('fail')),
      };
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      fraudCalculator = createMockFraudCalculator({ score: 0.99 });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const fraudEvents = eventBus.publishedEvents.filter(e => e.eventType === 'FraudFlagged');
      expect(fraudEvents).toHaveLength(0);
    });

    it('should still publish ItemGraded when both fail', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('fail')),
      };
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      const itemGraded = eventBus.publishedEvents.find(e => e.eventType === 'ItemGraded');
      expect(itemGraded).toBeDefined();
    });
  });

  describe('reason parser behavior', () => {
    it('should skip reason parsing when reasonText is null', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput({ reasonText: null });

      const assessment = await orchestrator.grade(input);

      expect(reasonParser.parseReason).not.toHaveBeenCalled();
      expect(assessment.reconciliation.status).toBe('unparseable');
      expect(assessment.reconciliation.rawText).toBe('');
    });

    it('should handle reason parser failure gracefully', async () => {
      reasonParser = {
        parseReason: vi.fn().mockRejectedValue(new Error('NLP service error')),
      };
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.reconciliation.status).toBe('unparseable');
      expect(assessment.reconciliation.claims).toEqual([]);
    });

    it('should pass defects from condition grading to reason parser', async () => {
      const defects = [
        { location: 'screen', severity: 'severe' as const, description: 'cracked glass' },
      ];
      conditionGrader = createMockConditionGrader({
        grade: 'C',
        reasoning: 'Significant damage',
        defects,
        confidence: 0.85,
      });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      expect(reasonParser.parseReason).toHaveBeenCalledWith(
        expect.any(String),
        defects,
        'prod-001',
      );
    });
  });

  describe('timeout behavior', () => {
    it('should timeout identity verifier when it takes too long', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn(() => new Promise((_resolve) => setTimeout(() => {}, 5000))),
      };
      config = createTestConfig({
        gradingTimeouts: {
          identityVerifierTimeoutMs: 50,
          conditionGraderTimeoutMs: 500,
          retryDelayMs: 10,
          maxRetries: 1,
        },
      });
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.identityVerdict).toBe('inconclusive');
      expect(assessment.identityConfidence).toBe(0.0);
    });

    it('should timeout condition grader when it takes too long', async () => {
      conditionGrader = {
        assessCondition: vi.fn(() => new Promise((_resolve) => setTimeout(() => {}, 5000))),
      };
      config = createTestConfig({
        gradingTimeouts: {
          identityVerifierTimeoutMs: 300,
          conditionGraderTimeoutMs: 50,
          retryDelayMs: 10,
          maxRetries: 1,
        },
      });
      const orchestrator = createOrchestrator();

      const assessment = await orchestrator.grade(createDefaultInput());

      expect(assessment.grade).toBeNull();
      expect(assessment.confidence).toBe(0.0);
      expect(assessment.requiresManualReview).toBe(true);
    });
  });

  describe('fraud score computation integration', () => {
    it('should pass correct inputs to fraud score calculator', async () => {
      const orchestrator = createOrchestrator();
      const input = createDefaultInput({ returnHistoryCount90Days: 5 });

      await orchestrator.grade(input);

      expect(fraudCalculator.compute).toHaveBeenCalledWith({
        identityVerdict: 'genuine',
        identityConfidence: 0.95,
        reconciliationStatus: 'aligns',
        unsupportedClaimCount: 0,
        returnHistoryCount90Days: 5,
      });
    });

    it('should pass null identity signals when identity verification fails', async () => {
      identityVerifier = {
        verifyIdentity: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      expect(fraudCalculator.compute).toHaveBeenCalledWith(
        expect.objectContaining({
          identityVerdict: null,
          identityConfidence: null,
        }),
      );
    });

    it('should pass null reconciliation status when condition grading fails', async () => {
      conditionGrader = {
        assessCondition: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      expect(fraudCalculator.compute).toHaveBeenCalledWith(
        expect.objectContaining({
          reconciliationStatus: null,
        }),
      );
    });

    it('should count unsupported claims correctly', async () => {
      reasonParser = createMockReasonParser({
        status: 'contradicts',
        claims: [
          { claimType: 'damage_description', itemArea: 'screen', description: 'cracked', verdict: 'unsupported' },
          { claimType: 'cosmetic_issue', itemArea: 'back', description: 'dent', verdict: 'unsupported' },
          { claimType: 'functional_defect', itemArea: 'power', description: 'no charge', verdict: 'supported' },
        ],
        rawText: 'test',
      });
      const orchestrator = createOrchestrator();

      await orchestrator.grade(createDefaultInput());

      expect(fraudCalculator.compute).toHaveBeenCalledWith(
        expect.objectContaining({
          unsupportedClaimCount: 2,
        }),
      );
    });
  });
});
