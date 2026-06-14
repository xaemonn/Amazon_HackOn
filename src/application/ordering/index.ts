/**
 * Ordering application module — barrel export.
 *
 * Consumers depend on IOrdersService and OrdersService from this module.
 * IReturnsFacade is imported here only as an interface (never the concrete
 * ReturnsFacade class) to preserve module-boundary rules.
 *
 * EligibilityResult is re-exported so consumers can reference the type
 * without reaching into the Returns module directly.
 */

export type { IOrdersService } from './OrdersService.js';
export { OrdersService } from './OrdersService.js';

// Re-export the interface only — never import concrete Returns internals
export type { IReturnsFacade } from '../../application/returns/index.js';

// Re-export EligibilityResult so consumers can import it from here
export type { EligibilityResult } from '../../application/returns/index.js';
