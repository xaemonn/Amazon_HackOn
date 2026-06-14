import { describe, it, expect } from 'vitest';
import { ProductVariant, type ProductVariantProps, type Condition } from './ProductVariant.js';
import type { MediaReference } from '../shared/types.js';

describe('ProductVariant', () => {
  const baseProps: ProductVariantProps = {
    id: 'variant-1',
    productId: 'product-1',
    condition: 'New' as Condition,
    price: 999,
    stock: 5,
  };

  it('exposes all basic props via getters', () => {
    const variant = new ProductVariant(baseProps);

    expect(variant.id).toBe('variant-1');
    expect(variant.productId).toBe('product-1');
    expect(variant.condition).toBe('New');
    expect(variant.price).toBe(999);
    expect(variant.stock).toBe(5);
  });

  it('returns undefined for optional fields when not provided', () => {
    const variant = new ProductVariant(baseProps);

    expect(variant.sourceReturnId).toBeUndefined();
    expect(variant.conditionReport).toBeUndefined();
    expect(variant.unitPhotos).toBeUndefined();
  });

  it('returns optional fields when provided', () => {
    const photos: MediaReference[] = [
      { id: 'p1', type: 'photo_front', storageKey: 'front.jpg', format: 'jpeg', sizeBytes: 1024, capturedAt: new Date() },
    ];
    const variant = new ProductVariant({
      ...baseProps,
      sourceReturnId: 'return-123',
      conditionReport: 'Item is in excellent condition.',
      unitPhotos: photos,
    });

    expect(variant.sourceReturnId).toBe('return-123');
    expect(variant.conditionReport).toBe('Item is in excellent condition.');
    expect(variant.unitPhotos).toHaveLength(1);
    expect(variant.unitPhotos![0].id).toBe('p1');
  });

  describe('isSecondLife', () => {
    it('returns true when sourceReturnId is present', () => {
      const variant = new ProductVariant({ ...baseProps, sourceReturnId: 'ret-1' });
      expect(variant.isSecondLife).toBe(true);
    });

    it('returns false when sourceReturnId is undefined', () => {
      const variant = new ProductVariant(baseProps);
      expect(variant.isSecondLife).toBe(false);
    });
  });

  describe('isInStock', () => {
    it('returns true when stock is greater than zero', () => {
      const variant = new ProductVariant({ ...baseProps, stock: 1 });
      expect(variant.isInStock).toBe(true);
    });

    it('returns false when stock is zero', () => {
      const variant = new ProductVariant({ ...baseProps, stock: 0 });
      expect(variant.isInStock).toBe(false);
    });
  });

  describe('immutability', () => {
    it('freezes props so they cannot be modified externally', () => {
      const variant = new ProductVariant(baseProps);
      const props = variant.toProps();
      props.price = 0;
      // Original variant is unaffected
      expect(variant.price).toBe(999);
    });

    it('unitPhotos getter returns a defensive copy', () => {
      const photos: MediaReference[] = [
        { id: 'p1', type: 'photo_front', storageKey: 'front.jpg', format: 'jpeg', sizeBytes: 1024, capturedAt: new Date() },
      ];
      const variant = new ProductVariant({ ...baseProps, unitPhotos: photos });

      const returned = variant.unitPhotos!;
      returned.push({ id: 'p2', type: 'photo_back', storageKey: 'back.jpg', format: 'jpeg', sizeBytes: 2048, capturedAt: new Date() });

      // Original remains unchanged
      expect(variant.unitPhotos).toHaveLength(1);
    });
  });

  describe('toProps', () => {
    it('returns a shallow copy of the props', () => {
      const variant = new ProductVariant(baseProps);
      const props = variant.toProps();

      expect(props).toEqual(baseProps);
      expect(props).not.toBe(baseProps);
    });
  });

  describe('Condition type', () => {
    it.each<Condition>(['New', 'Certified_Renewed', 'Open_Box', 'Used_Like_New'])(
      'accepts condition "%s"',
      (condition) => {
        const variant = new ProductVariant({ ...baseProps, condition });
        expect(variant.condition).toBe(condition);
      }
    );
  });
});
