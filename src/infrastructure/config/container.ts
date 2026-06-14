/**
 * DI Composition Root — Incrementally-filled Registry
 *
 * A lightweight typed container that holds interface references for all
 * subsystem dependencies. Each module registers its implementation as it
 * is built. Consumers resolve dependencies via getRequired() (throws if
 * missing) or getOptional() (returns null if not yet registered).
 *
 * Config-driven swap: when ZTR_BEDROCK_ENABLED=true, live Bedrock adapters
 * will be injected; otherwise mock/in-process implementations are used.
 */

import type { AppConfig } from './index.js';
import { getConfig } from './index.js';
import type { IEventBus, DomainEvent } from '../../domain/shared/events.js';
import type { IAuthService } from '../../domain/shared/index.js';
import type { ReturnReason } from '../../domain/shared/types.js';
import type { IReturnRequestRepository, IAuditLogRepository, IMediaStorage } from '../../domain/returns/index.js';
import type { IConditionGrader, IIdentityVerifier, IFraudScoreCalculator } from '../../domain/grading/index.js';
import type { IReasonParser } from '../../domain/grading/IReasonParser.js';
import type { IDispositionDecisionRepository, IConditionAssessmentRepository } from '../../domain/disposition/index.js';
import { InMemoryAuditLogRepository, InMemoryReturnRequestRepository, InMemoryConditionAssessmentRepository, InMemoryDispositionDecisionRepository } from '../persistence/index.js';
import { InProcessEventBus } from '../events/index.js';
import { MockConditionGrader, MockIdentityVerifier, MockReasonParser } from '../ai/index.js';
import { MockAuthService } from '../auth/index.js';
import { FraudScoreCalculator } from '../../domain/grading/FraudScoreCalculator.js';
import { LocalFilesystemMediaStorage } from '../storage/index.js';
import { GradingOrchestrator } from '../../application/grading/GradingOrchestrator.js';
import { ReturnsFacade } from '../../application/returns/index.js';
import { InMemoryDemandSignalProvider } from '../seed/InMemoryDemandSignalProvider.js';
import { loadSeedData } from '../seed/index.js';
import {
  DispositionOrchestrator,
  type IReturnRequestLookup,
  type IDemandSignalProvider,
  type IReturnHistoryProvider,
} from '../../application/disposition/index.js';

// ─── Registry Keys ───────────────────────────────────────────────────────────

/**
 * All dependency keys the container manages.
 * This type map drives type-safe register/resolve.
 */
export interface ContainerRegistry {
  config: AppConfig;
  eventBus: IEventBus;
  authService: IAuthService;
  returnRequestRepository: IReturnRequestRepository;
  auditLogRepository: IAuditLogRepository;
  conditionAssessmentRepository: IConditionAssessmentRepository;
  dispositionDecisionRepository: IDispositionDecisionRepository;
  mediaStorage: IMediaStorage;
  conditionGrader: IConditionGrader;
  identityVerifier: IIdentityVerifier;
  reasonParser: IReasonParser;
  fraudScoreCalculator: IFraudScoreCalculator;
  returnsFacade: ReturnsFacade;
  gradingOrchestrator: GradingOrchestrator;
  dispositionOrchestrator: DispositionOrchestrator;
}

// ─── Container Class ─────────────────────────────────────────────────────────

export class Container {
  private readonly registry = new Map<string, unknown>();

  /**
   * Whether Bedrock (live AI) adapters should be used.
   * When false, mock/in-process implementations are expected.
   */
  readonly bedrockEnabled: boolean;

  constructor() {
    this.bedrockEnabled = process.env['ZTR_BEDROCK_ENABLED'] === 'true';
  }

  /**
   * Register a dependency into the container.
   * Overwrites any previously registered value for the same key.
   */
  register<K extends keyof ContainerRegistry>(
    key: K,
    implementation: ContainerRegistry[K]
  ): void {
    this.registry.set(key, implementation);
  }

  /**
   * Resolve a dependency that MUST be present.
   * Throws a descriptive error if the dependency has not been registered yet.
   */
  getRequired<K extends keyof ContainerRegistry>(key: K): ContainerRegistry[K] {
    const value = this.registry.get(key);
    if (value === undefined) {
      throw new Error(
        `[Container] Dependency "${key}" has not been registered. ` +
        `Ensure the owning module has called container.register("${key}", implementation) ` +
        `before attempting to resolve it.`
      );
    }
    return value as ContainerRegistry[K];
  }

