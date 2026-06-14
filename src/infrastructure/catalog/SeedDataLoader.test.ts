import { describe, it, expect, beforeAll } from 'vitest';
import { SeedDataLoader } from './SeedDataLoader';
import { InMemoryProductRepository } from './InMemoryProductRepository';
import { InMemoryVariantRepository } from './InMemoryVariantRepository';
import { InMemoryCategoryRepository } from './InMemoryCategoryRepository';

describe('SeedDataLoader', () => {
  let productRepo: InMemoryProductRepository;
  let variantRepo: InMemoryVariantRepository;
  let categoryRepo: InMemoryCategoryRepository;

  beforeAll(() => {
    productRepo = new InMemoryProductRepository();
    variantRepo = new InMemoryVariantRepository();
    categoryRepo = new InMemoryCategoryRepository();

    const loader = new SeedDataLoader();
    loader.load(productRepo, variantRepo, categoryRepo);
  });

  // R7.5: At least 3 categories
  it('seeds at least 3 categories', async () => {
    const categories = await categoryRepo.findAll();
    expect(categories.length).toBeGreaterThanOrEqual(3);

    for (const cat of categories) {
      expect(cat.name).toBeTruthy();
      expect(cat.imageUrl).toBeTruthy();
    }
  });

  // R7.1: At least 6 products spanning 3+ categories
  it('seeds at least 6 products spanning 3+ categories', async () => {
    const products = await productRepo.findAll();
    expect(products.length).toBeGreaterThanOrEqual(6);

    const categoryIds = new Set(products.map((p) => p.category));
    expect(categoryIds.size).toBeGreaterThanOrEqual(3);

    for (const product of products) {
      expect(product.title).toBeTruthy();
      expect(product.brand).toBeTruthy();
      expect(product.basePrice).toBeGreaterThan(0);
      expect(product.catalogImageUrl).toBeTruthy();
    }
  });

  // R7.2: At least one product with 3 condition variants (New + Open_Box + Certified_Renewed)
  it('seeds at least one product with New, Open_Box, and Certified_Renewed variants', async () => {
    const products = await productRepo.findAll();
    let found = false;

    for (const product of products) {
      const variants = await variantRepo.findByProductId(product.id);
      const conditions = new Set(variants.map((v) => v.condition));

      if (
        conditions.has('New') &&
        conditions.has('Open_Box') &&
        conditions.has('Certified_Renewed')
      ) {
        found = true;

        const newVariant = variants.find((v) => v.condition === 'New')!;
        const openBoxVariant = variants.find((v) => v.condition === 'Open_Box')!;
        const certifiedVariant = variants.find((v) => v.condition === 'Certified_Renewed')!;

        // New: stock >= 1, price >= basePrice
        expect(newVariant.stock).toBeGreaterThanOrEqual(1);
        expect(newVariant.price).toBeGreaterThanOrEqual(product.basePrice);

        // Open_Box: sourceReturnId, conditionReport, unitPhotos (>=3), stock>=1, price < New
        expect(openBoxVariant.stock).toBeGreaterThanOrEqual(1);
        expect(openBoxVariant.price).toBeLessThan(newVariant.price);
        expect(openBoxVariant.sourceReturnId).toBeTruthy();
        expect(openBoxVariant.conditionReport).toBeTruthy();
        expect(openBoxVariant.unitPhotos).toBeDefined();
        expect(openBoxVariant.unitPhotos!.length).toBeGreaterThanOrEqual(3);

        // Certified_Renewed: sourceReturnId, conditionReport, unitPhotos (>=3), stock>=1, price between Open_Box and New
        expect(certifiedVariant.stock).toBeGreaterThanOrEqual(1);
        expect(certifiedVariant.price).toBeGreaterThan(openBoxVariant.price);
        expect(certifiedVariant.price).toBeLessThan(newVariant.price);
        expect(certifiedVariant.sourceReturnId).toBeTruthy();
        expect(certifiedVariant.conditionReport).toBeTruthy();
        expect(certifiedVariant.unitPhotos).toBeDefined();
        expect(certifiedVariant.unitPhotos!.length).toBeGreaterThanOrEqual(3);

        break;
      }
    }

    expect(found).toBe(true);
  });

  // R7.3: At least one footwear product with fitMetadata containing sizeOffsetIndicator: 'runs_small'
  it('seeds a footwear product with fitMetadata runs_small', async () => {
    const products = await productRepo.findAll();
    const footwearWithFit = products.find(
      (p) =>
        p.category === 'cat-footwear' &&
        p.fitMetadata?.sizeOffsetIndicator === 'runs_small'
    );

    expect(footwearWithFit).toBeDefined();
    expect(footwearWithFit!.fitMetadata!.offsetMagnitude).toBeGreaterThan(0);
  });

  // R7.7: At least one product with basePrice < 500 and at least one with basePrice >= 500
  it('seeds products below and above ₹500 threshold', async () => {
    const products = await productRepo.findAll();

    const belowThreshold = products.find((p) => p.basePrice < 500);
    const aboveThreshold = products.find((p) => p.basePrice >= 500);

    expect(belowThreshold).toBeDefined();
    expect(aboveThreshold).toBeDefined();
  });

  // R7.4: catalogImageUrl uses /assets/products/{productId}.jpg pattern
  it('seeds products with correct catalogImageUrl pattern', async () => {
    const products = await productRepo.findAll();

    for (const product of products) {
      expect(product.catalogImageUrl).toBe(`/assets/products/${product.id}.jpg`);
    }
  });

  // Verify variants are properly loaded (basic count check)
  it('seeds at least one variant per product', async () => {
    const products = await productRepo.findAll();

    for (const product of products) {
      const variants = await variantRepo.findByProductId(product.id);
      expect(variants.length).toBeGreaterThanOrEqual(1);
    }
  });
});
