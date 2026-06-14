/**
 * Property 14: State Machine Enforces Legal Transitions
 *
 * Generates random (currentState, targetState) pairs from all 10 states × 10 states = 100 combinations.
 * Asserts: legal transitions succeed and update state; illegal transitions preserve state and throw error.
 *
 * **Validates: Requirements 14.2, 14.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ReturnRequest } from './ReturnRequest.js';
import type { ReturnState } from './ReturnRequest.js';
import { ReturnStateMachine, LEGAL_TRANSITIONS } from './ReturnStateMachine.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATES: ReturnState[] = [
  'Initiated',
  'MediaCaptured',
  'Grading',
  'Graded',
  'DispositionAssigned',
  'AwaitingPickup',
  'Listed',
  'Completed',
  'Cancelled',
  'ManualReview',
];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const arbState: fc.Arbitrary<ReturnState> = fc.oneof(
  ...ALL_STATES.map((s) => fc.constant(s)),
);

const arbStatePair: fc.Arbitrary<{ currentState: ReturnState; targetState: ReturnState }> =
  fc.record({
    currentState: arbState,
    targetState: arbState,
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal ReturnRequest in the given state for testing transitions.
 */
function buildRequest(state: ReturnState): ReturnRequest {
  return new ReturnRequest({
    id: 'test-return-id',
    customerId: 'customer-1',
    orderItemId: 'order-item-1',
    orderId: 'order-1',
    productId: 'product-1',
    state,
    reason: null,
    reasonDetails: null,
    media: [],
    conditionAssessment: null,
    dispositionDecision: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });
}

/**
 * Determine whether a transition from currentState to targetState is legal.
 */
function isLegalTransition(currentState: ReturnState, targetState: ReturnState): boolean {
  return (LEGAL_TRANSITIONS[currentState] as readonly ReturnState[]).includes(targetState);
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 14: State Machine Enforces Legal Transitions', () => {
  const stateMachine = new ReturnStateMachine();

  it('legal transitions succeed and update state to targetState', () => {
    // Generate only legal (currentState, targetState) pairs
    const arbLegalPair = arbStatePair.filter(({ currentState, targetState }) =>
      isLegalTransition(currentState, targetState),
    );

    fc.assert(
      fc.property(arbLegalPair, ({ currentState, targetState }) => {
        const request = buildRequest(currentState);
        const result = stateMachine.transition(request, targetState, 'test-actor');

        // The transition succeeds and the state is updated
        expect(result.state).toBe(targetState);
        // The original request is not mutated
        expect(request.state).toBe(currentState);
        // updatedAt is refreshed
        expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(request.updatedAt.getTime());
      }),
      { numRuns: 500 },
    );
  });

  it('illegal transitions throw an error and preserve state', () => {
    // Generate only illegal (currentState, targetState) pairs
    const arbIllegalPair = arbStatePair.filter(({ currentState, targetState }) =>
      !isLegalTransition(currentState, targetState),
    );

    fc.assert(
      fc.property(arbIllegalPair, ({ currentState, targetState }) => {
        const request = buildRequest(currentState);

        // The transition is rejected with an error
        expect(() => {
          stateMachine.transition(request, targetState, 'test-actor');
        }).toThrow(/Illegal transition/);

        // The original request's state is unchanged (immutable entity)
        expect(request.state).toBe(currentState);
      }),
      { numRuns: 500 },
    );
  });

  it('every state has a defined entry in the legal transitions map', () => {
    fc.assert(
      fc.property(arbState, (state) => {
        const transitions = stateMachine.getLegalTransitions(state);
        expect(Array.isArray(transitions)).toBe(true);
        // All returned transitions should be valid states
        for (const t of transitions) {
          expect(ALL_STATES).toContain(t);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('terminal states (Completed, Cancelled) have no legal transitions', () => {
    const arbTerminalState = fc.oneof(
      fc.constant('Completed' as ReturnState),
      fc.constant('Cancelled' as ReturnState),
    );

    fc.assert(
      fc.property(arbTerminalState, arbState, (terminalState, targetState) => {
        const request = buildRequest(terminalState);

        if (targetState === terminalState) {
          // Self-transitions are also illegal
          expect(() => {
            stateMachine.transition(request, targetState, 'test-actor');
          }).toThrow(/Illegal transition/);
        } else {
          // Any transition from a terminal state is illegal
          expect(() => {
            stateMachine.transition(request, targetState, 'test-actor');
          }).toThrow(/Illegal transition/);
        }

        // State is preserved
        expect(request.state).toBe(terminalState);
      }),
      { numRuns: 200 },
    );
  });

  it('self-transitions are always illegal (no state allows transitioning to itself)', () => {
    fc.assert(
      fc.property(arbState, (state) => {
        const request = buildRequest(state);

        // Self-transitions should always be illegal per the LEGAL_TRANSITIONS map
        expect(() => {
          stateMachine.transition(request, state, 'test-actor');
        }).toThrow(/Illegal transition/);

        expect(request.state).toBe(state);
      }),
      { numRuns: 100 },
    );
  });
});
