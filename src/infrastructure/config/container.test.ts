import { describe, it, expect, beforeEach } from 'vitest';
import { Container, createContainer, container } from './container.js';

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
    expect(() => testContainer.getRequired('eventBus')).toThrowError(
      /Dependency "eventBus" has not been registered/
    );
  });

  it('should return null for an unregistered optional dependency', () => {
    const result = testContainer.getOptional('eventBus');
    expect(result).toBeNull();
  });

  it('should report whether a dependency is registered via has()', () => {
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
    testContainer.register('eventBus', {
      publish: async () => {},
      subscribe: () => {},
      unsubscribe: () => {},
    });

    testContainer.reset();

    expect(testContainer.has('config')).toBe(false);
    expect(testContainer.has('eventBus')).toBe(false);
  });

  it('should read bedrockEnabled from environment', () => {
    // Default (no env var set) should be false
    expect(testContainer.bedrockEnabled).toBe(false);
  });

  it('should export a singleton container instance', () => {
    expect(container).toBeInstanceOf(Container);
    expect(container.has('config')).toBe(true);
  });
});
