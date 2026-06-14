// src/application/catalog/index.ts

// CatalogService facade
export { CatalogService } from './CatalogService.js';
export type { CatalogError, ListingRequestPayload, CatalogResult } from './CatalogService.js';

// CatalogConfig
export { DEFAULT_CATALOG_CONFIG } from './CatalogConfig.js';
export type { CatalogConfig } from './CatalogConfig.js';

// DeliveryEstimate
export { computeDeliveryEstimate } from './DeliveryEstimate.js';
export type { DeliveryEstimate } from './DeliveryEstimate.js';

// SearchService types (SearchService itself is internal, but types are public)
export type { SearchOptions, SearchFilters, SortOption, SearchResult, ProductSearchCard } from './SearchService.js';

// ListingRequestedHandler
export { ListingRequestedHandler } from './ListingRequestedHandler.js';
export type { ILogger, CatalogLogEntry } from './ListingRequestedHandler.js';
