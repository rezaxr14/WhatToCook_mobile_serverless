import { describe, expect, it } from 'vitest';

import { ingredientStorageUrl } from './images';

describe('ingredientStorageUrl', () => {
  it('resolves cached paths through the ingredient-images bucket', () => {
    expect(ingredientStorageUrl('ingredients/garlic-bf4ed0a69fb6ee1f.webp')).toContain(
      '/storage/v1/object/public/ingredient-images/ingredients/garlic-bf4ed0a69fb6ee1f.webp',
    );
  });

  it('passes absolute URLs through unchanged', () => {
    expect(ingredientStorageUrl('https://example.test/garlic.jpg')).toBe(
      'https://example.test/garlic.jpg',
    );
  });

  it('returns null when a row has no cached image', () => {
    expect(ingredientStorageUrl(null)).toBeNull();
    expect(ingredientStorageUrl('')).toBeNull();
  });

  it('strips a legacy /media/ prefix', () => {
    expect(ingredientStorageUrl('/media/ingredients/garlic.jpg')).toContain(
      '/ingredient-images/ingredients/garlic.jpg',
    );
  });
});
