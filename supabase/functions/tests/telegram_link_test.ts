import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { createCode, handleTelegramLink, type TelegramLinkStore } from '../_shared/telegram-link.ts';
import type { AuthContext } from '../_shared/types.ts';

const AUTH: AuthContext = {
  userId: 'user-1',
  token: 'token',
  profile: { id: 'user-1', username: 'chef', locale: 'en', plan_id: 'free' },
  plan: {
    id: 'free',
    features: { suggestions: 60 },
    monthly_budget_micro_usd: -1,
    max_image_bytes: 5_242_880,
  },
};

function createDeps(existing: { chatId: string | null; username: string | null }) {
  const issued: Array<{ code: string; ttl: number }> = [];
  const store: TelegramLinkStore = {
    existingLink: async () => existing,
    issueCode: async (_userId, code, ttl) => {
      issued.push({ code, ttl });
    },
  };
  return {
    issued,
    deps: {
      auth: async () => AUTH,
      allowedOrigins: () => ['https://app.example'],
      store,
      botUsername: () => 'WhatToCookChefBot',
      now: () => new Date('2026-11-04T00:00:00Z'),
    },
  };
}

function post(origin = 'https://app.example') {
  return new Request('https://example.test/telegram-link', {
    method: 'POST',
    headers: { origin, authorization: 'Bearer token' },
  });
}

Deno.test('telegram link: issues a one-time code and deep links', async () => {
  const { deps, issued } = createDeps({ chatId: null, username: null });
  const response = await handleTelegramLink(post(), deps);
  assertEquals(response.status, 200);
  const body = await response.json();

  assertEquals(issued.length, 1);
  const issuedCode = issued[0]!;
  assertEquals(issuedCode.ttl, 600);
  assertEquals(body.auth_token, issuedCode.code);
  assertEquals(body.is_connected, false);
  assertEquals(body.bot_username, 'WhatToCookChefBot');
  assertStringIncludes(body.connect_url, `https://t.me/WhatToCookChefBot?start=${issuedCode.code}`);
  assertStringIncludes(body.web_tg_url, `start=${issuedCode.code}`);
  assertEquals(response.headers.get('access-control-allow-origin'), 'https://app.example');
});

Deno.test('telegram link: an already linked profile gets status rather than a new code', async () => {
  const { deps, issued } = createDeps({ chatId: '42', username: 'chef_tg' });
  const response = await handleTelegramLink(post(), deps);
  const body = await response.json();

  assertEquals(issued.length, 0);
  assertEquals(body.auth_token, null);
  assertEquals(body.is_connected, true);
  assertEquals(body.telegram_username, 'chef_tg');
  assertEquals(body.connect_url, 'https://t.me/WhatToCookChefBot');
});

Deno.test('telegram link: rejects a foreign origin and non-POST methods', async () => {
  const { deps } = createDeps({ chatId: null, username: null });
  const blocked = await handleTelegramLink(post('https://evil.example'), deps);
  assertEquals(blocked.status, 403);

  const get = await handleTelegramLink(
    new Request('https://example.test/telegram-link', {
      method: 'GET',
      headers: { origin: 'https://app.example' },
    }),
    deps,
  );
  assertEquals(get.status, 405);
});

Deno.test('telegram link: generated codes use the unambiguous alphabet', () => {
  const codes = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const code = createCode();
    assertEquals(code.length, 10);
    assert(/^[A-HJ-NP-Z2-9]{10}$/.test(code), `unexpected code ${code}`);
    codes.add(code);
  }
  assert(codes.size > 1);
});
