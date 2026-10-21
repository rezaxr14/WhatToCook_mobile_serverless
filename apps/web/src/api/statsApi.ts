import { supabase } from '../lib/supabase';

export interface PlatformStats {
  total_recipes: number;
  total_ingredients: number;
  total_users: number;
}

export const statsApi = {
  getPlatformStats: async (): Promise<PlatformStats> => {
    const [recipes, ingredients] = await Promise.all([
      supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase.from('ingredients').select('id', { count: 'exact', head: true }),
    ]);

    return {
      total_recipes: recipes.count ?? 0,
      total_ingredients: ingredients.count ?? 0,
      // Profiles are private under RLS; no client-side aggregate is exposed.
      total_users: 0,
    };
  },
};
