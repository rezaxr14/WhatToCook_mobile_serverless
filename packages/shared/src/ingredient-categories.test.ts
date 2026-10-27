import { describe, expect, it } from 'vitest';

import { ingredientCategoryKey, INGREDIENT_CATEGORIES } from './ingredient-categories';

describe('ingredientCategoryKey', () => {
  it('maps every stored category to a translation key', () => {
    for (const category of INGREDIENT_CATEGORIES) {
      expect(ingredientCategoryKey(category)).toMatch(/^categories\.[a-zA-Z]+$/);
    }
    expect(ingredientCategoryKey('Meat & Seafood')).toBe('categories.meatSeafood');
    expect(ingredientCategoryKey('dairy & eggs')).toBe('categories.dairyEggs');
  });

  it('maps scanner-only categories', () => {
    expect(ingredientCategoryKey('Condiments')).toBe('categories.condiments');
    expect(ingredientCategoryKey('Bakery')).toBe('categories.bakery');
    expect(ingredientCategoryKey('Beverage')).toBe('categories.beverage');
  });

  it('falls back to other for empty or unknown values', () => {
    expect(ingredientCategoryKey(null)).toBe('categories.other');
    expect(ingredientCategoryKey('')).toBe('categories.other');
    expect(ingredientCategoryKey('Something new')).toBe('categories.other');
  });
});
