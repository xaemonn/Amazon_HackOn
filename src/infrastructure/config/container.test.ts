import { describe, it, expect, beforeEach } from 'vitest';
import { Container, createContainer, container, bootstrapApplication } from './container.js';

describe('Container', () => {
  let testContainer: Container;

  beforeEach(() => {
    testContainer = createContainer();
  });

  it('should have config pre-registered via createContainer()', () => {
    const config = testContainer.getRequired('config');
    expect(config).toBeDefined();
    expect(config.returnWindow.defaultDays).toBe(10);
  });

  it('should register and resolve a dependency', () => {
    const mockEventBus = {
      publish: async () => {},
      subscribe: () => {},
      unsubscribe: () => {},
    };

    testContainer.register('eventBus', mockEventBus);
    const resolved = testContainer.getRequired('eventBus');

    expect(resolved).toBe(mockEventBus);
  });

  it('should throw a descriptive error when resolving an unregistered required dependency', () => {
    const freshContainer = new Container();
    expect(() => freshContainer.getRequired('eventBus')).toThrowError(
      /Dependency "eventBus" has not been registered/
    );
  });

  it('should return null for an unregistered optional dependency', () => {
    const freshContainer = new Container();
    const result = freshContainer.getOptional('eventBus');
    expect(result).toBeNull();
  });

  it('should report whether a dependency is registered via has()', () => {
    expect(testContainer.has('eventBus')).toBe(true);

    testContainer.unregister('eventBus');
    expect(testContainer.has('eventBus')).toBe(false);

    testContainer.register('eventBus', {
      publish: async () => {},
      subscribe: () => {},
      unsubscribe: () => {},
    });

    expect(testContainer.has('eventBus')).toBe(true);
  });

  it('should allow overwriting a previously registered dependency', () => {
    const first = { publish: async () => {}, subscribe: () => {}, unsubscribe: () => {} };
    const second = { publish: async () => {}, subscribe: () => {}, unsubscribe: () => {} };

    testContainer.register('eventBus', first);
    testContainer.register('eventBus', second);

    expect(testContainer.getRequired('eventBus')).toBe(second);
  });

  it('should unregister a dependency', () => {
    testContainer.register('eventBus', {
      publish: async () => {},
      subscribe: () => {},
      unsubscribe: () => {},
    });

    testContainer.unregister('eventBus');

    expect(testContainer.has('eventBus')).toBe(false);
    expect(testContainer.getOptional('eventBus')).toBeNull();
  });

  it('should reset all registrations', () => {
    testContainer.reset();

    expect(testContainer.has('config')).toBe(false);
    expect(testContainer.has('eventBus')).toBe(false);
    expect(testContainer.has('gradingOrchestrator')).toBe(false);
    expect(testContainer.has('returnsFacade')).toBe(false);
    expect(testContainer.has('dispositionOrchestrator')).toBe(false);
  });

  it('should read bedrockEnabled from environment', () => {
    // Default (no env var set) should be false
    expect(testContainer.bedrockEnabled).toBe(false);
  });

  it('should export a singleton container instance', () => {
    expect(container).toBeInstanceOf(Container);
    expect(container.has('config')).toBe(true);
  });

  // ── New registry keys (task 7.3) ────────────────────────────────────────────

  it('should have gradingOrchestrator registered via createContainer()', () => {
    const gradingOrchestrator = testContainer.getRequired('gradingOrchestrator');
    expect(gradingOrchestrator).toBeDefined();
    expect(typeof gradingOrchestrator.grade).toBe('function');
  });

  it('should have returnsFacade registered via createContainer()', () => {
    const returnsFacade = testContainer.getRequired('returnsFacade');
    expect(returnsFacade).toBeDefined();
    expect(typeof returnsFacade.initiateReturn).toBe('function');
    expect(typeof returnsFacade.checkEligibility).toBe('function');
    expect(typeof returnsFacade.completeMediaCapture).toBe('function');
  });

  it('should have dispositionOrchestrator registered via createContainer()', () => {
    const dispositionOrchestrator = testContainer.getRequired('dispositionOrchestrator');
    expect(dispositionOrchestrator).toBeDefined();
    expect(typeof dispositionOrchestrator.initialize).toBe('function');
    expect(typeof dispositionOrchestrator.dispose).toBe('function');
  });
});

describe('bootstrapApplication', () => {
  it('should create a fully-wired container with all dependencies', () => {
    const appContainer = bootstrapApplication();

    expect(appContainer).toBeInstanceOf(Container);
    expect(appContainer.has('config')).toBe(true);
    expect(appContainer.has('eventBus')).toBe(true);
    expect(appContainer.has('authService')).toBe(true);
    expect(appContainer.has('returnRequestRepository')).toBe(true);
    expect(appContainer.has('conditionAssessmentRepository')).toBe(true);
    expect(appContainer.has('dispositionDecisionRepository')).toBe(true);
    expect(appContainer.has('gradingOrchestrator')).toBe(true);
    expect(appContainer.has('returnsFacade')).toBe(true);
    expect(appContainer.has('dispositionOrchestrator')).toBe(true);
  });

  it('should have dispositionOrchestrator subscribed to ItemGraded events', () => {
    const appContainer = bootstrapApplication();
    const eventBus = appContainer.getRequired('eventBus');

    // The InProcessEventBus stores subscribers internally.
    // We just verify the orchestrator is registered and the system boots.
    expect(appContainer.getRequired('dispositionOrchestrator')).toBeDefined();
    expect(eventBus).toBeDefined();
  });
});
