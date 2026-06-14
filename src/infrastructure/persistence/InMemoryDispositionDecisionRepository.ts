/**
 * InMemoryDispositionDecisionRepository — dev/test implementation of IDispositionDecisionRepository.
 *
 * Stores disposition decisions in-memory, keyed by returnRequestId.
 * Upsert semantics: saving a new decision for the same return request
 * replaces the previous one (a re-evaluation replaces the prior decision).
 *
 * Requirements: 5.7, 10.13
 */

import type { DispositionDecision } from '../../domain/disposition/DispositionDecision.js';
import type { IDispositionDecisionRepository } from '../../domain/disposition/IDispositionDecisionRepository.js';

export class InMemoryDispositionDecisionRepository implements IDispositionDecisionRepository {
  /** Storage: returnRequestId → DispositionDecision */
  private readonly store = new Map<string, DispositionDecision>();

  /**
   * Persist or replace the disposition decision for a return request.
   */
  async save(decision: DispositionDecision): Promise<void> {
    this.store.set(decision.returnRequestId, decision);
  }

  /**
   * Retrieve the disposition decision for a return request.
   * Returns null if no decision has been stored for the given id.
   */
  async findByReturnRequestId(returnRequestId: string): Promise<DispositionDecision | null> {
    return this.store.get(returnRequestId) ?? null;
  }

  /**
   * Return total number of stored decisions.
   * Useful for tests.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all decisions (useful in tests for teardown).
   */
  clear(): void {
    this.store.clear();
  }
}
