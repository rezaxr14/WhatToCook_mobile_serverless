import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { parseRuntimeConfig, type AppConfigRow } from '../_shared/config.ts';
import { modelFor } from '../_shared/gateway.ts';

const row: AppConfigRow = {
  ai_kill_switch: false,
  global_daily_cap_micro_usd: 1_000_000,
  feature_flags: null,
  model_routing: {
    provider: 'gemini',
    models: {
      suggestions: 'gemini-3.5-flash-lite',
      recipe: 'gemini-3.5-flash-lite',
      chat: 'gemini-3.5-flash-lite',
      stream: 'gemini-3.5-flash-lite',
      scan: 'gemini-3.5-flash-lite',
      substitution: 'gemini-3.5-flash-lite',
    },
    fallbacks: {
      text: ['gemini-3.1-flash-lite'],
      vision: ['gemini-3.1-flash-lite'],
    },
  },
};

const config = parseRuntimeConfig(row, {});

Deno.test('gateway: uses the routed model when the client does not choose one', () => {
  assertEquals(modelFor(config, 'suggestions'), 'gemini-3.5-flash-lite');
});

Deno.test('gateway: honors a routed Gemini fallback selected by the client', () => {
  assertEquals(modelFor(config, 'suggestions', 'gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
  assertEquals(modelFor(config, 'scan', 'gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
});

Deno.test('gateway: ignores a Gemini model the server does not expose', () => {
  assertEquals(modelFor(config, 'suggestions', 'gemini-3.6-flash'), 'gemini-3.5-flash-lite');
});

Deno.test('gateway: rejects a feature without routing', () => {
  const unrouted = parseRuntimeConfig(
    {
      ...row,
      model_routing: { provider: 'gemini', models: { suggestions: 'gemini-3.5-flash-lite' } },
    },
    {},
  );
  assertThrows(() => modelFor(unrouted, 'scan'), Error);
});
