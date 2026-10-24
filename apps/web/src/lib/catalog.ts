import type { Database, Json } from '@whattocook/shared';
import type { Ingredient, RecipeIngredient } from '../types/ingredient';
import type { CanCookResponse, MatchedRecipe, Recipe } from '../types/recipe';
import { recipeImageUrl } from './images';
import { ingredientImageUrl } from './ingredient-images';

type IngredientRow = Database['public']['Tables']['ingredients']['Row'];
type RecipeRow = Database['public']['Tables']['recipes']['Row'];
type RecipeIngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'];

export interface RecipeIngredientJoin extends Omit<RecipeIngredientRow, 'ingredient_id'> {
  ingredient_id?: number;
  ingredients: IngredientRow | null;
}

export interface RecipeWithIngredients extends RecipeRow {
  recipe_ingredients?: RecipeIngredientJoin[] | null;
}

/** Read a localized JSONB field (`{ "en": "...", "tr": "..." }`). */
export function localized(value: Json | null | undefined, locale = 'en'): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const step = (entry as Record<string, Json>).step;
          if (typeof step === 'string') return step;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, Json>;
    const preferred = record[locale];
    if (typeof preferred === 'string' && preferred.trim()) return preferred;
    const english = record.en;
    if (typeof english === 'string' && english.trim()) return english;
    const first = Object.values(record).find((entry) => typeof entry === 'string');
    return typeof first === 'string' ? first : '';
  }
  return '';
}

export function mapIngredient(row: IngredientRow): Ingredient {
  const name = localized(row.names) || row.name_en || row.slug;
  // Photos are looked up by the English/slug name so the same ingredient gets
  // the same thumbnail in every locale.
  const lookupName = row.name_en || row.slug;

  return {
    id: row.id,
    name,
    category: row.category,
    calories_per_100g: row.calories_per_100g,
    image_url: row.image_path ? recipeImageUrl(row.image_path) : ingredientImageUrl(lookupName),
  };
}

export function mapRecipe(row: RecipeWithIngredients, locale = 'en'): Recipe {
  const joins = Array.isArray(row.recipe_ingredients) ? row.recipe_ingredients : [];
  const recipeIngredients: RecipeIngredient[] = joins
    .filter((join): join is RecipeIngredientJoin & { ingredients: IngredientRow } =>
      Boolean(join.ingredients),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((join) => ({
      id: join.id,
      ingredient: mapIngredient(join.ingredients),
      quantity: join.quantity,
      unit: join.unit,
    }));

  return {
    id: row.id,
    name: localized(row.title, locale) || row.title_en || `Recipe ${row.id}`,
    description: localized(row.description, locale),
    cooking_time: row.cooking_time_minutes,
    instructions: localized(row.instructions, locale),
    image: row.image_path,
    image_url: recipeImageUrl(row.image_path),
    ingredients: recipeIngredients.map((entry) => entry.ingredient),
    recipe_ingredients: recipeIngredients,
  };
}

function withImage<T extends Recipe | MatchedRecipe>(recipe: T): T {
  return { ...recipe, image_url: recipe.image_url ?? recipeImageUrl(recipe.image) };
}

export function mapCanCookResponse(value: Json | null): CanCookResponse {
  const payload = (value ?? {}) as unknown as Partial<CanCookResponse>;
  return {
    full_matches: Array.isArray(payload.full_matches)
      ? payload.full_matches.map((recipe) => withImage(recipe))
      : [],
    partial_matches: Array.isArray(payload.partial_matches)
      ? payload.partial_matches.map((recipe) => withImage(recipe))
      : [],
    pantry_ingredient_count: payload.pantry_ingredient_count ?? 0,
    total_full_matches: payload.total_full_matches ?? 0,
    total_partial_matches: payload.total_partial_matches ?? 0,
  };
}
