import type { TelegramProfile, TelegramStore } from './telegram-store.ts';

export interface TelegramDeps {
  store: TelegramStore;
  sendMessage(chatId: number, text: string): Promise<void>;
  generate(profile: TelegramProfile, ingredients: string[]): Promise<unknown>;
  secretToken(): string;
  rateLimitPerMinute(): number;
}

export interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    from?: { username?: string };
    text?: string;
  };
  channel_post?: {
    chat?: { id?: number | string };
    from?: { username?: string };
    text?: string;
  };
}

const MAX_PANTRY_ITEMS = 60;
const MAX_COOK_INGREDIENTS = 30;

export async function handleTelegramWebhook(
  request: Request,
  deps: TelegramDeps,
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const expected = deps.secretToken().trim();
  if (!expected) {
    // Fail closed: an unauthenticated public webhook can burn AI quota.
    return json({ error: 'webhook_secret_not_configured' }, 503);
  }
  const provided = (request.headers.get('x-telegram-bot-api-secret-token') ?? '').trim();
  if (!constantTimeEqual(provided, expected)) {
    return json({ error: 'invalid_webhook_secret' }, 403);
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return json({ ok: true, status: 'ignored' });
  }

  const message = update.message ?? update.channel_post;
  if (!message) return json({ ok: true, status: 'ignored' });

  const chatId = Number(message.chat?.id);
  const text = (message.text ?? '').trim();
  if (!Number.isSafeInteger(chatId) || !text) {
    return json({ ok: true, status: 'ignored' });
  }

  try {
    const allowed = await deps.store.consumeMessage(chatId, deps.rateLimitPerMinute(), 60);
    if (!allowed) return json({ ok: true, status: 'rate_limited' });

    const { command, argument } = parseCommand(text);

    if (command === '/start') {
      if (argument) {
        const linked = await deps.store.consumeLinkCode(
          argument,
          chatId,
          message.from?.username ?? '',
        );
        if (linked) {
          await deps.sendMessage(
            chatId,
            `Welcome Chef ${linked.profile.username}!\n\n` +
              'Your WhatToCook kitchen is now linked. Commands:\n' +
              '• /pantry - view your shelf\n' +
              '• /add <ingredient> - stock an item\n' +
              '• /remove <ingredient> - remove an item\n' +
              '• /cook - ask the AI Chef what you can cook',
          );
          return json({ ok: true, status: 'connected' });
        }
        await deps.sendMessage(
          chatId,
          'That connection code is invalid or expired. Open the WhatToCook web app and generate a new Telegram link.',
        );
        return json({ ok: true, status: 'invalid_token' });
      }

      await deps.sendMessage(
        chatId,
        'Welcome to the WhatToCook AI Chef Bot!\n\n' +
          "To link your account, press 'Connect Telegram' in the WhatToCook web app and open the bot link.",
      );
      return json({ ok: true, status: 'welcome' });
    }

    const linked = await deps.store.findByChat(chatId);
    if (!linked) {
      await deps.sendMessage(
        chatId,
        'Please link your account first: open the WhatToCook web app and use Connect Telegram.',
      );
      return json({ ok: true, status: 'unlinked' });
    }

    switch (command) {
      case '/pantry': {
        const items = await deps.store.pantryNames(linked.profile.id);
        if (items.length === 0) {
          await deps.sendMessage(
            chatId,
            'Your pantry is empty. Add an item with /add <ingredient>.',
          );
        } else {
          const shown = items.slice(0, MAX_PANTRY_ITEMS);
          const extra =
            items.length > shown.length
              ? `\n…and ${items.length - shown.length} more in the app.`
              : '';
          await deps.sendMessage(
            chatId,
            `Your kitchen pantry (${items.length} items):\n\n` +
              shown.map((name) => `• ${name}`).join('\n') +
              extra,
          );
        }
        return json({ ok: true, status: 'pantry_viewed' });
      }

      case '/add': {
        const name = normalizeIngredient(argument);
        if (!name) {
          await deps.sendMessage(chatId, 'Usage: /add <ingredient> (for example /add Olive Oil)');
          return json({ ok: true, status: 'missing_argument' });
        }
        const canonical = await deps.store.addIngredient(linked.profile.id, name);
        await deps.sendMessage(chatId, `Added ${canonical} to your pantry.`);
        return json({ ok: true, status: 'ingredient_added' });
      }

      case '/remove': {
        const name = normalizeIngredient(argument);
        if (!name) {
          await deps.sendMessage(
            chatId,
            'Usage: /remove <ingredient> (for example /remove Tomato)',
          );
          return json({ ok: true, status: 'missing_argument' });
        }
        const removed = await deps.store.removeIngredient(linked.profile.id, name);
        await deps.sendMessage(
          chatId,
          removed
            ? `Removed ${removed} from your pantry.`
            : `${name} is not on your active pantry shelf.`,
        );
        return json({ ok: true, status: 'ingredient_removed' });
      }

      case '/cook': {
        const items = await deps.store.pantryNames(linked.profile.id);
        if (items.length === 0) {
          await deps.sendMessage(
            chatId,
            'Your pantry is empty. Add ingredients first with /add <ingredient>.',
          );
          return json({ ok: true, status: 'empty_pantry' });
        }
        await deps.sendMessage(chatId, 'Chef is looking at your ingredients…');
        try {
          const data = await deps.generate(
            linked,
            items.slice(0, MAX_COOK_INGREDIENTS),
          );
          await deps.sendMessage(chatId, formatSuggestions(data));
          return json({ ok: true, status: 'recipes_suggested' });
        } catch {
          await deps.sendMessage(
            chatId,
            'The AI kitchen is unavailable right now. Please try again in a moment.',
          );
          return json({ ok: true, status: 'ai_unavailable' });
        }
      }

      default:
        await deps.sendMessage(
          chatId,
          'WhatToCook commands:\n' +
            '• /pantry - view stocked ingredients\n' +
            '• /add <ingredient> - stock an item\n' +
            '• /remove <ingredient> - remove an item\n' +
            '• /cook - instant AI recipe ideas',
        );
        return json({ ok: true, status: 'help_sent' });
    }
  } catch (error) {
    console.error('telegram webhook failed', error instanceof Error ? error.message : error);
    return json({ ok: true, status: 'error' });
  }
}

