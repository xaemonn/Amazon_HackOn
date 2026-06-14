/**
 * Returns Module Registrar
 *
 * Accepts shared dependencies and returns the module's public facade.
 * Instantiates ReturnsFacade, GradingOrchestrator, and internal hero-path
 * event wiring (GradingCompleteHandler + DispositionStateHandler +
 * DispositionOrchestrator).
 *
 * Requirements: 3.1, 3.2, 3.4, 13.2
 */

import type { IEventBus } from '../domain/shared/events.js';
import type { IReturnRequestRepository } from '../domain/returns/IReturnRequestRepository.js';
import type { IOrderRepository } from '../domain/ordering/IOrderRepository.js';
import type { ICustomerRepository } from '../domain/account/ICustomerRepository.js';
import type { IProductRepository } from '../domain/catalog/IProductRepository.js';
import type { IAuthService } from '../domain/shared/IAuthService.js';
import type { IReturnsFacade } from '../application/returns/index.js';
import { ReturnsFacade } from '../application/returns/index.js';
import { GradingOrchestrator } from '../application/grading/GradingOrchestrator.js';
import { initializeHeroPathWiring } from '../application/hero-path-wiring.js';
import { DispositionOrchestrator } from '../application/disposition/DispositionOrchestrator.js';
import { MockConditionGrader, MockIdentityVerifier, MockReasonParser } from '../infrastructure/ai/index.js';
import { FraudScoreCalculator } from '../domain/grading/FraudScoreCalculator.js';
import { InMemoryConditionAssessmentRepository, InMemoryDispositionDecisionRepository, InMemoryAuditLogRepository } from '../infrastructure/persistence/index.js';
import { InMemoryDemandSignalProvider } from '../infrastructure/seed/InMemoryDemandSignalProvider.js';
import { getConfig } from '../infrastructure/config/index.js';
import type { IReturnRequestLookup, IDemandSignalProvider, IReturnHistoryProvider } from '../application/disposition/DispositionOrchestrator.js';
import type { ReturnReason } from '../domain/shared/types.js';

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface ReturnsDeps {
  eventBus: IEventBus;
  returnRequestRepository: IReturnRequestRepository;
  orderRepository: IOrderRepository;
  customerRepository: ICustomerRepository;
  productRepository: IProductRepository;
  authService: IAuthService;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface ReturnsModuleResult {
  returnsFacade: IReturnsFacade;
  dispose: () => void;
}

// ─── Internal Adapters ───────────────────────────────────────────────────────

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

// ─── Registrar ───────────────────────────────────────────────────────────────

export function registerReturns(deps: ReturnsDeps): ReturnsModuleResult {
  const { eventBus, returnRequestRepository, orderRepository, customerRepository, productRepository, authService } = deps;

  const config = getConfig();

  // ── Module-internal repositories (not shared across modules) ──────────────
  const conditionAssessmentRepository = new InMemoryConditionAssessmentRepository();
  const dispositionDecisionRepository = new InMemoryDispositionDecisionRepository();
  const auditLogRepository = new InMemoryAuditLogRepository();

  // ── Mock AI adapters (module-internal, not shared) ────────────────────────
  const conditionGrader = new MockConditionGrader();
  const identityVerifier = new MockIdentityVerifier();
  const reasonParser = new MockReasonParser();
  const fraudScoreCalculator = new FraudScoreCalculator();

  // ── GradingOrchestrator ───────────────────────────────────────────────────
  const gradingOrchestrator = new GradingOrchestrator(
    conditionGrader,
    identityVerifier,
    reasonParser,
    fraudScoreCalculator,
    eventBus,
    config,
    conditionAssessmentRepository,
  );

  // ── ReturnsFacade ─────────────────────────────────────────────────────────
  const returnsFacade: IReturnsFacade = new ReturnsFacade(
    config,
    authService,
    returnRequestRepository,
    eventBus,
    gradingOrchestrator,
    conditionAssessmentRepository,
    auditLogRepository,
  );

  // ── Hero-path wiring (internal event lifecycle handlers) ──────────────────
  const heroPathWiring = initializeHeroPathWiring({
    eventBus,
    returnRequestRepository,
    conditionAssessmentRepository,
    dispositionDecisionRepository,
  });

  // ── DispositionOrchestrator (subscribes to ItemGraded internally) ─────────
  const returnRequestLookup = new ReturnRequestLookupAdapter(returnRequestRepository, authService);
  const demandSignalProvider: IDemandSignalProvider = new InMemoryDemandSignalProvider();
  const returnHistoryProvider = new ReturnHistoryProviderAdapter(returnRequestRepository);

  const dispositionOrchestrator = new DispositionOrchestrator(
    eventBus,
    conditionAssessmentRepository,
    dispositionDecisionRepository,
    returnRequestLookup,
    demandSignalProvider,
    returnHistoryProvider,
    config,
  );
  dispositionOrchestrator.initialize();

  return {
    returnsFacade,
    dispose: () => {
      heroPathWiring.dispose();
      dispositionOrchestrator.dispose();
    },
  };
}
