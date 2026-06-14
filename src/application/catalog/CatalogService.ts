// src/application/catalog/CatalogService.ts

import { randomUUID } from 'node:crypto';

import type { Product } from '../../domain/catalog/Product.js';
import { ProductVariant } from '../../domain/catalog/ProductVariant.js';
import type { Category } from '../../domain/catalog/Category.js';
import type { IProductRepository } from '../../domain/catalog/IProductRepository.js';
import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { ICategoryRepository } from '../../domain/catalog/ICategoryRepository.js';
import type { IEventBus } from '../../domain/shared/events.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { CatalogConfig } from './CatalogConfig.js';
import { type DeliveryEstimate, computeDeliveryEstimate } from './DeliveryEstimate.js';
import { SearchService, type SearchOptions, type SearchResult } from './SearchService.js';

// ─── Exported Types ──────────────────────────────────────────────────────────

export interface CatalogError {
  type: 'validation' | 'not_found' | 'duplicate' | 'invalid_grade';
  field: string;
  message: string;
}

export interface ListingRequestPayload {
  returnRequestId: string;
  productId: string;
  conditionGrade: string;
  assessmentSummary: string;
  mediaReferences: MediaReference[];
}

export type CatalogResult<T> = { success: true; data: T } | { success: false; error: CatalogError };

// ─── CatalogService Facade ───────────────────────────────────────────────────

export class CatalogService {
  private readonly searchService: SearchService;

  constructor(
    private readonly productRepo: IProductRepository,
    private readonly variantRepo: IVariantRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly eventBus: IEventBus,
    private readonly config: CatalogConfig,
  ) {
    this.searchService = new SearchService(productRepo, variantRepo, config);
  }

  async getProductById(id: string): Promise<Product | null> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return null;
    }
    return this.productRepo.findById(id);
  }

  async getVariantsByProductId(productId: string): Promise<ProductVariant[]> {
    if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
      return [];
    }
    return this.variantRepo.findByProductId(productId);
  }

  async searchProducts(keyword: string, options?: SearchOptions): Promise<SearchResult> {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return {
        products: [],
        totalCount: 0,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? this.config.searchPageSize,
        totalPages: 0,
      };
    }
    return this.searchService.search(keyword, options);
  }

  async getCategories(): Promise<Category[]> {
    return this.categoryRepo.findAll();
  }

  async getProductsByCategory(categoryId: string): Promise<Product[]> {
    if (!categoryId || typeof categoryId !== 'string' || categoryId.trim().length === 0) {
      return [];
    }
    return this.productRepo.findByCategory(categoryId);
  }

  async getDeliveryEstimate(): Promise<DeliveryEstimate> {
    return computeDeliveryEstimate(this.config);
  }

  async createVariantFromListing(payload: ListingRequestPayload): Promise<CatalogResult<ProductVariant>> {
    // Validate required fields
    const requiredFields: (keyof ListingRequestPayload)[] = [
      'returnRequestId',
      'productId',
      'conditionGrade',
      'assessmentSummary',
      'mediaReferences',
    ];

    for (const field of requiredFields) {
      const value = payload[field];
      if (field === 'mediaReferences') {
        if (!Array.isArray(value) || value.length === 0) {
          return {
            success: false,
            error: { type: 'validation', field, message: `${field} is required and must be a non-empty array` },
          };
        }
      } else {
        if (!value || typeof value !== 'string' || (value as string).trim().length === 0) {
          return {
            success: false,
            error: { type: 'validation', field, message: `${field} is required and must be a non-empty string` },
          };
        }
      }
    }

    // Validate conditionGrade is 'A'
    if (payload.conditionGrade !== 'A') {
      return {
        success: false,
        error: {
          type: 'invalid_grade',
          field: 'conditionGrade',
          message: `Only grade 'A' items can be listed. Received: '${payload.conditionGrade}'`,
        },
      };
    }

    // Check product exists
    const product = await this.productRepo.findById(payload.productId);
    if (!product) {
      return {
        success: false,
        error: { type: 'not_found', field: 'productId', message: `Product '${payload.productId}' not found` },
      };
    }

    // Check idempotency — no duplicate variant for the same return
    const existing = await this.variantRepo.findBySourceReturnId(payload.returnRequestId);
    if (existing) {
      return {
        success: false,
        error: {
          type: 'duplicate',
          field: 'returnRequestId',
          message: `A variant already exists for return request '${payload.returnRequestId}'`,
        },
      };
    }

    // Compute price with open-box discount
    const price = product.basePrice * (1 - this.config.openBoxDiscountPercent / 100);

    // Cap unit photos at maxUnitPhotos
    const unitPhotos = payload.mediaReferences.slice(0, this.config.maxUnitPhotos);

    // Create the variant
    const variant = new ProductVariant({
      id: randomUUID(),
      productId: payload.productId,
      condition: 'Open_Box',
      price,
      stock: 1,
      sourceReturnId: payload.returnRequestId,
      conditionReport: payload.assessmentSummary,
      unitPhotos,
    });

    // Persist the variant
    await this.variantRepo.save(variant);

    // Publish ListingCreated event
    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: 'ListingCreated',
      timestamp: new Date(),
      payload: {
        variantId: variant.id,
        productId: variant.productId,
        condition: variant.condition,
        sourceReturnId: variant.sourceReturnId!,
        price: variant.price,
      },
    });

    return { success: true, data: variant };
  }
}
