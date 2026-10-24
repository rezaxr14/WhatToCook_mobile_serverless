import type { RecipeSummary } from './use-recipes';

export type RecipeSort = 'recommended' | 'quickest' | 'name';

export const RECIPE_SORTS: RecipeSort[] = ['recommended', 'quickest', 'name'];

/**
 * Sort catalog results. `recommended` keeps the server order, `quickest` puts
 * recipes without a cooking time last, and `name` is a locale-aware A–Z.
 */
export function sortRecipes(recipes: RecipeSummary[], sort: RecipeSort): RecipeSummary[] {
  if (sort === 'recommended') return recipes;

  const sorted = [...recipes];

  if (sort === 'quickest') {
    return sorted.sort((a, b) => {
      const left = a.cookingTime ?? Number.POSITIVE_INFINITY;
      const right = b.cookingTime ?? Number.POSITIVE_INFINITY;
      return left === right ? a.name.localeCompare(b.name) : left - right;
    });
  }

  return sorted.sort((a, b) => a.name.localeCompare(b.name));
}
