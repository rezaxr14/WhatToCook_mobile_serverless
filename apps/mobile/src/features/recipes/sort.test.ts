import { describe, expect, it } from 'vitest';

import { sortRecipes } from './sort';
import type { RecipeSummary } from './use-recipes';

function recipe(id: number, name: string, cookingTime: number | null): RecipeSummary {
  return {
    id,
    catalogKey: `recipe-${id}`,
    name,
    description: '',
    cookingTime,
    imageUrl: '',
    baseServings: 4,
    ingredients: [],
  };
}

const recipes = [
  recipe(1, 'Zucchini Bake', 40),
  recipe(2, 'Avocado Toast', 10),
  recipe(3, 'Mystery Dish', null),
  recipe(4, 'Beet Salad', 10),
];

describe('sortRecipes', () => {
  it('keeps the server order for "recommended"', () => {
    expect(sortRecipes(recipes, 'recommended').map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it('orders by cooking time and puts unknown times last', () => {
    expect(sortRecipes(recipes, 'quickest').map((item) => item.id)).toEqual([2, 4, 1, 3]);
  });

  it('breaks cooking-time ties by name', () => {
    const quickest = sortRecipes(recipes, 'quickest');
    expect(quickest[0].name).toBe('Avocado Toast');
    expect(quickest[1].name).toBe('Beet Salad');
  });

  it('sorts alphabetically by name', () => {
    expect(sortRecipes(recipes, 'name').map((item) => item.name)).toEqual([
      'Avocado Toast',
      'Beet Salad',
      'Mystery Dish',
      'Zucchini Bake',
    ]);
  });

  it('does not mutate the input', () => {
    const before = recipes.map((item) => item.id);
    sortRecipes(recipes, 'name');
    expect(recipes.map((item) => item.id)).toEqual(before);
  });
});
