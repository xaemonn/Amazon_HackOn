// src/infrastructure/catalog/InMemoryProductRepository.ts

import type { IProductRepository } from '../../domain/catalog/IProductRepository.js';
import type { Product } from '../../domain/catalog/Product.js';

/**
 * In-memory implementation of IProductRepository using Map storage.
 * Suitable for local demo and testing — no external database required.
 *
 * For keyword search against category *names* (not IDs), this implementation
 * maintains an internal category-name lookup populated via `addCategoryMapping`.
 */
export class InMemoryProductRepository implements IProductRepository {
  private readonly _products: Map<string, Product> = new Map();
  private readonly _categoryNames: Map<string, string> = new Map();

  /**
   * Add a product to the in-memory store.
   * Used by SeedDataLoader to populate initial catalog data.
   */
  addProduct(product: Product): void {
    this._products.set(product.id, product);
  }

  /**
   * Register a category ID → name mapping for keyword search.
   * Call this for each category so that `searchByKeyword` can match
   * against human-readable category names rather than opaque IDs.
   */
  addCategoryMapping(categoryId: string, categoryName: string): void {
    this._categoryNames.set(categoryId, categoryName);
  }

  async findById(id: string): Promise<Product | null> {
    return this._products.get(id) ?? null;
  }

  async findByCategory(categoryId: string): Promise<Product[]> {
    const results: Product[] = [];
    for (const product of this._products.values()) {
      if (product.category === categoryId) {
        results.push(product);
      }
    }
    return results;
  }

  /**
   * Case-insensitive substring search across product title, brand, and category name.
   * @param keyword - The search term to match against.
   * @param limit - Maximum number of results to return (default: 50).
   */
  async searchByKeyword(keyword: string, limit: number = 50): Promise<Product[]> {
    const lowerKeyword = keyword.toLowerCase();
    const results: Product[] = [];

    for (const product of this._products.values()) {
      if (results.length >= limit) break;

      const categoryName = this._categoryNames.get(product.category) ?? '';

      const matchesTitle = product.title.toLowerCase().includes(lowerKeyword);
      const matchesBrand = product.brand.toLowerCase().includes(lowerKeyword);
      const matchesCategory = categoryName.toLowerCase().includes(lowerKeyword);

      if (matchesTitle || matchesBrand || matchesCategory) {
        results.push(product);
      }
    }

    return results;
  }

  async findAll(limit: number = 100): Promise<Product[]> {
    const results: Product[] = [];
    for (const product of this._products.values()) {
      if (results.length >= limit) break;
      results.push(product);
    }
    return results;
  }
}
