/**
 * InMemoryVariantRepository — dev/test implementation of IVariantRepository.
 *
 * Stores ProductVariant entities in-memory using a primary Map keyed by variant ID
 * and a secondary index Map keyed by productId for fast lookups.
 * Used for local development and testing; swapped for DynamoDB in production.
 *
 * Requirements: 6.4
 */

import type { IVariantRepository } from '../../domain/catalog/IVariantRepository.js';
import type { ProductVariant, Condition } from '../../domain/catalog/ProductVariant.js';

export class InMemoryVariantRepository implements IVariantRepository {
  /** Primary storage: variantId → ProductVariant */
  private readonly store = new Map<string, ProductVariant>();

  /** Secondary index: productId → variantId[] */
  private readonly productIndex = new Map<string, string[]>();

  /**
   * Add a variant to the repository (used for seed data loading).
   * Stores the variant in the primary map and updates the secondary productId index.
   */
  addVariant(variant: ProductVariant): void {
    this.store.set(variant.id, variant);
    this.updateProductIndex(variant.productId, variant.id);
  }

  /**
   * Persist a new or updated ProductVariant (upsert semantics).
   * Maintains the secondary productId index.
   */
  async save(variant: ProductVariant): Promise<void> {
    this.store.set(variant.id, variant);
    this.updateProductIndex(variant.productId, variant.id);
  }

  /**
   * Retrieve all ProductVariants belonging to a given product.
   */
  async findByProductId(productId: string): Promise<ProductVariant[]> {
    const variantIds = this.productIndex.get(productId);
    if (!variantIds) {
      return [];
    }
    const variants: ProductVariant[] = [];
    for (const id of variantIds) {
      const variant = this.store.get(id);
      if (variant) {
        variants.push(variant);
      }
    }
    return variants;
  }

  /**
   * Retrieve a ProductVariant by its unique identifier.
   * Returns null if not found.
   */
  async findById(id: string): Promise<ProductVariant | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Retrieve all ProductVariants matching a given condition.
   */
  async findByCondition(condition: Condition): Promise<ProductVariant[]> {
    const results: ProductVariant[] = [];
    for (const variant of this.store.values()) {
      if (variant.condition === condition) {
        results.push(variant);
      }
    }
    return results;
  }

  /**
   * Retrieve a ProductVariant by its source return ID.
   * Returns null if no variant with the given sourceReturnId exists.
   */
  async findBySourceReturnId(sourceReturnId: string): Promise<ProductVariant | null> {
    for (const variant of this.store.values()) {
      if (variant.sourceReturnId === sourceReturnId) {
        return variant;
      }
    }
    return null;
  }

  /**
   * Return total number of stored variants.
   * Useful for tests.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all records (useful in tests for teardown).
   */
  clear(): void {
    this.store.clear();
    this.productIndex.clear();
  }

  /**
   * Updates the secondary productId index, ensuring no duplicate entries.
   */
  private updateProductIndex(productId: string, variantId: string): void {
    const existing = this.productIndex.get(productId);
    if (existing) {
      if (!existing.includes(variantId)) {
        existing.push(variantId);
      }
    } else {
      this.productIndex.set(productId, [variantId]);
    }
  }
}
