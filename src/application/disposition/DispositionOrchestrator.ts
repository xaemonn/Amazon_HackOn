/**
 * DispositionOrchestrator — application-layer service that coordinates the
 * disposition decision pipeline after an item is graded.
 *
 * Subscribes to `ItemGraded` events, builds a RoutingContext, runs the
 * Chain of Responsibility, persists the DispositionDecision, and publishes
 * the appropriate domain events.
 *
 * Route → State/Event mapping:
 *  - instant_match      → AwaitingPickup + DeliveryJobCreated
 *  - refurbishment      → AwaitingPickup + DeliveryJobCreated
 *  - manual_inspection  → ManualReview   + ManualReviewInitiated + DeliveryJobCreated
 *  - list_for_resale    → Listed         + ListingRequested
 *  - returnless_refund  → Completed      + ReturnCompleted
 *  - donate_or_recycle  → Completed      + ReturnCompleted
 *
 * Requirements: 10.13, 14.2, 14.4, 15.5
 */

import { randomUUID } from 'crypto';
import type {
  IEventBus,
  DomainEvent,
  ItemGradedEvent,
  DispositionAssignedEvent,
  DeliveryJobCreatedEvent,
  ListingRequestedEvent,
  ReturnCompletedEvent,
  ManualReviewInitiatedEvent,
  DispositionRoute,
  ReturnReason,
} from '../../domain/shared/index.js';
import type { DemandSignal, RoutingContext } from '../../domain/disposition/RoutingContext.js';
import type { RoutingResult } from '../../domain/disposition/RoutingResult.js';
import type { DispositionDecision } from '../../domain/disposition/DispositionDecision.js';
import type { IDispositionDecisionRepository } from '../../domain/disposition/IDispositionDecisionRepository.js';
import type { IConditionAssessmentRepository } from '../../domain/grading/IConditionAssessmentRepository.js';
import type { ConditionAssessment } from '../../domain/grading/ConditionAssessment.js';
import type { AppConfig } from '../../infrastructure/config/index.js';
import { evaluateDisposition } from '../../domain/disposition/DispositionChainFactory.js';

// ─── Supporting Interfaces ───────────────────────────────────────────────────

/**
 * Lookup interface for retrieving ReturnRequest data needed by the
 * disposition orchestrator (reason, item value, product info).
 */
export interface IReturnRequestLookup {
  findById(id: string): Promise<{
    returnReason: ReturnReason;
    itemValue: number;
    currency: string;
    productId: string;
    customerId: string;
    orderItemId: string;
  } | null>;
}

/**
 * Provider interface for retrieving nearby buyer demand signals.
 */
export interface IDemandSignalProvider {
  findNearbyDemand(productId: string): Promise<DemandSignal | null>;
}

/**
 * Provider interface for retrieving the return history count for a customer.
 */
export interface IReturnHistoryProvider {
  countReturnsInDays(customerId: string, days: number): Promise<number>;
}

// ─── DispositionOrchestrator ─────────────────────────────────────────────────

