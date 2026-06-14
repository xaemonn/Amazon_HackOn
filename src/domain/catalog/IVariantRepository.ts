// src/domain/catalog/IVariantRepository.ts

import type { ProductVariant } from './ProductVariant.js';
import type { Condition } from './ProductVariant.js';

export interface IVariantRepository {
  findByProductId(productId: string): Promise<ProductVariant[]>;
  findById(id: string): Promise<ProductVariant | null>;
  save(variant: ProductVariant): Promise<void>;
  findByCondition(condition: Condition): Promise<ProductVariant[]>;
  findBySourceReturnId(sourceReturnId: string): Promise<ProductVariant | null>;
}
