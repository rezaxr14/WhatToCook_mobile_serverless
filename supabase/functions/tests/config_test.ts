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
  assertEquals(config.rateLimits, { rpm: null, rpd: null });
  assertEquals(config.allowedModels, []);
  assertEquals(config.allowedOrigins, []);
});

Deno.test('config: parses global RPM and RPD request limits', () => {
  const config = parseRuntimeConfig(baseRow, { AI_RPM_LIMIT: '60', AI_RPD_LIMIT: '2000' });
  assertEquals(config.rateLimits, { rpm: 60, rpd: 2000 });

  const disabled = parseRuntimeConfig(baseRow, { AI_RPM_LIMIT: '0', AI_RPD_LIMIT: '' });
  assertEquals(disabled.rateLimits, { rpm: 0, rpd: null });
});

Deno.test('config: rejects malformed request limits', () => {
  assertThrows(() => parseRuntimeConfig(baseRow, { AI_RPM_LIMIT: '60.5' }), 'AI_RPM_LIMIT');
  assertThrows(() => parseRuntimeConfig(baseRow, { AI_RPD_LIMIT: '-1' }), 'AI_RPD_LIMIT');
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

Deno.test(
  'config: GEMINI_MODEL also supplies the scan model when no vision override exists',
  () => {
    const config = parseRuntimeConfig(baseRow, { GEMINI_MODEL: 'gemini-env-text' });
    assertEquals(config.models.scan, 'gemini-env-text');
  },
);

Deno.test('config: OpenRouter uses its own model and fallbacks, ignoring Gemini routing', () => {
  const config = parseRuntimeConfig(baseRow, {
    AI_PROVIDER: 'openrouter',
    GEMINI_MODEL: 'gemini-should-not-apply',
    OPENROUTER_MODEL: 'openai/gpt-4o-mini',
    OPENROUTER_VISION_MODEL: 'openai/gpt-4o',
    OPENROUTER_FALLBACK_MODELS: 'openai/gpt-4.1-mini, openai/gpt-4o-mini, openai/gpt-4.1-mini',
  });

  assertEquals(config.providerId, 'openrouter');
  assertEquals(config.models.suggestions, 'openai/gpt-4o-mini');
  assertEquals(config.models.recipe, 'openai/gpt-4o-mini');
  assertEquals(config.models.chat, 'openai/gpt-4o-mini');
  assertEquals(config.models.stream, 'openai/gpt-4o-mini');
  assertEquals(config.models.substitution, 'openai/gpt-4o-mini');
  assertEquals(config.models.scan, 'openai/gpt-4o');
  assertEquals(config.fallbacks.text, ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini']);
  assertEquals(config.fallbacks.vision, ['openai/gpt-4.1-mini', 'openai/gpt-4o-mini']);
  assertEquals(config.allowedModels.includes('openai/gpt-4o-mini'), true);
  assertEquals(config.allowedModels.includes('openrouter/free'), true);
  assertEquals(config.allowedModels.includes('google/gemma-4-31b-it:free'), true);
});

Deno.test('config: OpenRouter can restrict the client-selectable model list', () => {
  const config = parseRuntimeConfig(baseRow, {
    AI_PROVIDER: 'openrouter',
    OPENROUTER_MODEL: 'openrouter/free',
    OPENROUTER_ALLOWED_MODELS: 'openrouter/free, openai/gpt-4o-mini, openai/gpt-4o-mini',
  });

  assertEquals(config.allowedModels, ['openrouter/free', 'openai/gpt-4o-mini']);
});

Deno.test('config: OpenRouter requires OPENROUTER_MODEL', () => {
  assertThrows(
    () => parseRuntimeConfig(baseRow, { AI_PROVIDER: 'openrouter' }),
    'OPENROUTER_MODEL',
  );
});

Deno.test('config: LM Studio uses an OpenAI-compatible local model', () => {
  const config = parseRuntimeConfig(baseRow, {
    AI_PROVIDER: 'lmstudio',
    LMSTUDIO_MODEL: 'gemma-4-e4b',
    LMSTUDIO_ALLOWED_MODELS: 'gemma-4-e4b, qwen-local',
  });

  assertEquals(config.providerId, 'lmstudio');
  assertEquals(config.models.suggestions, 'gemma-4-e4b');
  assertEquals(config.models.scan, 'gemma-4-e4b');
  assertEquals(config.allowedModels, ['gemma-4-e4b', 'qwen-local']);
  assertThrows(() => parseRuntimeConfig(baseRow, { AI_PROVIDER: 'lmstudio' }), 'LMSTUDIO_MODEL');
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
  assertEquals(defaults.allowedModels, []);
  assertEquals(defaults.fallbacks, { text: [], vision: [] });
  assertEquals(defaults.rateLimits, { rpm: null, rpd: null });
  assertEquals(defaults.allowedOrigins, []);
});

Deno.test('cors: accepts comma- or whitespace-separated origins', () => {
  assertEquals(parseAllowedOrigins('http://localhost:5173, http://127.0.0.1:5173/'), [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  assertEquals(parseAllowedOrigins('http://localhost:5173 http://127.0.0.1:5173'), [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
});

Deno.test('config: an unsupported provider is rejected', () => {
  assertThrows(
    () => parseRuntimeConfig(baseRow, { AI_PROVIDER: 'not-a-provider' }),
    'not supported',
  );
});
