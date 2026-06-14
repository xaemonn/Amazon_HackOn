/**
 * Returns application module — ReturnsFacade.
 *
 * The facade is the single entry point for the Returns Module.
 * It coordinates domain services and does NOT import infrastructure directly —
 * all dependencies are injected.
 *
 * Requirements: 1.1, 1.7, 2.3, 3.6, 15.1, 15.7
 */

import { randomUUID } from 'crypto';
import type { IEventBus, ReturnInitiatedEvent } from '../../domain/shared/events.js';
import type { IAuthService, OrderItem as AuthOrderItem } from '../../domain/shared/IAuthService.js';
import type { ReturnReason, MediaReference } from '../../domain/shared/types.js';
import type { IReturnRequestRepository, IAuditLogRepository } from '../../domain/returns/index.js';
import {
  ReturnRequest,
  ReturnStateMachine,
  ReturnEligibilityService,
  OwnershipError,
  validateReasonDetails,
  ReasonDetailsError,
  checkMediaCompleteness,
  MediaValidationError,
} from '../../domain/returns/index.js';
import type { ReturnState } from '../../domain/returns/ReturnRequest.js';
import type { EligibilityResult } from '../../domain/returns/ReturnEligibilityService.js';
import type { AppConfig } from '../../infrastructure/config/index.js';
import type { ConditionAssessment } from '../../domain/grading/index.js';
import type { DispositionDecision } from '../../domain/disposition/index.js';
import type { IConditionAssessmentRepository } from '../../domain/disposition/index.js';
import type { GradingInput } from '../../application/grading/GradingOrchestrator.js';
import { GradingOrchestrator } from '../../application/grading/GradingOrchestrator.js';

// Re-export EligibilityResult so other files can import from here
export type { EligibilityResult } from '../../domain/returns/ReturnEligibilityService.js';

// ─── Command / DTO types ──────────────────────────────────────────────────────

/**
 * Command DTO for initiating a return.
 */
export interface InitiateReturnCommand {
  customerId: string;
  orderItemId: string;
  reason: ReturnReason;
  reasonDetails?: string | null;
}

/**
 * Command DTO for submitting a reason after initiation.
 */
export interface SubmitReasonCommand {
  returnRequestId: string;
  reason: ReturnReason;
  reasonDetails?: string | null;
}

/**
 * Command DTO for submitting media references.
 */
export interface SubmitMediaCommand {
  returnRequestId: string;
  media: MediaReference[];
}

/**
 * Read-only projection of a ReturnRequest for the presentation layer.
 */
export interface ReturnRequestProjection {
  id: string;
  customerId: string;
  orderItemId: string;
  orderId: string;
  productId: string;
  state: ReturnState;
  reason: ReturnReason | null;
  reasonDetails: string | null;
  media: MediaReference[];
  conditionAssessment: ConditionAssessment | null;
  dispositionDecision: DispositionDecision | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── IReturnsFacade ───────────────────────────────────────────────────────────

/**
 * Facade interface for the Returns Module.
 * Application and presentation layers depend on this interface, never on the
 * concrete ReturnsFacade class.
 */
export interface IReturnsFacade {
  /**
   * Check whether the given customer may return the referenced order item.
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.7
   */
  checkEligibility(customerId: string, orderItemId: string): Promise<EligibilityResult>;

  /**
   * Initiate a new return request.
   * Verifies ownership, prevents duplicates, creates in Initiated state,
   * persists, and publishes ReturnInitiatedEvent.
   *
   * Requirements: 1.1, 1.7, 15.1
   */
  initiateReturn(command: InitiateReturnCommand): Promise<ReturnRequestProjection>;

  /**
   * Submit or update the reason and details for an existing return request.
   *
   * Requirements: 2.3
   */
  submitReason(command: SubmitReasonCommand): Promise<ReturnRequestProjection>;

  /**
   * Submit media references to an existing return request.
   *
   * Requirements: 3.6
   */
  submitMedia(command: SubmitMediaCommand): Promise<ReturnRequestProjection>;

  /**
   * Complete media capture: validates completeness, transitions through
   * Initiated → MediaCaptured → Grading, persists, and triggers AI grading
   * asynchronously.
   *
   * Requirements: 3.6, 15.7
   */
  completeMediaCapture(returnRequestId: string): Promise<ReturnRequestProjection>;

