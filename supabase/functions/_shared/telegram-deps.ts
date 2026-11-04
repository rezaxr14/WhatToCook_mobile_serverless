import { generateRecipeRequestSchema } from '../../../packages/shared/src/ai-contracts.ts';
import type { DbClient } from './db.ts';
import { createGatewayDeps } from './deps.ts';
import { generateForAuth } from './generate-handler.ts';
import { createServiceClient, readSupabaseEnv } from './supabase.ts';
import type { TelegramDeps } from './telegram.ts';
import { createTelegramStore, type TelegramProfile } from './telegram-store.ts';
import type { AuthContext } from './types.ts';

const DEFAULT_BOT_USERNAME = 'WhatToCookChefBot';

export function createTelegramDeps(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): TelegramDeps {
  const supabaseEnv = readSupabaseEnv(env);
  const service = createServiceClient(supabaseEnv);
  const store = createTelegramStore(service as unknown as DbClient);
  const gateway = createGatewayDeps(env);
  const botToken = (env.TELEGRAM_BOT_TOKEN ?? '').trim();

  return {
    store,
    secretToken: () => (env.TELEGRAM_WEBHOOK_SECRET ?? '').trim(),
    rateLimitPerMinute: () => clampLimit(env.TELEGRAM_RATE_LIMIT_PER_MINUTE, 20),

    async sendMessage(chatId, text) {
      if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!response.ok) {
        throw new Error(`telegram sendMessage failed with ${response.status}`);
      }
    },

    async generate(profile: TelegramProfile, ingredients: string[]) {
      const config = await gateway.loadConfig();
      const auth: AuthContext = {
        userId: profile.profile.id,
        token: '',
        profile: profile.profile,
        plan: profile.plan,
        internal: true,
        challengeExempt: true,
      };
      const input = generateRecipeRequestSchema.parse({
        mode: 'suggestions',
        ingredients,
        locale: profile.profile.locale,
      });
      const request = new Request('https://telegram.internal/generate-recipe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const response = await generateForAuth({
        request,
        deps: gateway,
        auth,
        config,
        cors: new Headers(),
        input,
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          (data as { message?: unknown; error?: unknown } | null)?.message ??
          (data as { error?: unknown } | null)?.error ??
          `gateway responded with ${response.status}`;
        throw new Error(String(message));
      }
      return data;
    },
  };
}

export function telegramBotUsername(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): string {
  return (env.TELEGRAM_BOT_USERNAME ?? '').trim() || DEFAULT_BOT_USERNAME;
}

function clampLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(120, Math.floor(parsed)));
}
