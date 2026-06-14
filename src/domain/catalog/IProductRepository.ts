// src/domain/catalog/IProductRepository.ts

import type { Product } from './Product.js';

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findByCategory(categoryId: string): Promise<Product[]>;
  searchByKeyword(keyword: string, limit?: number): Promise<Product[]>; // default limit: 50
  findAll(limit?: number): Promise<Product[]>; // default limit: 100
}
