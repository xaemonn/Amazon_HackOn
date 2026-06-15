// Resale domain module — circular-commerce relisting marketplace.

export type {
  ResaleListing,
  ListingType,
  ListingStatus,
  FulfilmentMode,
  TransferAllocation,
  KeepOffer,
} from './ResaleListing.js';
export {
  sellListing,
  expireListing,
  acceptKeepOffer,
  normalizeCity,
  ListingNotPurchasableError,
} from './ResaleListing.js';

export type {
  ResalePricingConfig,
  GradePricing,
} from './ResalePricingPolicy.js';
export {
  isResaleGrade,
  priceForGrade,
  keepOfferAmount,
} from './ResalePricingPolicy.js';

export type { IResaleListingRepository } from './IResaleListingRepository.js';
