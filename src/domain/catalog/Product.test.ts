import { describe, it, expect } from 'vitest';
import { Product, type ProductProps, type FitMetadata } from './Product';

describe('Product', () => {
  const baseProps: ProductProps = {
    id: 'prod-001',
    title: 'Running Shoes',
    brand: 'Adidas',
    catalogImageUrl: '/assets/products/prod-001.jpg',
    category: 'cat-footwear',
    basePrice: 4999,
  };

  it('exposes all properties via getters', () => {
    const product = new Product(baseProps);

    expect(product.id).toBe('prod-001');
    expect(product.title).toBe('Running Shoes');
    expect(product.brand).toBe('Adidas');
    expect(product.catalogImageUrl).toBe('/assets/products/prod-001.jpg');
    expect(product.category).toBe('cat-footwear');
    expect(product.basePrice).toBe(4999);
    expect(product.fitMetadata).toBeUndefined();
  });

  it('exposes fitMetadata when provided', () => {
    const fitMetadata: FitMetadata = {
      sizeOffsetIndicator: 'runs_small',
      offsetMagnitude: 1,
    };
    const product = new Product({ ...baseProps, fitMetadata });

    expect(product.fitMetadata).toEqual(fitMetadata);
  });

  it('returns a copy of props via toProps()', () => {
    const product = new Product(baseProps);
    const props = product.toProps();

    expect(props).toEqual(baseProps);
    // Ensure it's a new object, not the same reference
    expect(props).not.toBe(baseProps);
  });

  it('is immutable — modifying constructor input does not affect the entity', () => {
    const mutableProps = { ...baseProps };
    const product = new Product(mutableProps);

    mutableProps.title = 'Modified Title';

    expect(product.title).toBe('Running Shoes');
  });

  it('is immutable — modifying toProps() output does not affect the entity', () => {
    const product = new Product(baseProps);
    const props = product.toProps();

    (props as any).title = 'Modified Title';

    expect(product.title).toBe('Running Shoes');
  });
});
