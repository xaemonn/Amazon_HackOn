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
import type { IEventBus } from '../../domain/shared/events.js';
import type { IReturnRequestRepository, IAuditLogRepository, IMediaStorage } from '../../domain/returns/index.js';
import type { IConditionGrader, IIdentityVerifier, IReasonParser } from '../../domain/grading/index.js';
import type { IDispositionDecisionRepository, IConditionAssessmentRepository } from '../../domain/disposition/index.js';
import { InMemoryAuditLogRepository } from '../persistence/index.js';
import { InProcessEventBus } from '../events/index.js';
import { MockConditionGrader } from '../ai/index.js';

// ─── Registry Keys ───────────────────────────────────────────────────────────

/**
 * All dependency keys the container manages.
 * This type map drives type-safe register/resolve.
 */
export interface ContainerRegistry {
  config: AppConfig;
  eventBus: IEventBus;
  returnRequestRepository: IReturnRequestRepository;
  auditLogRepository: IAuditLogRepository;
  conditionAssessmentRepository: IConditionAssessmentRepository;
  dispositionDecisionRepository: IDispositionDecisionRepository;
  mediaStorage: IMediaStorage;
  conditionGrader: IConditionGrader;
  identityVerifier: IIdentityVerifier;
  reasonParser: IReasonParser;
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

// ─── Factory & Singleton ─────────────────────────────────────────────────────

/**
 * Create a fresh container instance pre-loaded with config and default
 * in-memory implementations for dev/demo mode.
 * Use in tests or when you need an isolated container.
 */
export function createContainer(): Container {
  const container = new Container();
  container.register('config', getConfig());
  // Register the in-process event bus as the default IEventBus implementation.
  // In production this is swapped for an Amazon EventBridge adapter via config.
  container.register('eventBus', new InProcessEventBus());
  // Register the in-memory audit log repository as the default implementation.
  // It will be swapped for a DynamoDB-backed one when AWS adapters are wired in.
  container.register('auditLogRepository', new InMemoryAuditLogRepository());
  // Register the deterministic mock condition grader for dev/demo mode.
  // When ZTR_BEDROCK_ENABLED=true, this is replaced by BedrockGraderAdapter.
  container.register('conditionGrader', new MockConditionGrader());
  return container;
}

/**
 * The singleton application container.
 * Modules register into this as they are initialised.
 */
export const container: Container = createContainer();
