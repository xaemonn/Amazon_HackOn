/**
 * ReturnStateMachine — enforces legal state transitions for ReturnRequest.
 *
 * Implements the State Pattern: the legal-transition map is data-driven
 * (a Record), not a chain of if/else. This satisfies the Open/Closed
 * principle — a new state or edge is added by extending the map, not by
 * editing existing logic.
 *
 * Single Responsibility: this class ONLY enforces transitions and optionally
 * persists an audit record via an injected IAuditLogRepository.
 * It does NOT notify, publish events, or depend on infrastructure.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.5
 */

import { ReturnRequest } from './ReturnRequest.js';
import type { ReturnState } from './ReturnRequest.js';
import type { IAuditLogRepository } from './IAuditLogRepository.js';

// ─── Legal Transition Map ─────────────────────────────────────────────────────

/**
 * Canonical transition map for the ReturnRequest lifecycle.
 *
 * Each key is a source state; its value is the set of states it may legally
 * transition to. Terminal states (Completed, Cancelled) have empty arrays.
 *
 * Requirement 14.1 — the full state graph.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<ReturnState, readonly ReturnState[]>> = {
  Initiated: ['MediaCaptured', 'Cancelled'],
  MediaCaptured: ['Grading', 'Cancelled'],
  Grading: ['Graded'],
  Graded: ['DispositionAssigned', 'ManualReview'],
  DispositionAssigned: ['AwaitingPickup', 'Listed', 'Completed', 'ManualReview'],
  AwaitingPickup: ['Completed', 'Cancelled'],
  Listed: ['Completed'],
  Completed: [],
  Cancelled: [],
  ManualReview: ['Graded', 'Cancelled'],
} as const;

// ─── IReturnStateMachine ──────────────────────────────────────────────────────

/**
 * Contract for the ReturnRequest state machine.
 *
 * Dependency Inversion: application/domain code depends on this interface,
 * never on the concrete ReturnStateMachine class.
 */
export interface IReturnStateMachine {
  /**
   * Attempt to transition a ReturnRequest to the given target state.
   *
   * On success, returns a **new** ReturnRequest instance with:
   *   - `state` updated to `targetState`
   *   - `updatedAt` set to `new Date()`
   *
   * If an `IAuditLogRepository` was injected (or passed via `options`), an
   * AuditRecord is persisted asynchronously for every successful transition.
   *
   * On failure (illegal transition), throws an Error describing the current
   * state, the attempted state, and the legal alternatives.
   *
   * Requirement 14.2, 14.3, 14.5
   *
   * @param request     - The current ReturnRequest aggregate.
   * @param targetState - The desired next state.
   * @param actor       - Who triggered the transition (customerId, "system", adminId).
   * @param options     - Optional: trigger label and a one-shot audit log override.
   * @returns           A new ReturnRequest in the target state.
   * @throws            Error when the transition is not in the legal-transition map.
   */
  transition(
    request: ReturnRequest,
    targetState: ReturnState,
    actor: string,
    options?: TransitionOptions,
  ): ReturnRequest;

  /**
   * Return the set of states the machine may legally transition to from
   * the given current state.
   *
   * @param currentState - The state to query.
   * @returns            Array of valid next states (may be empty for terminal states).
   */
  getLegalTransitions(currentState: ReturnState): ReturnState[];
}

// ─── TransitionOptions ────────────────────────────────────────────────────────

/**
 * Optional parameters for a transition call.
 */
export interface TransitionOptions {
  /**
   * Human-readable description of the event or command that triggered the
   * transition. e.g. "completeMediaCapture", "ItemGraded event", "admin override".
   * Defaults to `"${actor} → ${targetState}"` when omitted.
   */
  trigger?: string;
  /**
   * A one-shot audit log repository override. When provided, this overrides
   * the repository injected at construction time for this single call.
   * Useful in tests and for scenarios where the calling code owns the repo.
   */
  auditLog?: IAuditLogRepository;
}

// ─── ReturnStateMachine ───────────────────────────────────────────────────────

/**
 * Concrete implementation of IReturnStateMachine.
 *
 * Accepts an optional IAuditLogRepository at construction time (Dependency
 * Inversion — the domain layer depends only on the interface, never on the
 * concrete InMemoryAuditLogRepository). When provided, every successful
 * transition persists an AuditRecord. The class remains safely usable without
 * an audit repo (e.g. in unit tests that only test transition correctness).
 */
export class ReturnStateMachine implements IReturnStateMachine {
  constructor(private readonly auditLogRepository?: IAuditLogRepository) {}

  /**
   * Attempt to transition `request` to `targetState`.
   *
   * Produces a new ReturnRequest — the original is not mutated.
   * On success, fires-and-forgets an async audit record write.
   *
   * Requirement 14.2 — only legal transitions succeed.
   * Requirement 14.3 — illegal transitions throw with a descriptive message.
   * Requirement 14.5 — every successful transition persists an audit record.
   */
  transition(
    request: ReturnRequest,
    targetState: ReturnState,
    actor: string,
    options?: TransitionOptions,
  ): ReturnRequest {
    const currentState = request.state;
    const legal = LEGAL_TRANSITIONS[currentState];

    if (!(legal as readonly string[]).includes(targetState)) {
      const legalList = legal.length > 0 ? legal.join(', ') : '(none — terminal state)';
      throw new Error(
        `Illegal transition from '${currentState}' to '${targetState}'. ` +
        `Legal transitions: ${legalList}`,
      );
    }

    const transitionedAt = new Date();

    const updated = new ReturnRequest({
      ...request.toProps(),
      state: targetState,
      updatedAt: transitionedAt,
    });

    // Persist the audit record via whichever repo is available (one-shot
    // override wins over the constructor-injected one). Fire-and-forget: we
    // do not await so the synchronous contract of transition() is preserved.
    const repo = options?.auditLog ?? this.auditLogRepository;
    if (repo) {
      const trigger = options?.trigger ?? `${actor} → ${targetState}`;
      const record = {
        id: generateId(),
        returnRequestId: request.id,
        previousState: currentState,
        newState: targetState,
        timestamp: transitionedAt,
        actor,
        trigger,
      };
      // Intentionally not awaited — callers that need write confirmation
      // should await the returned promise themselves via the repo directly.
      void repo.save(record).catch((err: unknown) => {
        // Audit log failures must NEVER break the state transition.
        // Log the failure but do not propagate.
        console.error('[ReturnStateMachine] Failed to persist audit record', {
          returnRequestId: record.returnRequestId,
          previousState: record.previousState,
          newState: record.newState,
          error: err,
        });
      });
    }

    return updated;
  }

  /**
   * Return the array of valid next states from `currentState`.
   *
   * Returns an empty array for terminal states (Completed, Cancelled).
   */
  getLegalTransitions(currentState: ReturnState): ReturnState[] {
    return [...LEGAL_TRANSITIONS[currentState]];
  }
}

// ─── ID generation ────────────────────────────────────────────────────────────

/**
 * Generate a unique id for audit records without importing infrastructure.
 * Uses crypto.randomUUID() when available (Node 14.17+, all modern browsers),
 * falls back to a simple timestamp+random string.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Minimal fallback: timestamp + random hex
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
