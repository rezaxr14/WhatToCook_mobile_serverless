import { localizeJson, type Database, type Json } from '@whattocook/shared';
import { useQuery } from '@tanstack/react-query';

import { recipeImageUrl } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';

type IngredientRow = Database['public']['Tables']['ingredients']['Row'];
type RecipeRow = Database['public']['Tables']['recipes']['Row'];
type RecipeIngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'];

interface RecipeIngredientJoin extends RecipeIngredientRow {
  ingredients: IngredientRow | null;
}

interface RecipeRowWithIngredients extends RecipeRow {
  recipe_ingredients?: RecipeIngredientJoin[] | null;
}

export interface RecipeIngredientSummary {
  id: number;
  name: string;
  slug: string;
}

export interface RecipeSummary {
  id: number;
  catalogKey: string;
  name: string;
  description: string;
  cookingTime: number | null;
  imageUrl: string;
  baseServings: number;
  ingredients: RecipeIngredientSummary[];
}

export interface RecipeIngredientDetail extends RecipeIngredientSummary {
  recipeIngredientId: number;
  ingredientId: number;
  category: string;
  quantity: string;
  unit: string;
  optional: boolean;
}

export interface RecipeDetail extends Omit<RecipeSummary, 'ingredients'> {
  instructions: string[];
  recipeIngredients: RecipeIngredientDetail[];
}

export const RECIPE_SELECT = `
  id,
  catalog_key,
  title,
  title_en,
  description,
  instructions,
  cooking_time_minutes,
  image_path,
  servings,
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

function ingredientName(row: IngredientRow, locale: string): string {
  return localizeJson(row.names, locale) || row.name_en || row.slug;
}

type JoinedIngredientRow = RecipeIngredientJoin & { ingredients: IngredientRow };

function sortedJoins(row: RecipeRowWithIngredients): JoinedIngredientRow[] {
  const joins = Array.isArray(row.recipe_ingredients) ? row.recipe_ingredients : [];
  return joins
    .filter((join): join is JoinedIngredientRow => Boolean(join.ingredients))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function mapSummary(row: RecipeRowWithIngredients, locale: string): RecipeSummary {
  return {
    id: row.id,
    catalogKey: row.catalog_key ?? '',
    name: localizeJson(row.title, locale) || row.title_en || `Recipe ${row.id}`,
    description: localizeJson(row.description, locale),
    cookingTime: row.cooking_time_minutes,
    imageUrl: recipeImageUrl(row.image_path),
    baseServings: row.servings && row.servings > 0 ? row.servings : 4,
    ingredients: sortedJoins(row).map((join) => ({
      id: join.ingredients.id,
      name: ingredientName(join.ingredients, locale),
      slug: join.ingredients.slug,
    })),
  };
}

export function parseInstructions(value: Json | null | undefined, locale: string): string[] {
  return localizeJson(value, locale)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean);
}

function mapDetail(row: RecipeRowWithIngredients, locale: string): RecipeDetail {
  const summary = mapSummary(row, locale);
  return {
    ...summary,
    instructions: parseInstructions(row.instructions, locale),
    recipeIngredients: sortedJoins(row).map((join) => ({
      id: join.ingredients.id,
      recipeIngredientId: join.id,
      ingredientId: join.ingredient_id,
      name: ingredientName(join.ingredients, locale),
      slug: join.ingredients.slug,
      category: join.ingredients.category,
      quantity: join.quantity,
      unit: join.unit,
      optional: join.optional,
    })),
  };
}

export async function fetchRecipes(locale: string): Promise<RecipeSummary[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_SELECT)
    .is('deleted_at', null)
    .order('title_en', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RecipeRowWithIngredients[]).map((row) =>
    mapSummary(row, locale),
  );
}

export async function fetchRecipe(id: number, locale: string): Promise<RecipeDetail> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Recipe not found');
  return mapDetail(data as unknown as RecipeRowWithIngredients, locale);
}

export function useRecipes(locale: string) {
  return useQuery({
    queryKey: ['recipes', locale],
    queryFn: () => fetchRecipes(locale),
    staleTime: 10 * 60_000,
  });
}

export function useRecipe(id: number | undefined, locale: string) {
  return useQuery({
    queryKey: ['recipe', id, locale],
    queryFn: () => fetchRecipe(id as number, locale),
    enabled: Boolean(id),
    staleTime: 10 * 60_000,
  });
}
