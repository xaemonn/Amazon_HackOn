// src/application/catalog/SearchService.ts

import type { IProductRepository } from '../../domain/catalog/IProductRepository.js';
import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { Condition } from '../../domain/catalog/ProductVariant.js';
import type { CatalogConfig } from './CatalogConfig.js';

export interface SearchOptions {
  filters?: SearchFilters;
  sort?: SortOption;
  page?: number;       // 1-based, default 1
  pageSize?: number;   // default 20
}

export interface SearchFilters {
  priceMin?: number;
  priceMax?: number;
  brands?: string[];
  minRating?: number;
  conditions?: Condition[];
}

export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'rating_desc';

export interface SearchResult {
  products: ProductSearchCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductSearchCard {
  id: string;
  title: string;
  brand: string;
  thumbnailUrl: string;
  lowestPrice: number;        // lowest price among in-stock variants
  averageRating: number | null;
  reviewCount: number;
  isOutOfStock: boolean;      // true if ALL variants have stock = 0
  hasSecondLife: boolean;     // true if any variant has sourceReturnId
}

export class SearchService {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly variantRepo: IVariantRepository,
    private readonly config: CatalogConfig
  ) {}

  async search(keyword: string, options?: SearchOptions): Promise<SearchResult> {
    // 1. Delegate keyword search to productRepo
    const products = await this.productRepo.searchByKeyword(keyword);

    // 2. Build ProductSearchCards and collect variant conditions for filtering
    const cards: ProductSearchCard[] = [];
    const variantsMap = new Map<string, { condition: Condition }[]>();

    for (const product of products) {
      const variants = await this.variantRepo.findByProductId(product.id);
      if (variants.length === 0) continue;

      variantsMap.set(product.id, variants.map(v => ({ condition: v.condition })));

      const inStockVariants = variants.filter(v => v.stock > 0);
      const allOutOfStock = inStockVariants.length === 0;

      let lowestPrice: number;
      if (allOutOfStock) {
        lowestPrice = Math.min(...variants.map(v => v.price));
      } else {
        lowestPrice = Math.min(...inStockVariants.map(v => v.price));
      }

      const hasSecondLife = variants.some(v => v.sourceReturnId !== undefined);

      cards.push({
        id: product.id,
        title: product.title,
        brand: product.brand,
        thumbnailUrl: product.catalogImageUrl,
        lowestPrice,
        averageRating: product.averageRating ?? null,
        reviewCount: product.reviewCount ?? 0,
        isOutOfStock: allOutOfStock,
        hasSecondLife,
      });
    }

    // 3. Apply filters
    let filtered = this.applyFilters(cards, options?.filters, variantsMap);

    // 4. Apply sort
    filtered = this.applySort(filtered, options?.sort);

    // 5. Pagination
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? this.config.searchPageSize;
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedProducts = filtered.slice(start, end);

    return {
      products: paginatedProducts,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  private applyFilters(
    cards: ProductSearchCard[],
    filters: SearchFilters | undefined,
    variantsMap: Map<string, { condition: Condition }[]>
  ): ProductSearchCard[] {
    if (!filters) return cards;

    let result = cards;

    if (filters.priceMin !== undefined) {
      result = result.filter(card => card.lowestPrice >= filters.priceMin!);
    }

    if (filters.priceMax !== undefined) {
      result = result.filter(card => card.lowestPrice <= filters.priceMax!);
    }

    if (filters.brands && filters.brands.length > 0) {
      const brandsLower = filters.brands.map(b => b.toLowerCase());
      result = result.filter(card => brandsLower.includes(card.brand.toLowerCase()));
    }

    if (filters.minRating !== undefined) {
      result = result.filter(card =>
        card.averageRating !== null && card.averageRating >= filters.minRating!
      );
    }

    if (filters.conditions && filters.conditions.length > 0) {
      const conditionSet = new Set(filters.conditions);
      result = result.filter(card => {
        const variants = variantsMap.get(card.id) ?? [];
        return variants.some(v => conditionSet.has(v.condition));
      });
    }

    return result;
  }

  private applySort(cards: ProductSearchCard[], sort: SortOption | undefined): ProductSearchCard[] {
    const sortOption = sort ?? 'relevance';

    switch (sortOption) {
      case 'relevance':
        // In-stock first, then out-of-stock (stable within each group)
        return [
          ...cards.filter(c => !c.isOutOfStock),
          ...cards.filter(c => c.isOutOfStock),
        ];

      case 'price_asc':
        return [...cards].sort((a, b) => a.lowestPrice - b.lowestPrice);

      case 'price_desc':
        return [...cards].sort((a, b) => b.lowestPrice - a.lowestPrice);

      case 'rating_desc':
        return [...cards].sort((a, b) => {
          // null ratings go last
          if (a.averageRating === null && b.averageRating === null) return 0;
          if (a.averageRating === null) return 1;
          if (b.averageRating === null) return -1;
          return b.averageRating - a.averageRating;
        });

      default:
        return cards;
    }
  }

}
