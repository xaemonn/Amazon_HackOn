/**
 * Property 1: Event bus delivers to all subscribers and awaits completion
 *
 * For any domain event and for any set of N registered handlers for that event's type,
 * publishing the event SHALL invoke all N handlers, and the publish() Promise SHALL not
 * resolve until every handler's returned Promise has settled.
 *
 * Feature: integration-wiring, Property 1: Event bus delivery completeness
 * Validates: Requirements 1.3
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InProcessEventBus } from '../../infrastructure/events/InProcessEventBus';
import type { DomainEvent } from '../../domain/shared/events';

describe('Feature: integration-wiring, Property 1: Event bus delivery completeness', () => {
  it('Event bus delivers to all subscribers and awaits completion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (handlerCount, eventType) => {
          // Create a fresh event bus for each run
          const bus = new InProcessEventBus();

          // Track which handlers were invoked
          const invoked: number[] = [];
          // Track whether all handlers had settled before publish resolved
          let allSettledBeforeResolve = true;
          const settledFlags: boolean[] = new Array(handlerCount).fill(false);

          // Subscribe N unique handlers
          for (let i = 0; i < handlerCount; i++) {
            const index = i;
            const handler = async (_event: DomainEvent): Promise<void> => {
              // Simulate async work with a small random delay
              await new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 5));
              invoked.push(index);
              settledFlags[index] = true;
            };
            bus.subscribe(eventType, handler);
          }

          // Create a unique event
          const event: DomainEvent = {
            eventId: `test-${Date.now()}-${Math.random()}`,
            eventType,
            timestamp: new Date(),
            payload: {},
          };

          // Publish and await
          await bus.publish(event);

          // After publish resolves, check all settled flags
          for (let i = 0; i < handlerCount; i++) {
            if (!settledFlags[i]) {
              allSettledBeforeResolve = false;
            }
          }

          // All N handlers must have been invoked
          expect(invoked.length).toBe(handlerCount);

          // All handlers must have settled before publish() resolved
          expect(allSettledBeforeResolve).toBe(true);

          // Each handler index should appear exactly once
          const uniqueInvoked = new Set(invoked);
          expect(uniqueInvoked.size).toBe(handlerCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
