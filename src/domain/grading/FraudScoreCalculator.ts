/**
 * FraudScoreCalculator — pure domain service that computes a fraud risk score.
 *
 * Combines identity verdict, reconciliation status, unsupported claim count,
 * and return-history frequency into a single [0.0, 1.0] score.
 *
 * This is a pure domain function — it does NOT depend on infrastructure.
 * Config values are injected via constructor parameters.
 *
 * Requirements: 7.1, 7.3, 7.6
 */

import type { IdentityVerdict } from '../shared/types.js';
import type { ReconciliationStatus } from './IReasonParser.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FraudScoreInputs {
  identityVerdict: IdentityVerdict | null;
  identityConfidence: number | null;
  reconciliationStatus: ReconciliationStatus | null;
  unsupportedClaimCount: number;
  returnHistoryCount90Days: number | null;
}

export interface FraudScoreResult {
  score: number;                   // 0.0–1.0
  requiresManualReview: boolean;
  manualReviewReasons: string[];
  missingSignals: string[];
}

export interface FraudScoreConfig {
  unsupportedClaimIncrement: number;  // default 0.15
  highReturnHistoryThreshold: number; // number of returns in 90 days considered "high"
  highReturnHistoryWeight: number;    // score weight when history is high
}

export interface IFraudScoreCalculator {
  compute(inputs: FraudScoreInputs): FraudScoreResult;
}

// ─── Default config values ───────────────────────────────────────────────────

const DEFAULT_FRAUD_SCORE_CONFIG: FraudScoreConfig = {
  unsupportedClaimIncrement: 0.15,
  highReturnHistoryThreshold: 3,
  highReturnHistoryWeight: 0.15,
};

// ─── Implementation ──────────────────────────────────────────────────────────

export class FraudScoreCalculator implements IFraudScoreCalculator {
  private readonly config: FraudScoreConfig;

  constructor(config?: Partial<FraudScoreConfig>) {
    this.config = { ...DEFAULT_FRAUD_SCORE_CONFIG, ...config };
  }

  compute(inputs: FraudScoreInputs): FraudScoreResult {
    const missingSignals: string[] = [];
    const manualReviewReasons: string[] = [];

    // Detect missing signals
    if (inputs.identityVerdict === null || inputs.identityConfidence === null) {
      missingSignals.push('identity_verification');
    }
    if (inputs.reconciliationStatus === null) {
      missingSignals.push('reason_reconciliation');
    }
    if (inputs.returnHistoryCount90Days === null) {
      missingSignals.push('return_history');
    }

    // Rule: Identity mismatch → score ≥ 0.9 regardless of other signals (Req 7.3)
    if (inputs.identityVerdict === 'mismatch') {
      const score = Math.max(0.9, this.computeBaseScore(inputs, missingSignals));
      const requiresManualReview = missingSignals.length > 0;
      if (requiresManualReview) {
        manualReviewReasons.push(
          ...missingSignals.map(s => `${s}_unavailable`)
        );
      }
      return {
        score: this.clamp(score),
        requiresManualReview,
        manualReviewReasons,
        missingSignals,
      };
    }

    // Compute score from available signals
    const score = this.computeBaseScore(inputs, missingSignals);

    // If any signal is missing, set requires_manual_review (Req 7.6)
    const requiresManualReview = missingSignals.length > 0;
    if (requiresManualReview) {
      manualReviewReasons.push(
        ...missingSignals.map(s => `${s}_unavailable`)
      );
    }

    return {
      score: this.clamp(score),
      requiresManualReview,
      manualReviewReasons,
      missingSignals,
    };
  }

  private computeBaseScore(inputs: FraudScoreInputs, missingSignals: string[]): number {
    let score = 0.0;

    // Identity component
    if (inputs.identityVerdict !== null && inputs.identityConfidence !== null) {
      score += this.computeIdentityComponent(inputs.identityVerdict, inputs.identityConfidence);
    }

    // Reconciliation + unsupported claims component
    if (inputs.reconciliationStatus !== null) {
      score += this.computeReconciliationComponent(inputs.reconciliationStatus);
    }

    // Each unsupported claim adds configurable increment (Req 6.3)
    score += inputs.unsupportedClaimCount * this.config.unsupportedClaimIncrement;

    // Return history frequency component
    if (inputs.returnHistoryCount90Days !== null) {
      score += this.computeHistoryComponent(inputs.returnHistoryCount90Days);
    }

    return score;
  }

  private computeIdentityComponent(verdict: IdentityVerdict, confidence: number): number {
    switch (verdict) {
      case 'mismatch':
        // Should not reach here in normal flow (handled above), but be safe
        return 0.9;
      case 'inconclusive':
        return 0.2;
      case 'genuine':
        // Genuine with high confidence → minimal identity fraud component
        return confidence > 0.8 ? 0.0 : 0.05;
      default:
        return 0.0;
    }
  }

  private computeReconciliationComponent(status: ReconciliationStatus): number {
    switch (status) {
      case 'contradicts':
        return 0.3;
      case 'partially_aligns':
        return 0.1;
      case 'unparseable':
        return 0.0; // unparseable should not increase fraud score per Req 6.5
      case 'aligns':
        return 0.0;
      default:
        return 0.0;
    }
  }

  private computeHistoryComponent(returnCount90Days: number): number {
    if (returnCount90Days >= this.config.highReturnHistoryThreshold) {
      return this.config.highReturnHistoryWeight;
    }
    return 0.0;
  }

  private clamp(value: number): number {
    return Math.min(1.0, Math.max(0.0, value));
  }
}
