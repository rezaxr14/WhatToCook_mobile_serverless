import { describe, expect, it } from 'vitest';

import { filterRecipes } from './filter';
import type { RecipeSummary } from './use-recipes';

function recipe(overrides: Partial<RecipeSummary>): RecipeSummary {
  return {
    id: 1,
    catalogKey: 'test-recipe',
    name: 'Test Recipe',
    description: '',
    cookingTime: 20,
    imageUrl: '',
    baseServings: 4,
    ingredients: [],
    ...overrides,
  };
}

const recipes = [
  recipe({
    id: 1,
    catalogKey: 'chicken-skillet',
    name: 'Tuscan Chicken',
    cookingTime: 25,
    ingredients: [{ id: 1, name: 'Chicken', slug: 'chicken' }],
  }),
  recipe({
    id: 2,
    catalogKey: 'tomato-pasta',
    name: 'Tomato Pasta',
    cookingTime: 12,
    ingredients: [{ id: 2, name: 'Tomato', slug: 'tomato' }],
  }),
  recipe({
    id: 3,
    catalogKey: 'classic-affogato',
    name: 'Affogato',
    cookingTime: 5,
    ingredients: [{ id: 3, name: 'Ice Cream', slug: 'ice-cream' }],
  }),
];

describe('filterRecipes', () => {
  it('returns everything for the all filter without a query', () => {
    expect(filterRecipes(recipes, '', 'all')).toHaveLength(3);
  });

  it('filters by cooking time', () => {
    expect(filterRecipes(recipes, '', 'quick').map((item) => item.id)).toEqual([2, 3]);
  });

  it('excludes meat and fish for vegetarian', () => {
    expect(filterRecipes(recipes, '', 'vegetarian').map((item) => item.id)).toEqual([2, 3]);
  });

  it('matches the sweet catalog keys', () => {
    expect(filterRecipes(recipes, '', 'sweet').map((item) => item.id)).toEqual([3]);
  });

  it('searches names, descriptions and ingredients', () => {
    expect(filterRecipes(recipes, 'tomato', 'all').map((item) => item.id)).toEqual([2]);
    expect(filterRecipes(recipes, 'chicken', 'all').map((item) => item.id)).toEqual([1]);
  });

  it('combines the query with the filter', () => {
    expect(filterRecipes(recipes, 'affogato', 'quick').map((item) => item.id)).toEqual([3]);
    expect(filterRecipes(recipes, 'affogato', 'vegetarian').map((item) => item.id)).toEqual([3]);
  });
});
