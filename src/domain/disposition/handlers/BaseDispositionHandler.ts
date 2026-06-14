/**
 * BaseDispositionHandler — abstract base class implementing the Chain of Responsibility
 * plumbing (setNext / pass-to-next logic).
 *
 * Concrete handlers override `handle()` to evaluate the context.
 */

import type { IDispositionHandler } from '../IDispositionHandler.js';
import type { RoutingContext } from '../RoutingContext.js';
import type { RoutingResult } from '../RoutingResult.js';

export abstract class BaseDispositionHandler implements IDispositionHandler {
  private nextHandler: IDispositionHandler | null = null;

  setNext(handler: IDispositionHandler): IDispositionHandler {
    this.nextHandler = handler;
    return handler;
  }

  abstract handle(context: RoutingContext): RoutingResult | null;

  /**
   * Pass to the next handler in the chain.
   * Returns null if there is no next handler.
   */
  protected passToNext(context: RoutingContext): RoutingResult | null {
    if (this.nextHandler) {
      return this.nextHandler.handle(context);
    }
    return null;
  }
}
