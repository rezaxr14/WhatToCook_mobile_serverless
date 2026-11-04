import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  formatSuggestions,
  handleTelegramWebhook,
  normalizeIngredient,
  parseCommand,
  type TelegramDeps,
} from '../_shared/telegram.ts';
import type { TelegramProfile, TelegramStore } from '../_shared/telegram-store.ts';

interface Sent {
  chatId: number;
  text: string;
}

const PROFILE: TelegramProfile = {
  profile: { id: 'user-1', username: 'chef', locale: 'en', plan_id: 'free' },
  plan: {
    id: 'free',
    features: { suggestions: 60, recipe: 60, chat: 60, stream: 60, scan: 15 },
    monthly_budget_micro_usd: -1,
    max_image_bytes: 5_242_880,
  },
};

function createFakeDeps(overrides: Partial<TelegramDeps> = {}): {
  deps: TelegramDeps;
  sent: Sent[];
  calls: string[];
} {
  const sent: Sent[] = [];
  const calls: string[] = [];
  const store: TelegramStore = {
    consumeLinkCode: async (code) => {
      calls.push(`link:${code}`);
      return code === 'GOODCODE1' ? PROFILE : null;
    },
    findByChat: async (chatId) => {
      calls.push(`chat:${chatId}`);
      return chatId === 42 ? PROFILE : null;
    },
    pantryNames: async () => {
      calls.push('pantry');
      return ['Eggs', 'Tomato'];
    },
    addIngredient: async (_userId, name) => {
      calls.push(`add:${name}`);
      return name;
    },
    removeIngredient: async (_userId, name) => {
      calls.push(`remove:${name}`);
      return name === 'Tomato' ? 'Tomato' : null;
    },
    consumeMessage: async (chatId) => {
      calls.push(`rate:${chatId}`);
      return true;
    },
  };
  const deps: TelegramDeps = {
    store,
    sendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
    },
    generate: async (_profile, ingredients) => {
      calls.push(`generate:${ingredients.join(',')}`);
      return {
        recipes: [
          {
            name: 'Tomato Omelette',
            prep_time: '10 mins',
            short_description: 'A quick breakfast.',
          },
        ],
      };
    },
    secretToken: () => 'secret-token',
    rateLimitPerMinute: () => 20,
    ...overrides,
  };
  return { deps, sent, calls };
}

function update(text: string, chatId = 42, username = 'chef') {
  return new Request('https://example.test/telegram', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'secret-token',
    },
    body: JSON.stringify({ message: { chat: { id: chatId }, from: { username }, text } }),
  });
}

Deno.test('telegram webhook: rejects a missing or wrong secret', async () => {
  const { deps, sent } = createFakeDeps();
  const missing = await handleTelegramWebhook(
    new Request('https://example.test/telegram', { method: 'POST', body: '{}' }),
    deps,
  );
  assertEquals(missing.status, 403);

  const whenUnset = await handleTelegramWebhook(update('/pantry'), {
    ...deps,
    secretToken: () => '',
  });
  assertEquals(whenUnset.status, 503);
  assertEquals(sent.length, 0);
});

Deno.test('telegram webhook: /start without a code explains how to link', async () => {
  const { deps, sent } = createFakeDeps();
  const response = await handleTelegramWebhook(update('/start'), deps);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).status, 'welcome');
  assertStringIncludes(sent[0]?.text ?? '', 'Connect Telegram');
});

Deno.test('telegram webhook: /start with a valid code links the chat', async () => {
  const { deps, sent, calls } = createFakeDeps();
  const response = await handleTelegramWebhook(update('/start GOODCODE1', 77), deps);
  assertEquals((await response.json()).status, 'connected');
  assert(calls.includes('link:GOODCODE1'));
  assertStringIncludes(sent[0]?.text ?? '', 'Welcome Chef chef');
});

Deno.test('telegram webhook: /start with a used or unknown code is rejected', async () => {
  const { deps, sent } = createFakeDeps();
  const response = await handleTelegramWebhook(update('/start NOPE1234', 77), deps);
  assertEquals((await response.json()).status, 'invalid_token');
  assertStringIncludes(sent[0]?.text ?? '', 'invalid or expired');
});

Deno.test('telegram webhook: unlinked chats only get linking instructions', async () => {
  const { deps, sent, calls } = createFakeDeps();
  const response = await handleTelegramWebhook(update('/pantry', 99), deps);
  assertEquals((await response.json()).status, 'unlinked');
  assertStringIncludes(sent[0]?.text ?? '', 'link your account first');
  assert(!calls.includes('pantry'));
});

