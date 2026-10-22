import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { parseRuntimeConfig, type AppConfigRow } from '../_shared/config.ts';
import { parseAllowedOrigins } from '../_shared/cors.ts';

const baseRow: AppConfigRow = {
  ai_kill_switch: false,
  global_daily_cap_micro_usd: 123_456,
  feature_flags: { suggestions: true, chat: false, ignored: 'not-a-boolean' },
  model_routing: {
    provider: 'gemini',
    models: {
      suggestions: 'gemini-lite',
      detail: 'gemini-detail',
      chat: 'gemini-chat',
      stream: 'gemini-stream',
      vision: 'gemini-vision',
      substitution: 'gemini-lite',
    },
    fallbacks: {
      text: ['fallback-a', 'fallback-a', 'fallback-b'],
      vision: ['vision-fallback'],
    },
  },
};

Deno.test('config: reads routing, flags, caps, and deduplicated fallbacks', () => {
  const config = parseRuntimeConfig(baseRow, {});

  assertEquals(config.providerId, 'gemini');
  assertEquals(config.killSwitch, false);
  assertEquals(config.globalDailyCapMicroUsd, 123_456);
  assertEquals(config.featureFlags, { suggestions: true, chat: false });
  assertEquals(config.models.suggestions, 'gemini-lite');
  assertEquals(config.models.recipe, 'gemini-detail');
  assertEquals(config.models.scan, 'gemini-vision');
  assertEquals(config.models.substitution, 'gemini-lite');
  assertEquals(config.fallbacks.text, ['fallback-a', 'fallback-b']);
  assertEquals(config.fallbacks.vision, ['vision-fallback']);
  assertEquals(config.allowedOrigins, []);
});

Deno.test('config: env overrides provider, text models, vision model, and origins', () => {
  const config = parseRuntimeConfig(baseRow, {
    AI_PROVIDER: 'fake',
    GEMINI_MODEL: 'gemini-env-text',
    GEMINI_VISION_MODEL: 'gemini-env-vision',
    ALLOWED_ORIGINS: 'https://app.example, https://admin.example/',
  });

  assertEquals(config.providerId, 'fake');
  assertEquals(config.models.suggestions, 'gemini-env-text');
  assertEquals(config.models.recipe, 'gemini-env-text');
  assertEquals(config.models.chat, 'gemini-env-text');
  assertEquals(config.models.stream, 'gemini-env-text');
  assertEquals(config.models.substitution, 'gemini-env-text');
  assertEquals(config.models.scan, 'gemini-env-vision');
  assertEquals(config.allowedOrigins, ['https://app.example', 'https://admin.example']);
});

Deno.test('config: GEMINI_MODEL also supplies the scan model when no vision override exists', () => {
  const config = parseRuntimeConfig(baseRow, { GEMINI_MODEL: 'gemini-env-text' });
  assertEquals(config.models.scan, 'gemini-env-text');
});

Deno.test('config: supports flat routing keys and defaults missing rows safely', () => {
  const flat = parseRuntimeConfig(
    {
      ...baseRow,
      model_routing: { provider: 'gemini', suggestions: 'flat-lite' },
    },
    {},
  );
  assertEquals(flat.models.suggestions, 'flat-lite');

  const defaults = parseRuntimeConfig(null, {});
  assertEquals(defaults.providerId, 'gemini');
  assertEquals(defaults.killSwitch, false);
  assertEquals(defaults.globalDailyCapMicroUsd, 5_000_000);
  assertEquals(defaults.featureFlags, {});
  assertEquals(defaults.models, {});
  assertEquals(defaults.fallbacks, { text: [], vision: [] });
  assertEquals(defaults.allowedOrigins, []);
});

Deno.test('cors: accepts comma- or whitespace-separated origins', () => {
  assertEquals(
    parseAllowedOrigins('http://localhost:5173, http://127.0.0.1:5173/'),
    ['http://localhost:5173', 'http://127.0.0.1:5173'],
  );
  assertEquals(
    parseAllowedOrigins('http://localhost:5173 http://127.0.0.1:5173'),
    ['http://localhost:5173', 'http://127.0.0.1:5173'],
  );
});

Deno.test('config: an unsupported provider is rejected', () => {
  assertThrows(
    () => parseRuntimeConfig(baseRow, { AI_PROVIDER: 'not-a-provider' }),
    'not supported',
  );
});