export class DispositionOrchestrator {
  private readonly handleItemGraded: (event: DomainEvent) => Promise<void>;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly conditionAssessmentRepo: IConditionAssessmentRepository,
    private readonly dispositionDecisionRepo: IDispositionDecisionRepository,
    private readonly returnRequestLookup: IReturnRequestLookup,
    private readonly demandSignalProvider: IDemandSignalProvider,
    private readonly returnHistoryProvider: IReturnHistoryProvider,
    private readonly config: AppConfig,
  ) {
    // Bind the handler so we can unsubscribe later if needed
    this.handleItemGraded = this.onItemGraded.bind(this);
  }

  /**
   * Register the orchestrator as a subscriber to ItemGraded events.
   * Call this during application startup / DI wiring.
   */
  initialize(): void {
    this.eventBus.subscribe('ItemGraded', this.handleItemGraded);
  }

  /**
   * Unsubscribe from the event bus. Useful for teardown/testing.
   */
  dispose(): void {
    this.eventBus.unsubscribe('ItemGraded', this.handleItemGraded);
  }

  /**
   * Handle an ItemGraded event: build context, run chain, persist, publish events.
   */
  private async onItemGraded(event: DomainEvent): Promise<void> {
    const itemGraded = event as ItemGradedEvent;
    const returnRequestId = itemGraded.payload.returnRequestId;

    try {
      // 1. Retrieve the full ConditionAssessment
      const assessment = await this.conditionAssessmentRepo.findByReturnRequestId(returnRequestId);
      if (!assessment) {
        console.error(
          `[DispositionOrchestrator] ConditionAssessment not found for returnRequestId=${returnRequestId}`,
        );
        return;
      }

      // 2. Retrieve return request data (reason, item value, product info)
      const returnData = await this.returnRequestLookup.findById(returnRequestId);
      if (!returnData) {
        console.error(
          `[DispositionOrchestrator] ReturnRequest not found for id=${returnRequestId}`,
        );
        return;
      }

      // 3. Retrieve demand signal (null if unavailable)
      let nearbyDemand: DemandSignal | null = null;
      try {
        nearbyDemand = await this.demandSignalProvider.findNearbyDemand(returnData.productId);
      } catch {
        // Demand signal unavailable — treat as no nearby demand (Req 10.12)
        console.warn(
          `[DispositionOrchestrator] Demand signal unavailable for product=${returnData.productId}`,
        );
      }

      // 4. Retrieve return history count
      let returnHistoryCount = 0;
      try {
        returnHistoryCount = await this.returnHistoryProvider.countReturnsInDays(
          returnData.customerId,
          this.config.fraud.historyWindowDays,
        );
      } catch {
        console.warn(
          `[DispositionOrchestrator] Return history unavailable for customer=${returnData.customerId}`,
        );
      }

      // 5. Build RoutingContext
      const routingContext: RoutingContext = {
        returnRequestId,
        conditionAssessment: assessment,
        itemValue: returnData.itemValue,
        currency: returnData.currency,
        nearbyDemand,
        productId: returnData.productId,
        returnReason: returnData.returnReason,
        returnHistory: { count90Days: returnHistoryCount },
      };

      // 6. Run the disposition chain
      const routingResult: RoutingResult = evaluateDisposition(routingContext, this.config);

      // 7. Build DispositionDecision
      const decision: DispositionDecision = {
        returnRequestId,
        route: routingResult.route,
        refundEstimate: routingResult.refundEstimate,
        explanation: routingResult.explanation,
        evaluatedAt: new Date(),
        handlerName: routingResult.handlerName,
        fallbackTriggered: routingResult.fallbackTriggered,
        degradedInputs: routingResult.degradedInputs,
      };

      // 8. Persist the decision
      await this.dispositionDecisionRepo.save(decision);

      // 9. Publish DispositionAssigned event
      const dispositionEvent: DispositionAssignedEvent = {
        eventId: randomUUID(),
        eventType: 'DispositionAssigned',
        timestamp: new Date(),
        payload: {
          returnRequestId,
          route: decision.route,
          refundEstimate: decision.refundEstimate,
          explanation: decision.explanation,
        },
      };
      await this.eventBus.publish(dispositionEvent);

      // 10. Publish route-specific events
      await this.publishRouteSpecificEvents(
        decision.route,
        returnRequestId,
        returnData,
        assessment,
      );
    } catch (error) {
      // Graceful error handling — log and do not crash
      console.error(
        `[DispositionOrchestrator] Error processing ItemGraded for returnRequestId=${returnRequestId}:`,
        error,
      );
    }
  }

  /**
   * Publish the additional domain events specific to each route.
   */
  private async publishRouteSpecificEvents(
    route: DispositionRoute,
    returnRequestId: string,
    returnData: {
      returnReason: ReturnReason;
      itemValue: number;
      currency: string;
      productId: string;
      customerId: string;
      orderItemId: string;
    },
    assessment: ConditionAssessment,
  ): Promise<void> {
    switch (route) {
      case 'instant_match':
      case 'refurbishment': {
        // → AwaitingPickup + DeliveryJobCreated
        const deliveryEvent: DeliveryJobCreatedEvent = {
          eventId: randomUUID(),
          eventType: 'DeliveryJobCreated',
          timestamp: new Date(),
          payload: {
            returnRequestId,
            pickupAddress: 'customer_address', // Placeholder — resolved by logistics module
            dropAddress: route === 'instant_match' ? 'buyer_address' : 'refurbishment_center',
            itemId: returnData.orderItemId,
            priority: route === 'instant_match' ? 'urgent' : 'standard',
          },
        };
        await this.eventBus.publish(deliveryEvent);
        break;
      }

      case 'manual_inspection': {
        // → ManualReview + ManualReviewInitiated + DeliveryJobCreated
        const manualReviewEvent: ManualReviewInitiatedEvent = {
          eventId: randomUUID(),
          eventType: 'ManualReviewInitiated',
          timestamp: new Date(),
          payload: {
            returnRequestId,
            reasons: assessment.manualReviewReasons,
            fraudScore: assessment.fraudScore,
            confidence: assessment.confidence,
          },
        };
        await this.eventBus.publish(manualReviewEvent);

        const deliveryEvent: DeliveryJobCreatedEvent = {
          eventId: randomUUID(),
          eventType: 'DeliveryJobCreated',
          timestamp: new Date(),
          payload: {
            returnRequestId,
            pickupAddress: 'customer_address',
            dropAddress: 'inspection_warehouse',
            itemId: returnData.orderItemId,
            priority: 'standard',
          },
        };
        await this.eventBus.publish(deliveryEvent);
        break;
      }

      case 'list_for_resale': {
        // → Listed + ListingRequested
        const listingEvent: ListingRequestedEvent = {
          eventId: randomUUID(),
          eventType: 'ListingRequested',
          timestamp: new Date(),
          payload: {
            returnRequestId,
            productId: returnData.productId,
            conditionGrade: assessment.grade!,
            assessmentSummary: assessment.reasoning,
            mediaReferences: [], // Media references filled by the Returns module
          },
        };
        await this.eventBus.publish(listingEvent);
        break;
      }

      case 'returnless_refund':
      case 'donate_or_recycle': {
        // → Completed + ReturnCompleted
        const completedEvent: ReturnCompletedEvent = {
          eventId: randomUUID(),
          eventType: 'ReturnCompleted',
          timestamp: new Date(),
          payload: {
            returnRequestId,
            route,
            refundAmount: 0, // Actual refund amount set by the Refund module
            refundCurrency: returnData.currency,
          },
        };
        await this.eventBus.publish(completedEvent);
        break;
      }
    }
  }
}