Deno.test('telegram webhook: /pantry lists the linked pantry', async () => {
  const { deps, sent } = createFakeDeps();
  const response = await handleTelegramWebhook(update('/pantry'), deps);
  assertEquals((await response.json()).status, 'pantry_viewed');
  assertStringIncludes(sent[0]?.text ?? '', '2 items');
  assertStringIncludes(sent[0]?.text ?? '', 'Eggs');
});

Deno.test('telegram webhook: /add normalises the name and /remove reports misses', async () => {
  const { deps, sent, calls } = createFakeDeps();
  await handleTelegramWebhook(update('/add   Olive   Oil'), deps);
  assert(calls.includes('add:Olive Oil'));

  const removed = await handleTelegramWebhook(update('/remove Tomato'), deps);
  assertEquals((await removed.json()).status, 'ingredient_removed');
  assertStringIncludes(sent[1]?.text ?? '', 'Removed Tomato');

  await handleTelegramWebhook(update('/remove Pepper'), deps);
  assertStringIncludes(sent[2]?.text ?? '', 'not on your active pantry shelf');
});

Deno.test('telegram webhook: /add and /remove require an ingredient', async () => {
  const { deps, sent } = createFakeDeps();
  await handleTelegramWebhook(update('/add'), deps);
  await handleTelegramWebhook(update('/remove'), deps);
  assertStringIncludes(sent[0]?.text ?? '', 'Usage: /add');
  assertStringIncludes(sent[1]?.text ?? '', 'Usage: /remove');
});

Deno.test('telegram webhook: /cook sends pantry ingredients to the gateway', async () => {
  const { deps, sent, calls } = createFakeDeps();
  const response = await handleTelegramWebhook(update('/cook'), deps);
  assertEquals((await response.json()).status, 'recipes_suggested');
  assert(calls.includes('generate:Eggs,Tomato'));
  assertStringIncludes(sent[1]?.text ?? '', 'Tomato Omelette');
});

Deno.test('telegram webhook: /cook with an empty pantry does not call the gateway', async () => {
  const { deps, sent, calls } = createFakeDeps();
  const emptyStore = {
    ...deps.store,
    pantryNames: async () => [],
  };
  const response = await handleTelegramWebhook(update('/cook'), { ...deps, store: emptyStore });
  assertEquals((await response.json()).status, 'empty_pantry');
  assert(!calls.some((call) => call.startsWith('generate:')));
  assertStringIncludes(sent[0]?.text ?? '', 'pantry is empty');
});

Deno.test('telegram webhook: gateway failures degrade to a friendly message', async () => {
  const { deps, sent } = createFakeDeps({
    generate: async () => {
      throw new Error('ai_pool_exhausted');
    },
  });
  const response = await handleTelegramWebhook(update('/cook'), deps);
  assertEquals((await response.json()).status, 'ai_unavailable');
  assertStringIncludes(sent[1]?.text ?? '', 'AI kitchen is unavailable');
});

Deno.test('telegram webhook: per-chat rate limit stops processing', async () => {
  const { deps, sent } = createFakeDeps({
    store: {
      ...createFakeDeps().deps.store,
      consumeMessage: async () => false,
    },
  });
  const response = await handleTelegramWebhook(update('/pantry'), deps);
  assertEquals((await response.json()).status, 'rate_limited');
  assertEquals(sent.length, 0);
});

Deno.test('telegram commands: @bot suffix and whitespace are tolerated', () => {
  assertEquals(parseCommand('/pantry@WhatToCookChefBot'), {
    command: '/pantry',
    argument: '',
  });
  assertEquals(parseCommand('  /add   Olive   Oil  '), {
    command: '/add',
    argument: 'Olive Oil',
  });
  assertEquals(normalizeIngredient('  Olive   Oil '), 'Olive Oil');
  assertEquals(normalizeIngredient('x'), '');
  assertEquals(normalizeIngredient('bad\nname'), '');
});

Deno.test('telegram formatting: suggestions are capped and tolerate missing copy', () => {
  const text = formatSuggestions({
    recipes: Array.from({ length: 6 }, (_, index) => ({
      name: `Dish ${index + 1}`,
      description: 'Tasty.',
    })),
  });
  assertStringIncludes(text, 'Dish 1');
  assertStringIncludes(text, 'Dish 4');
  assert(!text.includes('Dish 5'));
  assertStringIncludes(formatSuggestions({ recipes: [] }), 'could not find');
});
