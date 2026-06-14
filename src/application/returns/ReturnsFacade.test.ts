/**
 * Unit tests for ReturnsFacade — the application service orchestrating
 * the full return lifecycle.
 *
 * Tests use in-memory implementations and simple mocks to verify
 * facade behaviour without infrastructure dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReturnsFacade } from './index.js';
import type { IReturnsFacade, InitiateReturnCommand, SubmitReasonCommand, SubmitMediaCommand } from './index.js';
import type { IAuthService, OrderItem as AuthOrderItem } from '../../domain/shared/IAuthService.js';
import type { IEventBus, DomainEvent } from '../../domain/shared/events.js';
import type { IReturnRequestRepository } from '../../domain/returns/IReturnRequestRepository.js';
import type { IAuditLogRepository } from '../../domain/returns/IAuditLogRepository.js';
import type { IConditionAssessmentRepository } from '../../domain/disposition/index.js';
import type { MediaReference } from '../../domain/shared/types.js';
import { ReturnRequest } from '../../domain/returns/ReturnRequest.js';
import { GradingOrchestrator } from '../grading/GradingOrchestrator.js';
import { DEFAULT_CONFIG } from '../../infrastructure/config/index.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createMockAuthService(orderItems: AuthOrderItem[] = []): IAuthService {
  const itemMap = new Map(orderItems.map((item) => [item.id, item]));
  return {
    authenticate: vi.fn().mockResolvedValue({ id: 'cust-1', name: 'Test', email: 'test@test.com' }),
    verifyOwnership: vi.fn().mockImplementation(async (customerId: string, orderItemId: string) => {
      const item = itemMap.get(orderItemId);
      return item?.customerId === customerId;
    }),
    getOrderItem: vi.fn().mockImplementation(async (orderItemId: string) => {
      return itemMap.get(orderItemId) ?? null;
    }),
    getOrderItemsByCustomer: vi.fn().mockResolvedValue([]),
  };
}

function createMockEventBus(): IEventBus & { publishedEvents: DomainEvent[] } {
  const publishedEvents: DomainEvent[] = [];
  return {
    publishedEvents,
    publish: vi.fn().mockImplementation(async (event: DomainEvent) => {
      publishedEvents.push(event);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

function createMockReturnRequestRepository(): IReturnRequestRepository & { store: Map<string, ReturnRequest> } {
  const store = new Map<string, ReturnRequest>();
  return {
    store,
    save: vi.fn().mockImplementation(async (rr: ReturnRequest) => {
      store.set(rr.id, rr);
    }),
    findById: vi.fn().mockImplementation(async (id: string) => {
      return store.get(id) ?? null;
    }),
    findByCustomerId: vi.fn().mockResolvedValue([]),
    findByOrderItemId: vi.fn().mockImplementation(async (orderItemId: string) => {
      for (const rr of store.values()) {
        if (rr.orderItemId === orderItemId) return rr;
      }
      return null;
    }),
    countByCustomerInDays: vi.fn().mockResolvedValue(1),
  };
}

function createMockConditionAssessmentRepo(): IConditionAssessmentRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByReturnRequestId: vi.fn().mockResolvedValue(null),
  };
}

function createMockGradingOrchestrator(): GradingOrchestrator {
  return {
    grade: vi.fn().mockResolvedValue({
      returnRequestId: 'test',
      grade: 'A',
      defects: [],
      reasoning: 'Like new',
      confidence: 0.95,
      identityVerdict: 'genuine',
      identityConfidence: 0.99,
      fraudScore: 0.1,
      reconciliation: { status: 'aligns', claims: [], rawText: '' },
      requiresManualReview: false,
      manualReviewReasons: [],
      gradedAt: new Date(),
    }),
  } as unknown as GradingOrchestrator;
}

const sampleAuthOrderItem: AuthOrderItem = {
  id: 'oi-1',
  orderId: 'order-1',
  productId: 'prod-1',
  customerId: 'cust-1',
  deliveryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
  price: 999,
  currency: 'INR',
  productName: 'Test Widget',
  productImage: 'https://example.com/widget.jpg',
  catalogImageRef: 'catalog/prod-1.jpg',
};

function buildCompleteMedia(): MediaReference[] {
  return [
    { id: 'm1', type: 'photo_front', storageKey: 'k1', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() },
    { id: 'm2', type: 'photo_back', storageKey: 'k2', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() },
    { id: 'm3', type: 'photo_closeup', storageKey: 'k3', format: 'png', sizeBytes: 1000, capturedAt: new Date() },
    { id: 'm4', type: 'video', storageKey: 'k4', format: 'mp4', sizeBytes: 5000, capturedAt: new Date() },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReturnsFacade', () => {
  let facade: IReturnsFacade;
  let authService: ReturnType<typeof createMockAuthService>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let repo: ReturnType<typeof createMockReturnRequestRepository>;
  let conditionRepo: IConditionAssessmentRepository;
  let gradingOrchestrator: ReturnType<typeof createMockGradingOrchestrator>;

  beforeEach(() => {
    authService = createMockAuthService([sampleAuthOrderItem]);
    eventBus = createMockEventBus();
    repo = createMockReturnRequestRepository();
    conditionRepo = createMockConditionAssessmentRepo();
    gradingOrchestrator = createMockGradingOrchestrator();

    facade = new ReturnsFacade(
      DEFAULT_CONFIG,
      authService,
      repo,
      eventBus,
      gradingOrchestrator,
      conditionRepo,
    );
  });

  // ── checkEligibility ──────────────────────────────────────────────────────

  describe('checkEligibility', () => {
    it('returns eligible for an item within the return window', async () => {
      const result = await facade.checkEligibility('cust-1', 'oi-1');
      expect(result.eligible).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.productName).toBe('Test Widget');
    });

    it('returns ineligible error when order item not found', async () => {
      const result = await facade.checkEligibility('cust-1', 'nonexistent');
      expect(result.eligible).toBe(false);
      expect(result.errorMessage).toContain('could not be found');
    });

    it('returns ineligible error when customer does not own the item', async () => {
      const result = await facade.checkEligibility('cust-other', 'oi-1');
      expect(result.eligible).toBe(false);
      expect(result.errorMessage).toContain('does not belong');
    });
  });

  // ── initiateReturn ────────────────────────────────────────────────────────

  describe('initiateReturn', () => {
    it('creates a return request in Initiated state and publishes event', async () => {
      const command: InitiateReturnCommand = {
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
        reasonDetails: 'Screen has a crack',
      };

      const result = await facade.initiateReturn(command);

      expect(result.state).toBe('Initiated');
      expect(result.customerId).toBe('cust-1');
      expect(result.orderItemId).toBe('oi-1');
      expect(result.reason).toBe('defective');
      expect(result.reasonDetails).toBe('Screen has a crack');
      expect(result.id).toBeDefined();

      // Event published
      expect(eventBus.publishedEvents).toHaveLength(1);
      expect(eventBus.publishedEvents[0].eventType).toBe('ReturnInitiated');
    });

    it('throws when customer does not own the item', async () => {
      const command: InitiateReturnCommand = {
        customerId: 'cust-other',
        orderItemId: 'oi-1',
        reason: 'defective',
      };

      await expect(facade.initiateReturn(command)).rejects.toThrow('does not belong');
    });

    it('prevents duplicate returns on the same order item', async () => {
      const command: InitiateReturnCommand = {
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
      };

      await facade.initiateReturn(command);
      await expect(facade.initiateReturn(command)).rejects.toThrow('already exists');
    });
  });

  // ── submitReason ──────────────────────────────────────────────────────────

  describe('submitReason', () => {
    it('updates the reason and details on an existing return request', async () => {
      const initiated = await facade.initiateReturn({
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
      });

      const result = await facade.submitReason({
        returnRequestId: initiated.id,
        reason: 'damaged_in_transit',
        reasonDetails: 'Box was crushed',
      });

      expect(result.reason).toBe('damaged_in_transit');
      expect(result.reasonDetails).toBe('Box was crushed');
    });

    it('throws when return request not found', async () => {
      await expect(facade.submitReason({
        returnRequestId: 'nonexistent',
        reason: 'defective',
      })).rejects.toThrow('not found');
    });
  });

  // ── submitMedia ───────────────────────────────────────────────────────────

  describe('submitMedia', () => {
    it('adds media references to an existing return request', async () => {
      const initiated = await facade.initiateReturn({
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
      });

      const media: MediaReference[] = [
        { id: 'm1', type: 'photo_front', storageKey: 'k1', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() },
      ];

      const result = await facade.submitMedia({
        returnRequestId: initiated.id,
        media,
      });

      expect(result.media).toHaveLength(1);
      expect(result.media[0].type).toBe('photo_front');
    });
  });

  // ── completeMediaCapture ──────────────────────────────────────────────────

  describe('completeMediaCapture', () => {
    it('transitions to Grading state when media is complete', async () => {
      const initiated = await facade.initiateReturn({
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
      });

      // Submit complete media
      await facade.submitMedia({
        returnRequestId: initiated.id,
        media: buildCompleteMedia(),
      });

      const result = await facade.completeMediaCapture(initiated.id);

      expect(result.state).toBe('Grading');
    });

    it('throws MediaValidationError when media is incomplete', async () => {
      const initiated = await facade.initiateReturn({
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
      });

      // Submit only one photo — incomplete
      await facade.submitMedia({
        returnRequestId: initiated.id,
        media: [{ id: 'm1', type: 'photo_front', storageKey: 'k1', format: 'jpeg', sizeBytes: 1000, capturedAt: new Date() }],
      });

      await expect(facade.completeMediaCapture(initiated.id)).rejects.toThrow('Media validation failed');
    });
  });

  // ── getReturnById ─────────────────────────────────────────────────────────

  describe('getReturnById', () => {
    it('returns projection for existing return', async () => {
      const initiated = await facade.initiateReturn({
        customerId: 'cust-1',
        orderItemId: 'oi-1',
        reason: 'defective',
      });

      const result = await facade.getReturnById(initiated.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(initiated.id);
      expect(result!.state).toBe('Initiated');
    });

    it('returns null for nonexistent return', async () => {
      const result = await facade.getReturnById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
