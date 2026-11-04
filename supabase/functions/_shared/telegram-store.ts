import type { DbClient } from './db.ts';
import type { PlanInfo, ProfileInfo } from './types.ts';

export interface TelegramProfile {
  profile: ProfileInfo;
  plan: PlanInfo;
}

export interface TelegramStore {
  consumeLinkCode(code: string, chatId: number, username: string): Promise<TelegramProfile | null>;
  findByChat(chatId: number): Promise<TelegramProfile | null>;
  pantryNames(userId: string): Promise<string[]>;
  addIngredient(userId: string, name: string): Promise<string>;
  removeIngredient(userId: string, name: string): Promise<string | null>;
  consumeMessage(chatId: number, limit: number, windowSeconds: number): Promise<boolean>;
}

interface ProfileRow {
  id: string;
  username: string;
  locale: string;
  plan_id: string;
}

interface PlanRow {
  id: string;
  features: Record<string, number>;
  monthly_budget_micro_usd: number;
  max_image_bytes: number;
}

interface PantryRow {
  ingredients: { names: Record<string, string> } | null;
}

interface IngredientRow {
  id: number;
  names: Record<string, string>;
}

const CATEGORY = 'Other';

export function createTelegramStore(db: DbClient): TelegramStore {
  async function loadPlan(planId: string): Promise<PlanInfo> {
    const { data, error } = await db
      .from('plans')
      .select('id, features, monthly_budget_micro_usd, max_image_bytes')
      .eq('id', planId)
      .maybeSingle();
    if (error) throw new Error(`telegram plan lookup failed: ${error.message}`);
    const row = data as PlanRow | null;
    if (!row) throw new Error('telegram linked profile has no plan');
    return {
      id: row.id,
      features: row.features ?? {},
      monthly_budget_micro_usd: Number(row.monthly_budget_micro_usd ?? 0),
      max_image_bytes: Number(row.max_image_bytes ?? 0),
    };
  }

  async function pack(row: ProfileRow): Promise<TelegramProfile> {
    return {
      profile: { id: row.id, username: row.username, locale: row.locale, plan_id: row.plan_id },
      plan: await loadPlan(row.plan_id),
    };
  }

  async function profileById(userId: string): Promise<TelegramProfile | null> {
    const { data, error } = await db
      .from('profiles')
      .select('id, username, locale, plan_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(`telegram profile lookup failed: ${error.message}`);
    const row = data as ProfileRow | null;
    return row ? pack(row) : null;
  }

  async function findIngredient(name: string): Promise<IngredientRow | null> {
    const { data, error } = await db
      .from('ingredients')
      .select('id, names')
      .ilike('name_en', name)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`telegram ingredient lookup failed: ${error.message}`);
    return (data as IngredientRow | null) ?? null;
  }

  async function createIngredient(name: string): Promise<IngredientRow> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'custom';
    for (let suffix = 1; suffix < 50; suffix += 1) {
      const slug = suffix === 1 ? base : `${base}-${suffix}`;
      const { data, error } = await db
        .from('ingredients')
        .insert({ slug, names: { en: name }, category: CATEGORY })
        .select('id, names')
        .maybeSingle();
      if (!error && data) return data as IngredientRow;
      if (error && error.code !== '23505') {
        throw new Error(`telegram ingredient insert failed: ${error.message}`);
      }
    }
    throw new Error('telegram could not allocate an ingredient slug');
  }

  return {
    async consumeLinkCode(code, chatId, username) {
      const { data, error } = await db.rpc('consume_telegram_link_code', {
        p_code: code,
        p_chat_id: chatId,
        p_username: username,
      });
      if (error) throw new Error(`telegram link failed: ${error.message}`);
      const userId = typeof data === 'string' ? data : null;
      return userId ? profileById(userId) : null;
    },

    async findByChat(chatId) {
      const { data, error } = await db
        .from('profiles')
        .select('id, username, locale, plan_id')
        .eq('telegram_chat_id', chatId)
        .maybeSingle();
      if (error) throw new Error(`telegram chat lookup failed: ${error.message}`);
      const row = data as ProfileRow | null;
      return row ? pack(row) : null;
    },

    async pantryNames(userId) {
      const { data, error } = await db
        .from('pantry_items')
        .select('ingredients(names)')
        .eq('user_id', userId)
        .is('deleted_at', null);
      if (error) throw new Error(`telegram pantry lookup failed: ${error.message}`);
      return ((data ?? []) as PantryRow[])
        .map((row) => row.ingredients?.names?.en ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    },

    async addIngredient(userId, name) {
      const ingredient = (await findIngredient(name)) ?? (await createIngredient(name));
      const { error } = await db.from('pantry_items').upsert(
        {
          user_id: userId,
          ingredient_id: ingredient.id,
          quantity: null,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,ingredient_id' },
      );
      if (error) throw new Error(`telegram pantry insert failed: ${error.message}`);
      return ingredient.names?.en ?? name;
    },

    async removeIngredient(userId, name) {
      const ingredient = await findIngredient(name);
      if (!ingredient) return null;
      const { data, error } = await db
        .from('pantry_items')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('ingredient_id', ingredient.id)
        .is('deleted_at', null)
        .select('id');
      if (error) throw new Error(`telegram pantry delete failed: ${error.message}`);
      return (data as unknown[] | null)?.length ? ingredient.names?.en ?? name : null;
    },

    async consumeMessage(chatId, limit, windowSeconds) {
      const { data, error } = await db.rpc('consume_telegram_message', {
        p_chat_id: chatId,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error(`telegram rate limit failed: ${error.message}`);
      return data === true;
    },
  };
}
