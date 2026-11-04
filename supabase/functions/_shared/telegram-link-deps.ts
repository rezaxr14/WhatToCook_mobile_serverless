import { authenticate } from './auth.ts';
import { parseAllowedOrigins } from './cors.ts';
import type { DbClient } from './db.ts';
import { createServiceClient, readSupabaseEnv } from './supabase.ts';
import type { TelegramLinkDeps, TelegramLinkStore } from './telegram-link.ts';

const DEFAULT_BOT_USERNAME = 'WhatToCookChefBot';

export function createTelegramLinkDeps(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): TelegramLinkDeps {
  const supabaseEnv = readSupabaseEnv(env);
  const service = createServiceClient(supabaseEnv);
  const db = service as unknown as DbClient;

  const store: TelegramLinkStore = {
    async existingLink(userId) {
      const { data, error } = await db
        .from('profiles')
        .select('telegram_chat_id, telegram_username')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(`telegram link lookup failed: ${error.message}`);
      const row = data as
        | { telegram_chat_id: number | string | null; telegram_username: string | null }
        | null;
      return {
        chatId: row?.telegram_chat_id == null ? null : String(row.telegram_chat_id),
        username: row?.telegram_username ?? null,
      };
    },

    async issueCode(userId, code, ttlSeconds) {
      const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const { error: deleteError } = await db
        .from('telegram_link_codes')
        .delete()
        .eq('user_id', userId)
        .is('used_at', null);
      if (deleteError) {
        throw new Error(`telegram link cleanup failed: ${deleteError.message}`);
      }
      const { error } = await db.from('telegram_link_codes').insert({
        code,
        user_id: userId,
        expires_at: expires,
      });
      if (error) throw new Error(`telegram link insert failed: ${error.message}`);
    },
  };

  return {
    auth: (request) => authenticate(request, supabaseEnv, db),
    allowedOrigins: () => parseAllowedOrigins(env.ALLOWED_ORIGINS),
    store,
    botUsername: () =>
      (env.TELEGRAM_BOT_USERNAME ?? '').trim() || DEFAULT_BOT_USERNAME,
    now: () => new Date(),
  };
}
