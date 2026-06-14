// Catalog domain module — Product, ProductVariant, Category entities and repository interfaces

export { Product } from './Product.js';
export type { ProductProps, FitMetadata } from './Product.js';

export { ProductVariant } from './ProductVariant.js';
export type { ProductVariantProps, Condition } from './ProductVariant.js';

export { Category } from './Category.js';
export type { CategoryProps } from './Category.js';

export type { IProductRepository } from './IProductRepository.js';
export type { IVariantRepository } from './IVariantRepository.js';
export type { ICategoryRepository } from './ICategoryRepository.js';
