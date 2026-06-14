/**
 * Hero Path Wiring — event-driven integration module that wires the full
 * return lifecycle from grading completion through disposition state transitions.
 *
 * Contains two event handlers:
 *  - GradingCompleteHandler: subscribes to ItemGraded → transitions ReturnRequest
 *    from Grading → Graded, persists the ConditionAssessment on the entity.
 *  - DispositionStateHandler: subscribes to DispositionAssigned → transitions
 *    ReturnRequest from Graded → DispositionAssigned → final state based on route,
 *    persists the DispositionDecision on the entity.
 *
 * Route → final state mapping:
 *  - instant_match / refurbishment → AwaitingPickup
 *  - manual_inspection             → ManualReview
 *  - list_for_resale               → Listed
 *  - returnless_refund / donate_or_recycle → Completed
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 14.2, 14.4
 */

import type {
  IEventBus,
  DomainEvent,
  ItemGradedEvent,
  DispositionAssignedEvent,
  DispositionRoute,
} from '../domain/shared/index.js';
import type { IReturnRequestRepository } from '../domain/returns/index.js';
import type { IConditionAssessmentRepository } from '../domain/grading/IConditionAssessmentRepository.js';
import type { IDispositionDecisionRepository } from '../domain/disposition/IDispositionDecisionRepository.js';
import { ReturnRequest, ReturnStateMachine } from '../domain/returns/index.js';
import type { ReturnState } from '../domain/returns/ReturnRequest.js';

// ─── GradingCompleteHandler ──────────────────────────────────────────────────

/**
 * Subscribes to ItemGraded events and transitions the ReturnRequest from
 * Grading → Graded. Also attaches the ConditionAssessment to the entity.
 */
export class GradingCompleteHandler {
  private readonly handler: (event: DomainEvent) => Promise<void>;
  private readonly stateMachine: ReturnStateMachine;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly returnRequestRepository: IReturnRequestRepository,
    private readonly conditionAssessmentRepository: IConditionAssessmentRepository,
  ) {
    this.stateMachine = new ReturnStateMachine();
    this.handler = this.onItemGraded.bind(this);
  }

  /**
   * Subscribe to ItemGraded events. Call during application startup.
   */
  initialize(): void {
    this.eventBus.subscribe('ItemGraded', this.handler);
  }

  /**
   * Unsubscribe from the event bus. Useful for teardown/testing.
   */
  dispose(): void {
    this.eventBus.unsubscribe('ItemGraded', this.handler);
  }

  private async onItemGraded(event: DomainEvent): Promise<void> {
    const itemGraded = event as ItemGradedEvent;
    const returnRequestId = itemGraded.payload.returnRequestId;

    try {
      const returnRequest = await this.returnRequestRepository.findById(returnRequestId);
      if (!returnRequest) {
        console.error(
          `[GradingCompleteHandler] ReturnRequest not found: ${returnRequestId}`,
        );
        return;
      }

      // Only transition if still in Grading state (idempotency)
      if (returnRequest.state !== 'Grading') {
        return;
      }

      // Retrieve the persisted condition assessment
      const assessment = await this.conditionAssessmentRepository.findByReturnRequestId(
        returnRequestId,
      );

      // Transition: Grading → Graded
      const graded = this.stateMachine.transition(
        returnRequest,
        'Graded',
        'system',
        { trigger: 'ItemGraded event' },
      );

      // Attach the condition assessment to the entity
      const withAssessment = new ReturnRequest({
        ...graded.toProps(),
        conditionAssessment: assessment,
      });

      await this.returnRequestRepository.save(withAssessment);
    } catch (error) {
      console.error(
        `[GradingCompleteHandler] Error processing ItemGraded for ${returnRequestId}:`,
        error,
      );
    }
  }
}

// ─── DispositionStateHandler ─────────────────────────────────────────────────

/**
 * Maps a DispositionRoute to the target ReturnState.
 */