export function parseCommand(text: string): { command: string; argument: string } {
  const [raw = '', ...rest] = text.trim().split(/\s+/);
  const command = (raw.split('@')[0] ?? '').toLowerCase();
  return { command, argument: rest.join(' ').trim() };
}

export function normalizeIngredient(value: string): string {
  // Reject raw control characters before whitespace collapsing, otherwise a
  // stray newline/tab would silently become a space and slip through.
  if (/[\u0000-\u001f\u007f]/.test(value.trim())) return '';
  const name = value.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return '';
  return name;
}

export function formatSuggestions(data: unknown): string {
  const recipes = (data as { recipes?: unknown } | null)?.recipes;
  if (!Array.isArray(recipes) || recipes.length === 0) {
    return 'The Chef could not find a recipe with those ingredients. Try adding a few more.';
  }
  const lines = recipes.slice(0, 4).map((entry) => {
    const recipe = (entry ?? {}) as {
      name?: unknown;
      prep_time?: unknown;
      short_description?: unknown;
      description?: unknown;
    };
    const name = typeof recipe.name === 'string' ? recipe.name : 'Recipe';
    const time = typeof recipe.prep_time === 'string' ? ` (${recipe.prep_time})` : '';
    const description =
      typeof recipe.short_description === 'string'
        ? recipe.short_description
        : typeof recipe.description === 'string'
          ? recipe.description
          : '';
    return `• ${name}${time}${description ? `\n  ${description}` : ''}`;
  });
  return `Here is what you can cook:\n\n${lines.join('\n\n')}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
