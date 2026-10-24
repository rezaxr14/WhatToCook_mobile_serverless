import type { Database } from '@whattocook/shared';
import { ingredientImageUrl, localizeJson } from '@whattocook/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ingredientStorageUrl } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';

type IngredientRow = Database['public']['Tables']['ingredients']['Row'];

export interface PantryItem {
  ingredientId: number;
  name: string;
  category: string;
  calories: number | null;
  slug: string;
  imageUrl: string;
  updatedAt: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  category: string;
  calories: number | null;
}

function mapRow(row: IngredientRow, locale: string): PantryItem {
  return {
    ingredientId: row.id,
    name: localizeJson(row.names, locale) || row.name_en || row.slug,
    category: row.category,
    calories: row.calories_per_100g,
    slug: row.slug,
    imageUrl: ingredientStorageUrl(row.image_path) ?? ingredientImageUrl(row.name_en || row.slug),
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchPantry(userId: string, locale: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select(
      'ingredient_id, updated_at, ingredients(id, slug, names, name_en, category, calories_per_100g, image_path, created_at, updated_at)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ updated_at: string; ingredients: IngredientRow | null }>;
  return rows
    .filter((row): row is { updated_at: string; ingredients: IngredientRow } =>
      Boolean(row.ingredients),
    )
    .map((row) => ({ ...mapRow(row.ingredients, locale), updatedAt: row.updated_at }));
}

export async function searchIngredients(
  query: string,
  locale: string,
): Promise<IngredientOption[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .ilike('name_en', `%${term}%`)
    .order('name_en', { ascending: true })
    .limit(12);

  if (error) throw new Error(error.message);

  return ((data ?? []) as IngredientRow[]).map((row) => ({
    id: row.id,
    name: localizeJson(row.names, locale) || row.name_en || row.slug,
    category: row.category,
    calories: row.calories_per_100g,
  }));
}

export async function addPantryIngredients(userId: string, ingredientIds: number[]): Promise<void> {
  const ids = [...new Set(ingredientIds)].filter((id) => Number.isFinite(id));
  if (ids.length === 0) return;

  const rows = ids.map((ingredientId) => ({
    user_id: userId,
    ingredient_id: ingredientId,
    quantity: null,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('pantry_items')
    .upsert(rows as never, { onConflict: 'user_id,ingredient_id' });
  if (error) throw new Error(error.message);
}

export async function removePantryIngredient(userId: string, ingredientId: number): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .delete()
    .eq('user_id', userId)
    .eq('ingredient_id', ingredientId);
  if (error) throw new Error(error.message);
}

export async function clearPantry(userId: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export function usePantry(userId: string | undefined, locale: string) {
  return useQuery({
    queryKey: ['pantry', userId, locale],
    queryFn: () => fetchPantry(userId as string, locale),
    enabled: Boolean(userId),
  });
}

export function useIngredientSearch(query: string, locale: string) {
  return useQuery({
    queryKey: ['ingredients', query, locale],
    queryFn: () => searchIngredients(query, locale),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useAddPantryIngredients(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ingredientIds: number[]) => addPantryIngredients(userId as string, ingredientIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pantry'] }),
        queryClient.invalidateQueries({ queryKey: ['can-cook'] }),
      ]);
    },
  });
}

export function useRemovePantryIngredient(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ingredientId: number) => removePantryIngredient(userId as string, ingredientId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pantry'] }),
        queryClient.invalidateQueries({ queryKey: ['can-cook'] }),
      ]);
    },
  });
}

export function useClearPantry(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearPantry(userId as string),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pantry'] }),
        queryClient.invalidateQueries({ queryKey: ['can-cook'] }),
      ]);
    },
  });
}