  /**
   * Resolve a dependency that may or may not be present yet.
   * Returns null if not registered — useful during incremental build-up.
   */
  getOptional<K extends keyof ContainerRegistry>(key: K): ContainerRegistry[K] | null {
    const value = this.registry.get(key);
    return (value === undefined ? null : value) as ContainerRegistry[K] | null;
  }

  /**
   * Check whether a dependency has been registered.
   */
  has<K extends keyof ContainerRegistry>(key: K): boolean {
    return this.registry.has(key);
  }

  /**
   * Remove a registered dependency (useful in tests for teardown).
   */
  unregister<K extends keyof ContainerRegistry>(key: K): void {
    this.registry.delete(key);
  }

  /**
   * Clear all registrations (useful in tests).
   */
  reset(): void {
    this.registry.clear();
  }
}

// ─── Inline Adapter Implementations ──────────────────────────────────────────

/**
 * Adapts IReturnRequestRepository + IAuthService to the IReturnRequestLookup
 * interface required by DispositionOrchestrator.
 */
class ReturnRequestLookupAdapter implements IReturnRequestLookup {
  constructor(
    private readonly returnRequestRepository: IReturnRequestRepository,
    private readonly authService: IAuthService,
  ) {}

  async findById(id: string): Promise<{
    returnReason: ReturnReason;
    itemValue: number;
    currency: string;
    productId: string;
    customerId: string;
    orderItemId: string;
  } | null> {
    const returnRequest = await this.returnRequestRepository.findById(id);
    if (!returnRequest || !returnRequest.reason) {
      return null;
    }

    // Resolve price and currency from the auth service (order item details)
    const orderItem = await this.authService.getOrderItem(returnRequest.orderItemId);
    const itemValue = orderItem?.price ?? 0;
    const currency = orderItem?.currency ?? 'INR';

    return {
      returnReason: returnRequest.reason,
      itemValue,
      currency,
      productId: returnRequest.productId,
      customerId: returnRequest.customerId,
      orderItemId: returnRequest.orderItemId,
    };
  }
}

// DefaultDemandSignalProvider removed — replaced by InMemoryDemandSignalProvider (seed/index.ts)

/**
 * Adapts IReturnRequestRepository.countByCustomerInDays() to the
 * IReturnHistoryProvider interface required by DispositionOrchestrator.
 */
class ReturnHistoryProviderAdapter implements IReturnHistoryProvider {
  constructor(
    private readonly returnRequestRepository: IReturnRequestRepository,
  ) {}

  async countReturnsInDays(customerId: string, days: number): Promise<number> {
    return this.returnRequestRepository.countByCustomerInDays(customerId, days);
  }
}

// ─── Factory & Singleton ─────────────────────────────────────────────────────

/**
 * Create a fresh container instance pre-loaded with config and default
 * in-memory implementations for dev/demo mode.
 * Use in tests or when you need an isolated container.
 */
export function createContainer(): Container {
  const container = new Container();
  const config = getConfig();

  container.register('config', config);

  // Register the in-process event bus as the default IEventBus implementation.
  container.register('eventBus', new InProcessEventBus());

  // Register the mock auth service for dev/demo mode (always-authenticate).
  container.register('authService', new MockAuthService());

  // Register the in-memory audit log repository.
  container.register('auditLogRepository', new InMemoryAuditLogRepository());

  // Register the in-memory return request repository.
  container.register('returnRequestRepository', new InMemoryReturnRequestRepository());

  // Register the in-memory condition assessment repository.
  container.register('conditionAssessmentRepository', new InMemoryConditionAssessmentRepository());

  // Register the in-memory disposition decision repository.
  container.register('dispositionDecisionRepository', new InMemoryDispositionDecisionRepository());

  // Register the deterministic mock condition grader for dev/demo mode.
  container.register('conditionGrader', new MockConditionGrader());

  // Register the deterministic mock identity verifier for dev/demo mode.
  container.register('identityVerifier', new MockIdentityVerifier());

  // Register the deterministic mock reason parser for dev/demo mode.
  container.register('reasonParser', new MockReasonParser());

  // Register the FraudScoreCalculator with config-driven parameters.
  container.register('fraudScoreCalculator', new FraudScoreCalculator({
    unsupportedClaimIncrement: config.fraud.unsupportedClaimIncrement,
  }));

  // Register the local filesystem media storage for dev/demo mode.
  container.register('mediaStorage', new LocalFilesystemMediaStorage());

  // ── Application-layer orchestrators & facades ──────────────────────────────

  // GradingOrchestrator — coordinates identity verification, condition grading,
  // reason parsing, fraud scoring, and event publication.
  const gradingOrchestrator = new GradingOrchestrator(
    container.getRequired('conditionGrader'),
    container.getRequired('identityVerifier'),
    container.getRequired('reasonParser'),
    container.getRequired('fraudScoreCalculator'),
    container.getRequired('eventBus'),
    config,
  );
  container.register('gradingOrchestrator', gradingOrchestrator);

  // ReturnsFacade — single entry point for the Returns module.
  const returnsFacade = new ReturnsFacade(
    config,
    container.getRequired('authService'),
    container.getRequired('returnRequestRepository'),
    container.getRequired('eventBus'),
    gradingOrchestrator,
    container.getRequired('conditionAssessmentRepository'),
    container.getRequired('auditLogRepository'),
  );
  container.register('returnsFacade', returnsFacade);

  // DispositionOrchestrator — coordinates disposition decision pipeline.
  const returnRequestLookup = new ReturnRequestLookupAdapter(
    container.getRequired('returnRequestRepository'),
    container.getRequired('authService'),
  );
  const demandSignalProvider = new InMemoryDemandSignalProvider();
  const returnHistoryProvider = new ReturnHistoryProviderAdapter(
    container.getRequired('returnRequestRepository'),
  );

  const dispositionOrchestrator = new DispositionOrchestrator(
    container.getRequired('eventBus'),
    container.getRequired('conditionAssessmentRepository'),
    container.getRequired('dispositionDecisionRepository'),
    returnRequestLookup,
    demandSignalProvider,
    returnHistoryProvider,
    config,
  );
  container.register('dispositionOrchestrator', dispositionOrchestrator);

  // Initialize event subscriptions — DispositionOrchestrator subscribes to ItemGraded.
  dispositionOrchestrator.initialize();

  // ── Load seed data for dev/demo mode ────────────────────────────────────────
  loadSeedData({
    authService: container.getRequired('authService') as MockAuthService,
    demandSignalProvider,
  });

  return container;
}

