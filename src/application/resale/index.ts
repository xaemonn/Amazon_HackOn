// Resale application module — marketplace service + relisting event handler.

export {
  ResaleService,
  type CreateListingInput,
  type PurchaseInput,
  type PurchaseResult,
  type ExpirySweepResult,
} from './ResaleService.js';
export {
  ResaleListingHandler,
  type ResaleListingHandlerDeps,
} from './ResaleListingHandler.js';
