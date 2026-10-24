import { describe, expect, it } from 'vitest';

import { DEFAULT_INGREDIENT_IMAGE, ingredientImageUrl } from './ingredient-images';

describe('ingredientImageUrl', () => {
  it('maps a plain catalog name', () => {
    expect(ingredientImageUrl('garlic')).toContain('photo-1540148426945');
  });

  it('prefers the most specific key', () => {
    expect(ingredientImageUrl('Fresh Basil')).toContain('photo-1620706857370');
    expect(ingredientImageUrl('basil')).toContain('photo-1683403504056');
  });

  it('matches compound and noisy names', () => {
    expect(ingredientImageUrl('boneless chicken breast')).toContain('photo-1682991136736');
    expect(ingredientImageUrl('extra virgin olive oil')).toContain('photo-1543083477');
  });

  it('normalizes slugs with hyphens', () => {
    expect(ingredientImageUrl('bell-pepper')).toContain('photo-1563565375');
  });

  it('does not depend on the display locale', () => {
    expect(ingredientImageUrl('Garlic')).toBe(ingredientImageUrl('garlic'));
  });

  it('falls back for unknown or empty names', () => {
    expect(ingredientImageUrl('dragon fruit')).toBe(DEFAULT_INGREDIENT_IMAGE);
    expect(ingredientImageUrl('')).toBe(DEFAULT_INGREDIENT_IMAGE);
    expect(ingredientImageUrl(null)).toBe(DEFAULT_INGREDIENT_IMAGE);
  });
});