/**
 * Bootstrap the full application: create the container, wire all event
 * subscriptions and state-transition handlers, and return it ready for use.
 *
 * Call this at application startup (e.g., Lambda cold start or server init).
 */
export function bootstrapApplication(): Container {
  const appContainer = createContainer();

  const eventBus = appContainer.getRequired('eventBus');
  const returnRequestRepository = appContainer.getRequired('returnRequestRepository');

  // ── State-transition handlers via events ────────────────────────────────────

  // ItemGraded → transition ReturnRequest from Grading to Graded
  eventBus.subscribe('ItemGraded', async (event: DomainEvent) => {
    const { returnRequestId } = event.payload as { returnRequestId: string };
    const returnRequest = await returnRequestRepository.findById(returnRequestId);
    if (returnRequest && returnRequest.state === 'Grading') {
      const { ReturnStateMachine } = await import('../../domain/returns/ReturnStateMachine.js');
      const stateMachine = new ReturnStateMachine();
      const graded = stateMachine.transition(returnRequest, 'Graded', 'system', { trigger: 'ItemGraded' });
      await returnRequestRepository.save(graded);
    }
  });

  // DispositionAssigned → transition ReturnRequest based on the assigned route
  eventBus.subscribe('DispositionAssigned', async (event: DomainEvent) => {
    const { returnRequestId, route } = event.payload as { returnRequestId: string; route: string };
    const returnRequest = await returnRequestRepository.findById(returnRequestId);
    if (!returnRequest || returnRequest.state !== 'Graded') {
      return;
    }

    const { ReturnStateMachine } = await import('../../domain/returns/ReturnStateMachine.js');
    const stateMachine = new ReturnStateMachine();

    // Transition to DispositionAssigned first
    let updated = stateMachine.transition(returnRequest, 'DispositionAssigned', 'system', { trigger: `DispositionAssigned:${route}` });

    // Then transition to the route-specific state
    switch (route) {
      case 'instant_match':
      case 'refurbishment':
        updated = stateMachine.transition(updated, 'AwaitingPickup', 'system', { trigger: `DispositionAssigned:${route}` });
        break;
      case 'manual_inspection':
        updated = stateMachine.transition(updated, 'ManualReview', 'system', { trigger: `DispositionAssigned:${route}` });
        break;
      case 'list_for_resale':
        updated = stateMachine.transition(updated, 'Listed', 'system', { trigger: `DispositionAssigned:${route}` });
        break;
      case 'returnless_refund':
      case 'donate_or_recycle':
        updated = stateMachine.transition(updated, 'Completed', 'system', { trigger: `DispositionAssigned:${route}` });
        break;
    }

    await returnRequestRepository.save(updated);
  });

  return appContainer;
}

/**
 * The singleton application container.
 * Modules register into this as they are initialised.
 */
export const container: Container = createContainer();
