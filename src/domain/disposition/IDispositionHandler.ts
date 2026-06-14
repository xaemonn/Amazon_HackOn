/**
 * IDispositionHandler — interface for Chain of Responsibility handlers
 * in the Disposition Engine.
 *
 * Each handler evaluates a RoutingContext and either produces a RoutingResult
 * (claiming the item) or passes to the next handler in the chain.
 *
 * Requirements: 10.1
 */

import type { RoutingContext } from './RoutingContext.js';
import type { RoutingResult } from './RoutingResult.js';

export interface IDispositionHandler {
  /** Evaluate the context and return a result, or null to pass to next handler. */
  handle(context: RoutingContext): RoutingResult | null;
  /** Set the next handler in the chain. Returns the next handler for fluent chaining. */
  setNext(handler: IDispositionHandler): IDispositionHandler;
}
