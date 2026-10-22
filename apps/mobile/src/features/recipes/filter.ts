import type { RecipeSummary } from './use-recipes';

export type RecipeFilter = 'all' | 'quick' | 'vegetarian' | 'sweet';

export const RECIPE_FILTERS: RecipeFilter[] = ['all', 'quick', 'vegetarian', 'sweet'];

/** Ingredient slugs that disqualify a recipe from the vegetarian filter. */
const MEAT_AND_FISH = new Set([
  'anchovy',
  'bacon',
  'beef',
  'chicken',
  'fish',
  'ham',
  'lamb',
  'pork',
  'salmon',
  'sausage',
  'shrimp',
  'tuna',
  'turkey',
]);

/** Catalog keys for the dessert recipes in the seed catalog. */
const SWEET_KEYS = /affogato|crepe|pancake/;

export function filterRecipes(
  recipes: RecipeSummary[],
  query: string,
  filter: RecipeFilter,
): RecipeSummary[] {
  const term = query.trim().toLowerCase();

  return recipes.filter((recipe) => {
    if (filter === 'quick' && !(recipe.cookingTime != null && recipe.cookingTime <= 20)) {
      return false;
    }
    if (filter === 'vegetarian' && recipe.ingredients.some((item) => MEAT_AND_FISH.has(item.slug))) {
      return false;
    }
    if (filter === 'sweet' && !SWEET_KEYS.test(recipe.catalogKey)) {
      return false;
    }
    if (!term) return true;

    return [recipe.name, recipe.description, ...recipe.ingredients.flatMap((item) => [item.name, item.slug])]
      .join(' ')
      .toLowerCase()
      .includes(term);
  });
}