  /**
   * Retrieve a return request as a read-only projection.
   */
  getReturnById(returnRequestId: string): Promise<ReturnRequestProjection | null>;
}

// ─── ReturnsFacade ────────────────────────────────────────────────────────────

/**
 * Concrete implementation of IReturnsFacade.
 *
 * All external dependencies are injected — no direct infrastructure imports.
 */
export class ReturnsFacade implements IReturnsFacade {
  private readonly eligibilityService: ReturnEligibilityService;
  private readonly stateMachine: ReturnStateMachine;
  private readonly returnWindowDays: number;

  constructor(
    private readonly config: AppConfig,
    private readonly authService: IAuthService,
    private readonly returnRequestRepository: IReturnRequestRepository,
    private readonly eventBus: IEventBus,
    private readonly gradingOrchestrator: GradingOrchestrator,
    private readonly conditionAssessmentRepository: IConditionAssessmentRepository,
    private readonly auditLogRepository?: IAuditLogRepository,
  ) {
    this.eligibilityService = new ReturnEligibilityService();
    this.stateMachine = new ReturnStateMachine(auditLogRepository);
    this.returnWindowDays = config.returnWindow.defaultDays;
  }

  // ── checkEligibility ────────────────────────────────────────────────────────

  async checkEligibility(
    customerId: string,
    orderItemId: string,
  ): Promise<EligibilityResult> {
    const authOrderItem = await this.authService.getOrderItem(orderItemId);

    if (!authOrderItem) {
      return {
        eligible: false,
        daysRemaining: null,
        policyExpirationDate: null,
        productName: '',
        productImage: '',
        orderDate: new Date(0),
        errorMessage: `Order item '${orderItemId}' could not be found. Please try again.`,
      };
    }

    // Map from auth OrderItem to domain OrderItem shape
    const domainOrderItem = {
      id: authOrderItem.id,
      customerId: authOrderItem.customerId,
      orderId: authOrderItem.orderId,
      productId: authOrderItem.productId,
      productName: authOrderItem.productName,
      productImage: authOrderItem.productImage,
      orderDate: authOrderItem.deliveryDate, // use deliveryDate as orderDate for display
      deliveryDate: authOrderItem.deliveryDate,
    };

    try {
      return this.eligibilityService.checkEligibility(
        customerId,
        domainOrderItem,
        { returnWindowDays: this.returnWindowDays },
      );
    } catch (err) {
      if (err instanceof OwnershipError) {
        return {
          eligible: false,
          daysRemaining: null,
          policyExpirationDate: null,
          productName: authOrderItem.productName,
          productImage: authOrderItem.productImage,
          orderDate: authOrderItem.deliveryDate,
          errorMessage: 'This item does not belong to your account.',
        };
      }
      throw err;
    }
  }

  // ── initiateReturn ──────────────────────────────────────────────────────────

  async initiateReturn(command: InitiateReturnCommand): Promise<ReturnRequestProjection> {
    const { customerId, orderItemId, reason, reasonDetails } = command;

    // Verify ownership
    const ownershipValid = await this.authService.verifyOwnership(customerId, orderItemId);
    if (!ownershipValid) {
      throw new OwnershipError(customerId, orderItemId);
    }

    // Prevent duplicate returns on the same order item
    const existing = await this.returnRequestRepository.findByOrderItemId(orderItemId);
    if (existing && existing.state !== 'Cancelled') {
      throw new Error(
        `A return request already exists for order item '${orderItemId}' (id: ${existing.id}, state: ${existing.state}).`,
      );
    }

    // Resolve order item details
    const authOrderItem = await this.authService.getOrderItem(orderItemId);
    if (!authOrderItem) {
      throw new Error(`Order item '${orderItemId}' could not be found.`);
    }

    // Validate reason details if provided
    const validatedDetails = validateReasonDetails(reasonDetails ?? null);

    const now = new Date();
    const returnRequest = new ReturnRequest({
      id: randomUUID(),
      customerId,
      orderItemId,
      orderId: authOrderItem.orderId,
      productId: authOrderItem.productId,
      state: 'Initiated',
      reason,
      reasonDetails: validatedDetails,
      media: [],
      conditionAssessment: null,
      dispositionDecision: null,
      createdAt: now,
      updatedAt: now,
    });

    // Persist
    await this.returnRequestRepository.save(returnRequest);

    // Publish ReturnInitiatedEvent
    const event: ReturnInitiatedEvent = {
      eventId: randomUUID(),
      eventType: 'ReturnInitiated',
      timestamp: now,
      payload: {
        returnRequestId: returnRequest.id,
        customerId,
        orderItemId,
        productId: authOrderItem.productId,
        reasonCode: reason,
        mediaReferences: [],
      },
    };
    await this.eventBus.publish(event);

    return this.toProjection(returnRequest);
  }

