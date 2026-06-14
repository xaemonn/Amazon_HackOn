/**
 * SeedDataLoader — populates in-memory repositories with demo catalog data.
 *
 * Seeds categories, products, and variants synchronously before the app renders.
 * Includes a demo showpiece product with New + Open_Box + Certified_Renewed variants,
 * a footwear product with fitMetadata (runs_small), and products spanning price ranges.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { Product } from '../../domain/catalog/Product.js';
import { ProductVariant } from '../../domain/catalog/ProductVariant.js';
import { Category } from '../../domain/catalog/Category.js';
import type { MediaReference } from '../../domain/shared/types.js';
import type { InMemoryProductRepository } from './InMemoryProductRepository.js';
import type { InMemoryVariantRepository } from './InMemoryVariantRepository.js';
import type { InMemoryCategoryRepository } from './InMemoryCategoryRepository.js';

export class SeedDataLoader {
  /**
   * Synchronously seeds categories, products, and variants into the provided repositories.
   * Must complete before application renders (R7.6).
   */
  load(
    productRepo: InMemoryProductRepository,
    variantRepo: InMemoryVariantRepository,
    categoryRepo: InMemoryCategoryRepository
  ): void {
    // --- Categories (R7.5: at least 3 with unique names and representative images) ---
    const categories = [
      new Category({ id: 'cat-electronics', name: 'Electronics', imageUrl: '/assets/categories/electronics.jpg' }),
      new Category({ id: 'cat-footwear', name: 'Footwear', imageUrl: '/assets/categories/footwear.jpg' }),
      new Category({ id: 'cat-home', name: 'Home', imageUrl: '/assets/categories/home.jpg' }),
    ];

    for (const category of categories) {
      categoryRepo.addCategory(category);
      productRepo.addCategoryMapping(category.id, category.name);
    }

    // --- Products (R7.1: 6+ products, 3+ categories, non-empty title/brand, basePrice > 0, catalogImageUrl) ---
    // --- (R7.4: catalogImageUrl uses /assets/products/{productId}.jpg) ---
    // --- (R7.7: at least 1 with basePrice < 500 and at least 1 with basePrice >= 500) ---

    const products = [
      // Electronics — demo showpiece (R7.2: New + Open_Box + Certified_Renewed)
      new Product({
        id: 'prod-headphones-001',
        title: 'Sony WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        catalogImageUrl: '/assets/products/prod-headphones-001.jpg',
        category: 'cat-electronics',
        basePrice: 29990,
        averageRating: 4.6,
        reviewCount: 2847,
        additionalImages: [
          '/assets/products/prod-headphones-001-side.jpg',
          '/assets/products/prod-headphones-001-case.jpg',
        ],
      }),
      // Electronics — budget product (basePrice < 500 — R7.7)
      new Product({
        id: 'prod-cable-002',
        title: 'USB-C Charging Cable 1m',
        brand: 'AmazonBasics',
        catalogImageUrl: '/assets/products/prod-cable-002.jpg',
        category: 'cat-electronics',
        basePrice: 299,
        averageRating: 4.1,
        reviewCount: 12453,
        additionalImages: [
          '/assets/products/prod-cable-002-detail.jpg',
        ],
      }),
      // Electronics — mid-range
      new Product({
        id: 'prod-speaker-003',
        title: 'JBL Flip 6 Portable Speaker',
        brand: 'JBL',
        catalogImageUrl: '/assets/products/prod-speaker-003.jpg',
        category: 'cat-electronics',
        basePrice: 11999,
        averageRating: 4.4,
        reviewCount: 1892,
        additionalImages: [
          '/assets/products/prod-speaker-003-back.jpg',
          '/assets/products/prod-speaker-003-top.jpg',
        ],
      }),
      // Footwear — runs_small (R7.3)
      new Product({
        id: 'prod-sneakers-004',
        title: 'Adidas Ultraboost 22 Running Shoes',
        brand: 'Adidas',
        catalogImageUrl: '/assets/products/prod-sneakers-004.jpg',
        category: 'cat-footwear',
        basePrice: 16999,
        fitMetadata: { sizeOffsetIndicator: 'runs_small', offsetMagnitude: 1 },
        averageRating: 4.3,
        reviewCount: 956,
        additionalImages: [
          '/assets/products/prod-sneakers-004-sole.jpg',
        ],
      }),
      // Footwear — standard (no ratings — tests "No ratings yet" path)
      new Product({
        id: 'prod-sandals-005',
        title: 'Nike Comfort Slide Sandals',
        brand: 'Nike',
        catalogImageUrl: '/assets/products/prod-sandals-005.jpg',
        category: 'cat-footwear',
        basePrice: 2499,
        // No averageRating/reviewCount → "No ratings yet" on PDP
      }),
      // Home — basePrice >= 500 (R7.7)
      new Product({
        id: 'prod-lamp-006',
        title: 'Philips Smart LED Desk Lamp',
        brand: 'Philips',
        catalogImageUrl: '/assets/products/prod-lamp-006.jpg',
        category: 'cat-home',
        basePrice: 3499,
        averageRating: 4.7,
        reviewCount: 634,
        additionalImages: [
          '/assets/products/prod-lamp-006-lit.jpg',
        ],
      }),
    ];

    for (const product of products) {
      productRepo.addProduct(product);
    }

    // --- Variants ---

    // Helper to generate MediaReference arrays for second-life variants
    const makeUnitPhotos = (variantId: string): MediaReference[] => [
      {
        id: `${variantId}-photo-front`,
        type: 'photo_front',
        storageKey: `returns/${variantId}/front.jpeg`,
        format: 'jpeg',
        sizeBytes: 245000,
        capturedAt: new Date('2025-01-10T10:00:00Z'),
      },
      {
        id: `${variantId}-photo-back`,
        type: 'photo_back',
        storageKey: `returns/${variantId}/back.jpeg`,
        format: 'jpeg',
        sizeBytes: 230000,
        capturedAt: new Date('2025-01-10T10:01:00Z'),
      },
      {
        id: `${variantId}-photo-closeup`,
        type: 'photo_closeup',
        storageKey: `returns/${variantId}/closeup.jpeg`,
        format: 'jpeg',
        sizeBytes: 180000,
        capturedAt: new Date('2025-01-10T10:02:00Z'),
      },
    ];

    const variants = [
      // --- prod-headphones-001: Demo showpiece with 3 condition variants (R7.2) ---
      // New variant: stock >= 1, price >= basePrice
      new ProductVariant({
        id: 'var-headphones-new',
        productId: 'prod-headphones-001',
        condition: 'New',
        price: 29990,
        stock: 10,
      }),
      // Open_Box variant: sourceReturnId, conditionReport, unitPhotos (>=3), stock>=1, price < New
      new ProductVariant({
        id: 'var-headphones-openbox',
        productId: 'prod-headphones-001',
        condition: 'Open_Box',
        price: 23990,
        stock: 2,
        sourceReturnId: 'ret-hpob-001',
        conditionReport: 'Opened but unused. All accessories intact. Original packaging slightly worn.',
        unitPhotos: makeUnitPhotos('var-headphones-openbox'),
      }),
      // Certified_Renewed variant: sourceReturnId, conditionReport, unitPhotos (>=3), stock>=1, price between Open_Box and New
      new ProductVariant({
        id: 'var-headphones-renewed',
        productId: 'prod-headphones-001',
        condition: 'Certified_Renewed',
        price: 25990,
        stock: 3,
        sourceReturnId: 'ret-hpcr-002',
        conditionReport: 'Professionally inspected and certified. Minor cosmetic marks on headband, fully functional.',
        unitPhotos: makeUnitPhotos('var-headphones-renewed'),
      }),

      // --- prod-cable-002: New only ---
      new ProductVariant({
        id: 'var-cable-new',
        productId: 'prod-cable-002',
        condition: 'New',
        price: 299,
        stock: 50,
      }),

      // --- prod-speaker-003: New ---
      new ProductVariant({
        id: 'var-speaker-new',
        productId: 'prod-speaker-003',
        condition: 'New',
        price: 11999,
        stock: 8,
      }),

      // --- prod-sneakers-004: New ---
      new ProductVariant({
        id: 'var-sneakers-new',
        productId: 'prod-sneakers-004',
        condition: 'New',
        price: 16999,
        stock: 15,
      }),

      // --- prod-sandals-005: New ---
      new ProductVariant({
        id: 'var-sandals-new',
        productId: 'prod-sandals-005',
        condition: 'New',
        price: 2499,
        stock: 20,
      }),

      // --- prod-lamp-006: New ---
      new ProductVariant({
        id: 'var-lamp-new',
        productId: 'prod-lamp-006',
        condition: 'New',
        price: 3499,
        stock: 12,
      }),
    ];

    for (const variant of variants) {
      variantRepo.addVariant(variant);
    }
  }
}
