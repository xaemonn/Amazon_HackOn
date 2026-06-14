// src/domain/catalog/ICategoryRepository.ts

import type { Category } from './Category.js';

/**
 * Repository interface for Category aggregate persistence.
 */
export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
}
