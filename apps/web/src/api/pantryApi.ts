import type { Database } from '@whattocook/shared';
import i18n from '../i18n';
import { authApi } from './authApi';
import { ApiError, toApiError } from './client';
import { mapIngredient } from '../lib/catalog';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Ingredient, ScanFridgeResponse, ScannedIngredient } from '../types/ingredient';
import type { UserPantry } from '../types/pantry';
import type { User } from '../types/auth';

type IngredientRow = Database['public']['Tables']['ingredients']['Row'];

export interface PantryMutationResponse {
  message: string;
  pantry: UserPantry;
}

async function currentUser(): Promise<User | null> {
  const me = await authApi.getMe();
  return me.authenticated ? me.user : null;
}

async function buildPantry(user: User | null): Promise<UserPantry> {
  const guest: User = { id: 'guest', username: 'Guest', email: '' };
  if (!user) {
    return { id: 'guest', user: guest, ingredients: [], total_ingredients: 0 };
  }

  const { data, error } = await (supabase.from('pantry_items') as any)
    .select(
      'ingredient_id, updated_at, ingredients(id, slug, names, name_en, category, calories_per_100g, image_path, created_at, updated_at)',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw toApiError(error, 'Could not load your pantry.');

  const ingredients = ((data ?? []) as Array<{ ingredients: IngredientRow | null }>)
    .map((row) => (row.ingredients ? mapIngredient(row.ingredients) : null))
    .filter((row): row is Ingredient => row !== null);

  return {
    id: user.id,
    user,
    ingredients,
    total_ingredients: ingredients.length,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

async function imageBase64Payload(
  image: File | string,
): Promise<{ image: string; mime_type: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  let dataUrl: string;
  let declaredType = '';
  if (typeof image === 'string') {
    dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
  } else {
    declaredType = image.type;
    dataUrl = await readFileAsDataUrl(image);
  }

  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new ApiError('Could not read that image. Try a JPG, PNG, or WebP photo.', 400);
  const mime = (declaredType || match[1] || 'image/jpeg').toLowerCase();
  const mime_type = mime === 'image/png' || mime === 'image/webp' ? mime : ('image/jpeg' as const);
  return { image: match[2], mime_type };
}

export const pantryApi = {
  getPantry: async (): Promise<UserPantry> => {
    return buildPantry(await currentUser());
  },

  addIngredient: async (payload: {
    ingredient_id?: number;
    name?: string;
    ingredient_ids?: number[];
  }): Promise<PantryMutationResponse> => {
    const user = await currentUser();
    if (!user) {
      throw new ApiError(
        'Sign in or start the guest demo to edit your pantry.',
        401,
        null,
        'not_authenticated',
      );
    }

    const ids = new Set<number>();
    if (payload.ingredient_id) ids.add(payload.ingredient_id);
    for (const id of payload.ingredient_ids ?? []) ids.add(id);

    if (payload.name?.trim()) {
      const name = payload.name.trim();
      const { data, error } = await supabase
        .from('ingredients')
        .select('id')
        .ilike('name_en', name)
        .limit(1)
        .maybeSingle();
      if (error) throw toApiError(error, 'Could not look up that ingredient.');
      if (!data) {
        throw new ApiError(
          `"${name}" is not in the catalog yet. Pick a nearby ingredient or scan it once AI is connected.`,
          404,
          null,
          'ingredient_not_found',
        );
      }
      ids.add(data.id);
    }

    if (ids.size === 0) {
      throw new ApiError('No ingredient was selected.', 400);
    }

    const rows = [...ids].map((ingredientId) => ({
      user_id: user.id,
      ingredient_id: ingredientId,
      quantity: null,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('pantry_items')
      .upsert(rows, { onConflict: 'user_id,ingredient_id' });
    if (error) throw toApiError(error, 'Could not update your pantry.');

    return {
      message: `Added ${ids.size} ingredient${ids.size === 1 ? '' : 's'}.`,
      pantry: await buildPantry(user),
    };
  },

  removeIngredient: async (ingredientId: number): Promise<PantryMutationResponse> => {
    const user = await currentUser();
    if (!user) {
      throw new ApiError(
        'Sign in or start the guest demo to edit your pantry.',
        401,
        null,
        'not_authenticated',
      );
    }

    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('user_id', user.id)
      .eq('ingredient_id', ingredientId);
    if (error) throw toApiError(error, 'Could not remove that ingredient.');

    return { message: 'Ingredient removed.', pantry: await buildPantry(user) };
  },

  clearPantry: async (): Promise<PantryMutationResponse> => {
    const user = await currentUser();
    if (!user) {
      throw new ApiError(
        'Sign in or start the guest demo to edit your pantry.',
        401,
        null,
        'not_authenticated',
      );
    }

    const { error } = await supabase.from('pantry_items').delete().eq('user_id', user.id);
    if (error) throw toApiError(error, 'Could not clear your pantry.');

    return { message: 'Pantry cleared.', pantry: await buildPantry(user) };
  },

  scanFridgeImage: async (
    image: File | string,
    autoAdd = false,
    provider = 'gemini',
    language?: string,
  ): Promise<ScanFridgeResponse> => {
    if (!isSupabaseConfigured) {
      throw new ApiError(
        'Supabase is not configured. Set apps/web/.env.local first.',
        503,
        null,
        'supabase_not_configured',
      );
    }

    const payload = await imageBase64Payload(image);
    const locale = language ?? i18n.resolvedLanguage ?? i18n.language ?? 'en';
    const { data, error } = await supabase.functions.invoke('scan-pantry', {
      body: {
        image: payload.image,
        mime_type: payload.mime_type,
        min_confidence: 0.45,
        max_items: 25,
        provider,
        language: locale,
        locale,
      },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) {
        throw new ApiError(
          'Start the guest demo or sign in before scanning a fridge photo.',
          401,
          null,
          'not_authenticated',
        );
      }
      if (!status || status === 404 || status === 501) {
        throw new ApiError(
          'Fridge scanning is part of the AI gateway milestone (M4) and is not connected yet.',
          503,
          null,
          'ai_not_ready',
        );
      }
      throw toApiError(error, 'Could not analyse the fridge photo.');
    }

    const response = (data ?? {}) as Partial<ScanFridgeResponse> & {
      items?: ScannedIngredient[];
      detected_ingredients?: ScannedIngredient[];
    };
    const ingredients = response.items ?? response.detected_ingredients ?? [];

    if (autoAdd) {
      const ids = ingredients
        .map((item) => item.ingredient_id)
        .filter((id): id is number => typeof id === 'number' && id > 0);
      if (ids.length > 0) await pantryApi.addIngredient({ ingredient_ids: ids });
    }

    return {
      status: response.status ?? 'done',
      detected_count: response.detected_count ?? ingredients.length,
      matched_count:
        response.matched_count ?? ingredients.filter((item) => item.matched !== false).length,
      detected_ingredients: ingredients,
      items: ingredients,
      auto_added: autoAdd,
      added_ingredients: autoAdd ? ingredients.map((item) => item.display_name || item.name) : [],
    };
  },
};
