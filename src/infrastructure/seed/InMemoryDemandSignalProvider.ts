/**
 * InMemoryDemandSignalProvider — stores demand signals indexed by productId.
 *
 * Used by the DispositionOrchestrator to check if a nearby buyer exists
 * for a returned item (enabling the instant_match path).
 *
 * Pre-seeded with a demand signal for the Grade-A product in demo mode.
 *
 * Requirements: 10.3, 16.4
 */

import type { IDemandSignalProvider } from '../../application/disposition/DispositionOrchestrator.js';
import type { DemandSignal } from '../../domain/disposition/RoutingContext.js';

export class InMemoryDemandSignalProvider implements IDemandSignalProvider {
  private readonly signals = new Map<string, DemandSignal>();

  /**
   * Add a demand signal for a specific product.
   */
  addSignal(productId: string, signal: DemandSignal): void {
    this.signals.set(productId, signal);
  }

  /**
   * Remove a demand signal for a specific product.
   */
  removeSignal(productId: string): void {
    this.signals.delete(productId);
  }

  /**
   * Find nearby buyer demand for a given product.
   * Returns the signal if one exists, otherwise null.
   */
  async findNearbyDemand(productId: string): Promise<DemandSignal | null> {
    return this.signals.get(productId) ?? null;
  }
}
