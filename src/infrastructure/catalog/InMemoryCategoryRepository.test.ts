// src/infrastructure/catalog/InMemoryCategoryRepository.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCategoryRepository } from './InMemoryCategoryRepository.js';
import { Category } from '../../domain/catalog/Category.js';

describe('InMemoryCategoryRepository', () => {
  let repo: InMemoryCategoryRepository;

  beforeEach(() => {
    repo = new InMemoryCategoryRepository();
  });

  describe('findAll', () => {
    it('returns an empty array when no categories exist', async () => {
      const result = await repo.findAll();
      expect(result).toEqual([]);
    });

    it('returns all added categories', async () => {
      const cat1 = new Category({ id: 'cat-1', name: 'Electronics', imageUrl: '/assets/categories/electronics.jpg' });
      const cat2 = new Category({ id: 'cat-2', name: 'Footwear', imageUrl: '/assets/categories/footwear.jpg' });
      const cat3 = new Category({ id: 'cat-3', name: 'Home', imageUrl: '/assets/categories/home.jpg' });

      repo.addCategory(cat1);
      repo.addCategory(cat2);
      repo.addCategory(cat3);

      const result = await repo.findAll();
      expect(result).toHaveLength(3);
      expect(result).toContain(cat1);
      expect(result).toContain(cat2);
      expect(result).toContain(cat3);
    });
  });

  describe('findById', () => {
    it('returns null when category does not exist', async () => {
      const result = await repo.findById('non-existent');
      expect(result).toBeNull();
    });

    it('returns the category when it exists', async () => {
      const cat = new Category({ id: 'cat-1', name: 'Electronics', imageUrl: '/assets/categories/electronics.jpg' });
      repo.addCategory(cat);

      const result = await repo.findById('cat-1');
      expect(result).toBe(cat);
    });

    it('returns the correct category among multiple', async () => {
      const cat1 = new Category({ id: 'cat-1', name: 'Electronics', imageUrl: '/assets/categories/electronics.jpg' });
      const cat2 = new Category({ id: 'cat-2', name: 'Footwear', imageUrl: '/assets/categories/footwear.jpg' });

      repo.addCategory(cat1);
      repo.addCategory(cat2);

      const result = await repo.findById('cat-2');
      expect(result).toBe(cat2);
    });
  });

  describe('addCategory', () => {
    it('stores a category that can be retrieved', async () => {
      const cat = new Category({ id: 'cat-1', name: 'Home', imageUrl: '/assets/categories/home.jpg' });
      repo.addCategory(cat);

      const result = await repo.findById('cat-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('cat-1');
      expect(result!.name).toBe('Home');
      expect(result!.imageUrl).toBe('/assets/categories/home.jpg');
    });

    it('overwrites a category with the same ID', async () => {
      const original = new Category({ id: 'cat-1', name: 'Original', imageUrl: '/assets/original.jpg' });
      const updated = new Category({ id: 'cat-1', name: 'Updated', imageUrl: '/assets/updated.jpg' });

      repo.addCategory(original);
      repo.addCategory(updated);

      const result = await repo.findById('cat-1');
      expect(result!.name).toBe('Updated');

      const all = await repo.findAll();
      expect(all).toHaveLength(1);
    });
  });
});