  // ── submitReason ────────────────────────────────────────────────────────────

  async submitReason(command: SubmitReasonCommand): Promise<ReturnRequestProjection> {
    const { returnRequestId, reason, reasonDetails } = command;

    const returnRequest = await this.loadReturnRequest(returnRequestId);

    // Validate the reason details
    const validatedDetails = validateReasonDetails(reasonDetails ?? null);

    // Update the request with reason and details
    const updated = new ReturnRequest({
      ...returnRequest.toProps(),
      reason,
      reasonDetails: validatedDetails,
      updatedAt: new Date(),
    });

    await this.returnRequestRepository.save(updated);

    return this.toProjection(updated);
  }

  // ── submitMedia ─────────────────────────────────────────────────────────────

  async submitMedia(command: SubmitMediaCommand): Promise<ReturnRequestProjection> {
    const { returnRequestId, media } = command;

    const returnRequest = await this.loadReturnRequest(returnRequestId);

    // Append new media to existing (allows incremental upload)
    const updatedMedia = [...returnRequest.media, ...media];

    const updated = new ReturnRequest({
      ...returnRequest.toProps(),
      media: updatedMedia,
      updatedAt: new Date(),
    });

    await this.returnRequestRepository.save(updated);

    return this.toProjection(updated);
  }

  // ── completeMediaCapture ────────────────────────────────────────────────────

  async completeMediaCapture(returnRequestId: string): Promise<ReturnRequestProjection> {
    const returnRequest = await this.loadReturnRequest(returnRequestId);

    // Validate media completeness
    const completenessResult = checkMediaCompleteness(returnRequest.media);
    if (!completenessResult.complete) {
      const allIssues = [...completenessResult.missingSlots, ...completenessResult.issues];
      throw new MediaValidationError(allIssues);
    }

    // Transition: Initiated → MediaCaptured
    let transitioned = this.stateMachine.transition(
      returnRequest,
      'MediaCaptured',
      'system',
      { trigger: 'completeMediaCapture' },
    );

    // Transition: MediaCaptured → Grading
    transitioned = this.stateMachine.transition(
      transitioned,
      'Grading',
      'system',
      { trigger: 'completeMediaCapture' },
    );

    // Persist the final state
    await this.returnRequestRepository.save(transitioned);

    // Fire grading asynchronously (fire-and-forget)
    const gradingInput: GradingInput = {
      returnRequestId: transitioned.id,
      productId: transitioned.productId,
      mediaReferences: transitioned.media,
      catalogImageRef: transitioned.productId, // use productId as catalog image ref
      reasonText: transitioned.reasonDetails,
      customerId: transitioned.customerId,
      returnHistoryCount90Days: await this.returnRequestRepository.countByCustomerInDays(
        transitioned.customerId,
        this.config.fraud.historyWindowDays,
      ),
    };

    // Fire and forget — don't await
    void this.gradingOrchestrator.grade(gradingInput).then(async (assessment) => {
      // Persist the condition assessment
      await this.conditionAssessmentRepository.save(assessment);
    }).catch((err: unknown) => {
      console.error('[ReturnsFacade] Grading failed for return request', {
        returnRequestId,
        error: err,
      });
    });

    return this.toProjection(transitioned);
  }

  // ── getReturnById ───────────────────────────────────────────────────────────

  async getReturnById(returnRequestId: string): Promise<ReturnRequestProjection | null> {
    const returnRequest = await this.returnRequestRepository.findById(returnRequestId);
    if (!returnRequest) {
      return null;
    }
    return this.toProjection(returnRequest);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Load a ReturnRequest from the repository or throw if not found.
   */
  private async loadReturnRequest(returnRequestId: string): Promise<ReturnRequest> {
    const returnRequest = await this.returnRequestRepository.findById(returnRequestId);
    if (!returnRequest) {
      throw new Error(`Return request '${returnRequestId}' not found.`);
    }
    return returnRequest;
  }

  /**
   * Convert a ReturnRequest entity to a read-only projection.
   */
  private toProjection(request: ReturnRequest): ReturnRequestProjection {
    return {
      id: request.id,
      customerId: request.customerId,
      orderItemId: request.orderItemId,
      orderId: request.orderId,
      productId: request.productId,
      state: request.state,
      reason: request.reason,
      reasonDetails: request.reasonDetails,
      media: request.media,
      conditionAssessment: request.conditionAssessment,
      dispositionDecision: request.dispositionDecision,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
