import { localizeJson, type Json } from '@whattocook/shared';
import { useQuery } from '@tanstack/react-query';

import { recipeImageUrl } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';

export interface MatchedRecipe {
  id: number;
  name: string;
  description: string;
  cookingTime: number | null;
  instructions: string;
  imageUrl: string;
  matchPercentage: number;
  missingCount: number;
  missingIngredients: string[];
  matchedIngredients: string[];
}

export interface CanCookResult {
  full: MatchedRecipe[];
  partial: MatchedRecipe[];
  pantryCount: number;
  totalFull: number;
  totalPartial: number;
}

function mapRecipe(value: unknown, locale: string): MatchedRecipe | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'number' ? row.id : null;
  if (id === null) return null;

  const missing = Array.isArray(row.missing_ingredients)
    ? row.missing_ingredients.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const matched = Array.isArray(row.matched_ingredients)
    ? row.matched_ingredients.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    id,
    name: (typeof row.name === 'string' && row.name) || `Recipe ${id}`,
    description: typeof row.description === 'string' ? row.description : '',
    cookingTime: typeof row.cooking_time === 'number' ? row.cooking_time : null,
    instructions:
      typeof row.instructions === 'string'
        ? row.instructions
        : localizeJson(row.steps as Json | null, locale),
    imageUrl: recipeImageUrl(
      typeof row.image_url === 'string'
        ? row.image_url
        : typeof row.image === 'string'
          ? row.image
          : null,
    ),
    matchPercentage: typeof row.match_percentage === 'number' ? row.match_percentage : 0,
    missingCount: typeof row.missing_count === 'number' ? row.missing_count : missing.length,
    missingIngredients: missing,
    matchedIngredients: matched,
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function fetchCanCook(locale: string): Promise<CanCookResult> {
  const { data, error } = await supabase.rpc('can_cook');
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as Record<string, unknown>;
  const full = asArray(payload.full_matches)
    .map((entry) => mapRecipe(entry, locale))
    .filter((entry): entry is MatchedRecipe => entry !== null);
  const partial = asArray(payload.partial_matches)
    .map((entry) => mapRecipe(entry, locale))
    .filter((entry): entry is MatchedRecipe => entry !== null);

  return {
    full,
    partial,
    pantryCount:
      typeof payload.pantry_ingredient_count === 'number' ? payload.pantry_ingredient_count : 0,
    totalFull: typeof payload.total_full_matches === 'number' ? payload.total_full_matches : full.length,
    totalPartial:
      typeof payload.total_partial_matches === 'number' ? payload.total_partial_matches : partial.length,
  };
}

export function useCanCook(userId: string | undefined, locale: string) {
  return useQuery({
    queryKey: ['can-cook', userId, locale],
    queryFn: () => fetchCanCook(locale),
    enabled: Boolean(userId),
  });
}
