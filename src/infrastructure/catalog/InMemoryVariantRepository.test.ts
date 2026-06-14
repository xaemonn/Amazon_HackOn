import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVariantRepository } from './InMemoryVariantRepository.js';
import { ProductVariant } from '../../domain/catalog/ProductVariant.js';

function createVariant(overrides: Partial<{
  id: string;
  productId: string;
  condition: 'New' | 'Certified_Renewed' | 'Open_Box' | 'Used_Like_New';
  price: number;
  stock: number;
  sourceReturnId: string;
  conditionReport: string;
}> = {}): ProductVariant {
  return new ProductVariant({
    id: overrides.id ?? 'variant-1',
    productId: overrides.productId ?? 'product-1',
    condition: overrides.condition ?? 'New',
    price: overrides.price ?? 999,
    stock: overrides.stock ?? 5,
    sourceReturnId: overrides.sourceReturnId,
    conditionReport: overrides.conditionReport,
  });
}

describe('InMemoryVariantRepository', () => {
  let repo: InMemoryVariantRepository;

  beforeEach(() => {
    repo = new InMemoryVariantRepository();
  });

  describe('addVariant', () => {
    it('should store a variant in primary storage', () => {
      const variant = createVariant();
      repo.addVariant(variant);
      expect(repo.size).toBe(1);
    });

    it('should update the productId secondary index', async () => {
      const variant = createVariant({ id: 'v1', productId: 'p1' });
      repo.addVariant(variant);

      const results = await repo.findByProductId('p1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v1');
    });

    it('should handle multiple variants for the same product', async () => {
      repo.addVariant(createVariant({ id: 'v1', productId: 'p1', condition: 'New' }));
      repo.addVariant(createVariant({ id: 'v2', productId: 'p1', condition: 'Open_Box' }));

      const results = await repo.findByProductId('p1');
      expect(results).toHaveLength(2);
    });

    it('should not duplicate index entries when adding the same variant ID twice', async () => {
      const variant = createVariant({ id: 'v1', productId: 'p1' });
      repo.addVariant(variant);
      repo.addVariant(variant);

      const results = await repo.findByProductId('p1');
      expect(results).toHaveLength(1);
      expect(repo.size).toBe(1);
    });
  });

  describe('save', () => {
    it('should persist a variant', async () => {
      const variant = createVariant({ id: 'v1' });
      await repo.save(variant);
      expect(repo.size).toBe(1);
    });

    it('should update the productId index', async () => {
      const variant = createVariant({ id: 'v1', productId: 'p1' });
      await repo.save(variant);

      const results = await repo.findByProductId('p1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v1');
    });

    it('should overwrite an existing variant with the same ID', async () => {
      await repo.save(createVariant({ id: 'v1', price: 100 }));
      await repo.save(createVariant({ id: 'v1', price: 200 }));

      expect(repo.size).toBe(1);
      const found = await repo.findById('v1');
      expect(found?.price).toBe(200);
    });
  });

  describe('findById', () => {
    it('should return the variant when it exists', async () => {
      repo.addVariant(createVariant({ id: 'v1', price: 499 }));

      const found = await repo.findById('v1');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('v1');
      expect(found!.price).toBe(499);
    });

    it('should return null when variant does not exist', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByProductId', () => {
    it('should return all variants for a product', async () => {
      repo.addVariant(createVariant({ id: 'v1', productId: 'p1' }));
      repo.addVariant(createVariant({ id: 'v2', productId: 'p1' }));
      repo.addVariant(createVariant({ id: 'v3', productId: 'p2' }));

      const results = await repo.findByProductId('p1');
      expect(results).toHaveLength(2);
      expect(results.map(v => v.id).sort()).toEqual(['v1', 'v2']);
    });

    it('should return empty array for unknown productId', async () => {
      const results = await repo.findByProductId('unknown');
      expect(results).toEqual([]);
    });
  });

  describe('findByCondition', () => {
    it('should return all variants matching the condition', async () => {
      repo.addVariant(createVariant({ id: 'v1', condition: 'New' }));
      repo.addVariant(createVariant({ id: 'v2', condition: 'Open_Box' }));
      repo.addVariant(createVariant({ id: 'v3', condition: 'New' }));

      const results = await repo.findByCondition('New');
      expect(results).toHaveLength(2);
      expect(results.every(v => v.condition === 'New')).toBe(true);
    });

    it('should return empty array when no variants match', async () => {
      repo.addVariant(createVariant({ id: 'v1', condition: 'New' }));

      const results = await repo.findByCondition('Used_Like_New');
      expect(results).toEqual([]);
    });
  });

  describe('findBySourceReturnId', () => {
    it('should return the variant with matching sourceReturnId', async () => {
      repo.addVariant(createVariant({ id: 'v1', sourceReturnId: 'return-123' }));
      repo.addVariant(createVariant({ id: 'v2' }));

      const found = await repo.findBySourceReturnId('return-123');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('v1');
      expect(found!.sourceReturnId).toBe('return-123');
    });

    it('should return null when no variant has the sourceReturnId', async () => {
      repo.addVariant(createVariant({ id: 'v1' }));

      const found = await repo.findBySourceReturnId('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all variants and reset the index', async () => {
      repo.addVariant(createVariant({ id: 'v1', productId: 'p1' }));
      repo.addVariant(createVariant({ id: 'v2', productId: 'p1' }));

      repo.clear();

      expect(repo.size).toBe(0);
      const results = await repo.findByProductId('p1');
      expect(results).toEqual([]);
    });
  });
});
