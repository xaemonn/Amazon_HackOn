/**
 * InMemoryConditionAssessmentRepository — dev/test implementation of IConditionAssessmentRepository.
 *
 * Stores condition assessments in-memory, keyed by returnRequestId.
 * Upsert semantics: saving a new assessment for the same return request
 * replaces the previous one (a re-grade replaces the prior assessment).
 *
 * Requirements: 5.7, 10.13
 */

import type { ConditionAssessment } from '../../domain/grading/ConditionAssessment.js';
import type { IConditionAssessmentRepository } from '../../domain/grading/IConditionAssessmentRepository.js';

export class InMemoryConditionAssessmentRepository implements IConditionAssessmentRepository {
  /** Storage: returnRequestId → ConditionAssessment */
  private readonly store = new Map<string, ConditionAssessment>();

  /**
   * Persist or replace the condition assessment for a return request.
   */
  async save(assessment: ConditionAssessment): Promise<void> {
    this.store.set(assessment.returnRequestId, assessment);
  }

  /**
   * Retrieve the condition assessment for a return request.
   * Returns null if no assessment has been stored for the given id.
   */
  async findByReturnRequestId(returnRequestId: string): Promise<ConditionAssessment | null> {
    return this.store.get(returnRequestId) ?? null;
  }

  /**
   * Return total number of stored assessments.
   * Useful for tests.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all assessments (useful in tests for teardown).
   */
  clear(): void {
    this.store.clear();
  }
}
