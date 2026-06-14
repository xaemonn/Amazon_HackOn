// src/infrastructure/catalog/InMemoryCategoryRepository.ts

import type { Category } from '../../domain/catalog/Category.js';
import type { ICategoryRepository } from '../../domain/catalog/ICategoryRepository.js';

/**
 * In-memory implementation of ICategoryRepository.
 * Stores categories in a Map for local/demo usage without external dependencies.
 */
export class InMemoryCategoryRepository implements ICategoryRepository {
  private readonly categories: Map<string, Category> = new Map();

  /**
   * Returns all categories in the repository.
   */
  async findAll(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }

  /**
   * Finds a category by its unique ID.
   * @param id - The category identifier.
   * @returns The matching Category, or null if not found.
   */
  async findById(id: string): Promise<Category | null> {
    return this.categories.get(id) ?? null;
  }

  /**
   * Adds a category to the in-memory store. Used for seed data loading.
   * @param category - The Category entity to store.
   */
  addCategory(category: Category): void {
    this.categories.set(category.id, category);
  }
}
