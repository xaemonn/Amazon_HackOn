/**
 * Repository interface for persisting and retrieving ConditionAssessment aggregates.
 *
 * Implementations:
 *  - DynamoConditionAssessmentRepository  (infrastructure/persistence) — DynamoDB
 *  - InMemoryConditionAssessmentRepository (infrastructure/persistence) — dev/test
 *
 * Requirements: 16.1, 16.2
 */

import type { ConditionAssessment } from './ConditionAssessment.js';

/**
 * IConditionAssessmentRepository — storage contract for condition assessments.
 *
 * One `ConditionAssessment` exists per `ReturnRequest`; an upsert on `save`
 * is acceptable since a re-grade replaces the previous assessment.
 */
export interface IConditionAssessmentRepository {
  /**
   * Persist or replace the condition assessment for the given return request.
   *
   * @param assessment - The fully-populated ConditionAssessment to store.
   */
  save(assessment: ConditionAssessment): Promise<void>;

  /**
   * Retrieve the condition assessment associated with a return request.
   *
   * @param returnRequestId - Identifier of the parent ReturnRequest.
   * @returns The matching `ConditionAssessment`, or `null` if not yet graded.
   */
  findByReturnRequestId(returnRequestId: string): Promise<ConditionAssessment | null>;
}
