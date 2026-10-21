import i18n from '../i18n';
import { supabase } from '../lib/supabase';
import {
  mapCanCookResponse,
  mapIngredient,
  mapRecipe,
  type RecipeWithIngredients,
} from '../lib/catalog';
import { toApiError } from './client';
import type { CanCookResponse, Recipe } from '../types/recipe';
import type { Ingredient } from '../types/ingredient';

/**
 * Catalog reads go straight to PostgREST under RLS. The shape is normalized to
 * the reference UI's camel/snake-compatible types so the ported pages did not
 * need to be rewritten.
 */
const RECIPE_SELECT = `
  id,
  title,
  description,
  instructions,
  cooking_time_minutes,
  image_path,
  recipe_ingredients (
    id,
    recipe_id,
    ingredient_id,
    quantity,
    unit,
    optional,
    sort_order,
    created_at,
    ingredients (
      id,
      slug,
      names,
      name_en,
      category,
      calories_per_100g,
      image_path,
      created_at,
      updated_at
    )
  )
`;

function locale(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

export const recipeApi = {
  getAllRecipes: async (): Promise<Recipe[]> => {
    const { data, error } = await (supabase.from('recipes') as any)
      .select(RECIPE_SELECT)
      .is('deleted_at', null)
      .order('title_en', { ascending: true });

    if (error) throw toApiError(error, 'Could not load recipes.');
    return (data as RecipeWithIngredients[]).map((row) => mapRecipe(row, locale()));
  },

  getRecipeById: async (id: number) => {
    const { data, error } = await (supabase.from('recipes') as any)
      .select(RECIPE_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) throw toApiError(error, 'Could not load that recipe.');
    return mapRecipe(data as RecipeWithIngredients, locale());
  },

  getAllIngredients: async (): Promise<Ingredient[]> => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name_en', { ascending: true });

    if (error) throw toApiError(error, 'Could not load ingredients.');
    return (data ?? []).map(mapIngredient);
  },

  getCanCookRecipes: async (): Promise<CanCookResponse> => {
    const { data, error } = await supabase.rpc('can_cook');
    if (error) throw toApiError(error, 'Could not match your pantry.');
    return mapCanCookResponse(data);
  },
};
