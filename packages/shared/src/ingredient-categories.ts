/**
 * Ingredient categories are stored in English in Postgres
 * (`ingredients.category`). Both clients render them through these keys so the
 * label follows the UI locale instead of leaking English into a Persian or
 * Arabic pantry.
 */

const CATEGORY_KEYS = {
  produce: 'produce',
  'dairy & eggs': 'dairyEggs',
  'meat & seafood': 'meatSeafood',
  'grains & pasta': 'grainsPasta',
  'pantry & spices': 'pantrySpices',
  condiments: 'condiments',
  bakery: 'bakery',
  beverage: 'beverage',
  beverages: 'beverage',
  other: 'other',
} as const;

export type IngredientCategoryKey = (typeof CATEGORY_KEYS)[keyof typeof CATEGORY_KEYS];

/** i18next key for a stored category, e.g. `categories.meatSeafood`. */
export function ingredientCategoryKey(category: string | null | undefined): string {
  const key = CATEGORY_KEYS[(category ?? '').trim().toLowerCase() as keyof typeof CATEGORY_KEYS];
  return `categories.${key ?? 'other'}`;
}

/** Categories offered as filters in the pantry picker. */
export const INGREDIENT_CATEGORIES = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Grains & Pasta',
  'Pantry & Spices',
] as const;
