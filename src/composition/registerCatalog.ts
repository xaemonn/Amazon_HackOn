/**
 * Catalog Module Registrar
 *
 * Accepts shared dependencies and returns the module's public facade.
 * Requirements: 3.1, 3.2, 3.4, 13.2
 */

import type { IEventBus } from '../domain/shared/events.js';
import type { IProductRepository } from '../domain/catalog/IProductRepository.js';
import type { IVariantRepository } from '../domain/catalog/IVariantRepository.js';
import type { ICategoryRepository } from '../domain/catalog/ICategoryRepository.js';
import { CatalogService } from '../application/catalog/CatalogService.js';
import { SearchService } from '../application/catalog/SearchService.js';
import { DEFAULT_CATALOG_CONFIG } from '../application/catalog/CatalogConfig.js';

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface CatalogDeps {
  eventBus: IEventBus;
  productRepository: IProductRepository;
  variantRepository: IVariantRepository;
  categoryRepository: ICategoryRepository;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface CatalogModuleResult {
  catalogService: CatalogService;
  searchService: SearchService;
  dispose: () => void;
}

// ─── Registrar ───────────────────────────────────────────────────────────────

export function registerCatalog(deps: CatalogDeps): CatalogModuleResult {
  const { eventBus, productRepository, variantRepository, categoryRepository } = deps;

  const catalogService = new CatalogService(
    productRepository,
    variantRepository,
    categoryRepository,
    eventBus,
    DEFAULT_CATALOG_CONFIG,
  );

  const searchService = new SearchService(
    productRepository,
    variantRepository,
    DEFAULT_CATALOG_CONFIG,
  );

  return {
    catalogService,
    searchService,
    dispose: () => {
      // No active subscriptions to clean up in the catalog module.
      // CatalogService and SearchService are stateless beyond their injected repos.
    },
  };
}
