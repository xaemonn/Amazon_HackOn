import { describe, it, expect } from 'vitest';
import { LocalMediaResolver } from './LocalMediaResolver';

describe('LocalMediaResolver', () => {
  const resolver = new LocalMediaResolver();

  it('maps a simple storage key to /assets/uploads/{key}', () => {
    expect(resolver.resolveUrl('photo-front-001.jpg')).toBe(
      '/assets/uploads/photo-front-001.jpg',
    );
  });

  it('maps a storage key with path separators', () => {
    expect(resolver.resolveUrl('returns/ret-123/front.jpeg')).toBe(
      '/assets/uploads/returns/ret-123/front.jpeg',
    );
  });

  it('maps a storage key with special characters', () => {
    expect(resolver.resolveUrl('item (1) copy.png')).toBe(
      '/assets/uploads/item (1) copy.png',
    );
  });

  it('maps a storage key with unicode characters', () => {
    expect(resolver.resolveUrl('photos/शूज-front.jpg')).toBe(
      '/assets/uploads/photos/शूज-front.jpg',
    );
  });

  it('maps an empty storage key to the base path', () => {
    expect(resolver.resolveUrl('')).toBe('/assets/uploads/');
  });

  it('maps a storage key with query-like characters', () => {
    expect(resolver.resolveUrl('image?size=large&format=webp')).toBe(
      '/assets/uploads/image?size=large&format=webp',
    );
  });
});