function routeToFinalState(route: DispositionRoute): ReturnState {
  switch (route) {
    case 'instant_match':
    case 'refurbishment':
      return 'AwaitingPickup';
    case 'manual_inspection':
      return 'ManualReview';
    case 'list_for_resale':
      return 'Listed';
    case 'returnless_refund':
    case 'donate_or_recycle':
      return 'Completed';
  }
}

/**
 * Subscribes to DispositionAssigned events and transitions the ReturnRequest
 * through: Graded → DispositionAssigned → final state (based on route).
 * Persists the DispositionDecision on the entity.
 */
export class DispositionStateHandler {
  private readonly handler: (event: DomainEvent) => Promise<void>;
  private readonly stateMachine: ReturnStateMachine;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly returnRequestRepository: IReturnRequestRepository,
    private readonly dispositionDecisionRepository: IDispositionDecisionRepository,
  ) {
    this.stateMachine = new ReturnStateMachine();
    this.handler = this.onDispositionAssigned.bind(this);
  }

  /**
   * Subscribe to DispositionAssigned events. Call during application startup.
   */
  initialize(): void {
    this.eventBus.subscribe('DispositionAssigned', this.handler);
  }

  /**
   * Unsubscribe from the event bus. Useful for teardown/testing.
   */
  dispose(): void {
    this.eventBus.unsubscribe('DispositionAssigned', this.handler);
  }

  private async onDispositionAssigned(event: DomainEvent): Promise<void> {
    const dispositionEvent = event as DispositionAssignedEvent;
    const { returnRequestId, route } = dispositionEvent.payload;

    try {
      const returnRequest = await this.returnRequestRepository.findById(returnRequestId);
      if (!returnRequest) {
        console.error(
          `[DispositionStateHandler] ReturnRequest not found: ${returnRequestId}`,
        );
        return;
      }

      // Only process if in Graded state (idempotency guard)
      if (returnRequest.state !== 'Graded') {
        return;
      }

      // Retrieve the disposition decision
      const decision = await this.dispositionDecisionRepository.findByReturnRequestId(
        returnRequestId,
      );

      // Transition: Graded → DispositionAssigned
      const assigned = this.stateMachine.transition(
        returnRequest,
        'DispositionAssigned',
        'system',
        { trigger: 'DispositionAssigned event' },
      );

      // Attach the disposition decision
      const withDecision = new ReturnRequest({
        ...assigned.toProps(),
        dispositionDecision: decision,
      });

      // Transition: DispositionAssigned → final state
      const finalState = routeToFinalState(route);
      const finalRequest = this.stateMachine.transition(
        withDecision,
        finalState,
        'system',
        { trigger: `Disposition route: ${route}` },
      );

      await this.returnRequestRepository.save(finalRequest);
    } catch (error) {
      console.error(
        `[DispositionStateHandler] Error processing DispositionAssigned for ${returnRequestId}:`,
        error,
      );
    }
  }
}

// ─── Wiring Initializer ──────────────────────────────────────────────────────

/**
 * Initialize the full hero-path event wiring.
 * Returns disposable handles for teardown.
 */
export function initializeHeroPathWiring(deps: {
  eventBus: IEventBus;
  returnRequestRepository: IReturnRequestRepository;
  conditionAssessmentRepository: IConditionAssessmentRepository;
  dispositionDecisionRepository: IDispositionDecisionRepository;
}): {
  gradingCompleteHandler: GradingCompleteHandler;
  dispositionStateHandler: DispositionStateHandler;
  dispose: () => void;
} {
  const gradingCompleteHandler = new GradingCompleteHandler(
    deps.eventBus,
    deps.returnRequestRepository,
    deps.conditionAssessmentRepository,
  );

  const dispositionStateHandler = new DispositionStateHandler(
    deps.eventBus,
    deps.returnRequestRepository,
    deps.dispositionDecisionRepository,
  );

  gradingCompleteHandler.initialize();
  dispositionStateHandler.initialize();

  return {
    gradingCompleteHandler,
    dispositionStateHandler,
    dispose: () => {
      gradingCompleteHandler.dispose();
      dispositionStateHandler.dispose();
    },
  };
}
