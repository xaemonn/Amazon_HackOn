/**
 * Repository interface for persisting and retrieving DispositionDecision entities.
 *
 * Implementations:
 *  - DynamoDispositionDecisionRepository    (infrastructure/persistence) — DynamoDB
 *  - InMemoryDispositionDecisionRepository  (infrastructure/persistence) — dev/test
 *
 * Requirements: 16.1, 16.2
 */

import type { DispositionDecision } from './DispositionDecision.js';

/**
 * IDispositionDecisionRepository — storage contract for disposition decisions.
 *
 * One `DispositionDecision` exists per `ReturnRequest` (the Disposition Engine
 * evaluates each item exactly once; a re-evaluation replaces the prior decision).
 */
export interface IDispositionDecisionRepository {
  /**
   * Persist or replace the disposition decision for a return request.
   *
   * @param decision - The fully-populated DispositionDecision to store.
   */
  save(decision: DispositionDecision): Promise<void>;

  /**
   * Retrieve the disposition decision for a return request.
   *
   * @param returnRequestId - Identifier of the parent ReturnRequest.
   * @returns               The matching `DispositionDecision`, or `null` if not yet decided.
   */
  findByReturnRequestId(returnRequestId: string): Promise<DispositionDecision | null>;
}
