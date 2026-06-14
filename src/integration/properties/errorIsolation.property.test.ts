/**
 * Feature: integration-wiring, Property 2: Error isolation
 *
 * Property: Error isolation — throwing handlers do not affect others.
 * For any domain event and for any set of N registered handlers where K handlers
 * (0 ≤ K ≤ N) throw errors, the remaining N−K handlers SHALL still be invoked
 * and complete, and the publish() call SHALL resolve without throwing to the publisher.
 *
 * **Validates: Requirements 1.5, 10.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InProcessEventBus } from '../../infrastructure/events/InProcessEventBus.js';
import type { DomainEvent } from '../../domain/shared/events.js';

describe('Feature: integration-wiring, Property 2: Error isolation', () => {
  it('throwing handlers do not affect remaining handlers and publish() resolves without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }).chain((n) =>
          fc.tuple(
            fc.constant(n),
            fc.subarray(
              Array.from({ length: n }, (_, i) => i),
              { minLength: 0, maxLength: n }
            )
          )
        ),
        async ([n, throwPositions]) => {
          const eventBus = new InProcessEventBus();
          const eventType = 'TestEvent';
          const throwSet = new Set(throwPositions);
          const k = throwSet.size;

          // Track which non-throwing handlers were invoked
          const invoked: number[] = [];

          // Subscribe N handlers: K of them throw, the rest track invocation
          for (let i = 0; i < n; i++) {
            if (throwSet.has(i)) {
              eventBus.subscribe(eventType, async () => {
                throw new Error(`Handler ${i} intentionally throws`);
              });
            } else {
              const index = i;
              eventBus.subscribe(eventType, async () => {
                invoked.push(index);
              });
            }
          }

          // Create a test event
          const event: DomainEvent = {
            eventId: `test-${Date.now()}-${Math.random()}`,
            eventType,
            timestamp: new Date(),
            payload: {},
          };

          // Verify publish() resolves without throwing
          await expect(eventBus.publish(event)).resolves.toBeUndefined();

          // Verify all N−K non-throwing handlers were invoked
          expect(invoked.length).toBe(n - k);
        }
      ),
      { numRuns: 100 }
    );
  });
});
