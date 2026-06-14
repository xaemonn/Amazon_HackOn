import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryProductRepository } from './InMemoryProductRepository';
import { Product } from '../../domain/catalog/Product';

describe('InMemoryProductRepository', () => {
  let repo: InMemoryProductRepository;

  const makeProduct = (overrides: Partial<ConstructorParameters<typeof Product>[0]> = {}) =>
    new Product({
      id: 'prod-001',
      title: 'Running Shoes',
      brand: 'Adidas',
      catalogImageUrl: '/assets/products/prod-001.jpg',
      category: 'cat-footwear',
      basePrice: 4999,
      ...overrides,
    });

  beforeEach(() => {
    repo = new InMemoryProductRepository();
  });

  describe('addProduct / findById', () => {
    it('stores and retrieves a product by ID', async () => {
      const product = makeProduct();
      repo.addProduct(product);

      const found = await repo.findById('prod-001');
      expect(found).toBe(product);
    });

    it('returns null for a non-existent ID', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByCategory', () => {
    it('returns products matching the given category ID', async () => {
      repo.addProduct(makeProduct({ id: 'p1', category: 'cat-footwear' }));
      repo.addProduct(makeProduct({ id: 'p2', category: 'cat-electronics' }));
      repo.addProduct(makeProduct({ id: 'p3', category: 'cat-footwear' }));

      const results = await repo.findByCategory('cat-footwear');
      expect(results).toHaveLength(2);
      expect(results.map((p) => p.id)).toEqual(['p1', 'p3']);
    });

    it('returns an empty array when no products match', async () => {
      repo.addProduct(makeProduct({ id: 'p1', category: 'cat-footwear' }));

      const results = await repo.findByCategory('cat-home');
      expect(results).toEqual([]);
    });
  });

  describe('searchByKeyword', () => {
    beforeEach(() => {
      repo.addCategoryMapping('cat-footwear', 'Footwear');
      repo.addCategoryMapping('cat-electronics', 'Electronics');

      repo.addProduct(makeProduct({ id: 'p1', title: 'Running Shoes', brand: 'Adidas', category: 'cat-footwear' }));
      repo.addProduct(makeProduct({ id: 'p2', title: 'Wireless Earbuds', brand: 'Sony', category: 'cat-electronics' }));
      repo.addProduct(makeProduct({ id: 'p3', title: 'Trail Running Jacket', brand: 'Nike', category: 'cat-footwear' }));
    });

    it('matches on title (case-insensitive)', async () => {
      const results = await repo.searchByKeyword('running');
      expect(results.map((p) => p.id)).toEqual(['p1', 'p3']);
    });

    it('matches on brand (case-insensitive)', async () => {
      const results = await repo.searchByKeyword('SONY');
      expect(results.map((p) => p.id)).toEqual(['p2']);
    });

    it('matches on category name (case-insensitive)', async () => {
      const results = await repo.searchByKeyword('electronics');
      expect(results.map((p) => p.id)).toEqual(['p2']);
    });

    it('performs substring matching', async () => {
      // 'ear' matches 'Earbuds' (title of p2) and 'Footwear' (category name for p1, p3)
      const results = await repo.searchByKeyword('ear');
      expect(results.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('performs substring matching on title only', async () => {
      const results = await repo.searchByKeyword('wireless');
      expect(results.map((p) => p.id)).toEqual(['p2']);
    });

    it('returns empty array when no match', async () => {
      const results = await repo.searchByKeyword('tablet');
      expect(results).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      const results = await repo.searchByKeyword('running', 1);
      expect(results).toHaveLength(1);
    });

    it('uses default limit of 50', async () => {
      // Add many products to verify default limit behavior
      for (let i = 0; i < 60; i++) {
        repo.addProduct(makeProduct({ id: `bulk-${i}`, title: `Shoe Model ${i}` }));
      }

      const results = await repo.searchByKeyword('shoe');
      // Original 'p1' has "Shoes" in title + 60 bulk products with "Shoe" = 61 total matches
      // But default limit is 50
      expect(results).toHaveLength(50);
    });

    it('does not match when category mapping is missing', async () => {
      // Add product with unmapped category
      repo.addProduct(makeProduct({ id: 'p4', title: 'Blender', brand: 'Philips', category: 'cat-kitchen' }));

      // Search for 'kitchen' — no mapping registered, so it won't match on category
      const results = await repo.searchByKeyword('kitchen');
      expect(results).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('returns all products up to the default limit', async () => {
      repo.addProduct(makeProduct({ id: 'p1' }));
      repo.addProduct(makeProduct({ id: 'p2' }));
      repo.addProduct(makeProduct({ id: 'p3' }));

      const results = await repo.findAll();
      expect(results).toHaveLength(3);
    });

    it('respects a custom limit', async () => {
      repo.addProduct(makeProduct({ id: 'p1' }));
      repo.addProduct(makeProduct({ id: 'p2' }));
      repo.addProduct(makeProduct({ id: 'p3' }));

      const results = await repo.findAll(2);
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no products exist', async () => {
      const results = await repo.findAll();
      expect(results).toEqual([]);
    });
  });
});
