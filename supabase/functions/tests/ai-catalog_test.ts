import { assertEquals } from 'jsr:@std/assert@1';
import { buildAICatalog, readLMStudioStatus } from '../_shared/ai-catalog.ts';
import { parseRuntimeConfig, type AppConfigRow } from '../_shared/config.ts';

const baseRow: AppConfigRow = {
  ai_kill_switch: false,
  global_daily_cap_micro_usd: 1_000_000,
  feature_flags: null,
  model_routing: { provider: 'gemini' },
};

Deno.test('ai-catalog: OpenRouter exposes the free model list and no local provider', () => {
  const config = parseRuntimeConfig(baseRow, {
    AI_PROVIDER: 'openrouter',
    OPENROUTER_MODEL: 'openrouter/free',
  });
  const catalog = buildAICatalog(config, { online: false, models: [] });

  assertEquals(catalog.default_provider, 'openrouter');
  assertEquals(catalog.has_openrouter, true);
  assertEquals(catalog.has_lmstudio, false);
  assertEquals(catalog.lmstudio_online, false);
  assertEquals(catalog.is_live, true);
  assertEquals(catalog.current_model, 'openrouter/free');
  assertEquals(
    catalog.models.some((model) => model.id === 'openrouter/free'),
    true,
  );
});

Deno.test('ai-catalog: LM Studio reports online state, configured model, and local models', () => {
  const config = parseRuntimeConfig(baseRow, {
    AI_PROVIDER: 'lmstudio',
    LMSTUDIO_MODEL: 'gemma-local',
    LMSTUDIO_ALLOWED_MODELS: 'qwen-local',
  });

  const online = buildAICatalog(config, { online: true, models: ['gemma-local', 'phi-local'] });
  assertEquals(online.default_provider, 'lmstudio');
  assertEquals(online.has_lmstudio, true);
  assertEquals(online.lmstudio_online, true);
  assertEquals(online.lmstudio_model, 'gemma-local');
  assertEquals(online.is_live, true);
  assertEquals(
    online.models.map((model) => model.id),
    ['gemma-local', 'phi-local', 'qwen-local'],
  );

  const offline = buildAICatalog(config, { online: false, models: [] });
  assertEquals(offline.lmstudio_online, false);
  assertEquals(offline.is_live, false);
  assertEquals(offline.models[0]?.id, 'gemma-local');
});

Deno.test('ai-catalog: Gemini exposes the routed model plus its Lite fallback', () => {
  const config = parseRuntimeConfig(
    {
      ...baseRow,
      model_routing: {
        provider: 'gemini',
        models: {
          suggestions: 'gemini-3.5-flash-lite',
          scan: 'gemini-3.5-flash-lite',
        },
        fallbacks: { text: ['gemini-3.1-flash-lite'], vision: ['gemini-3.1-flash-lite'] },
      },
    },
    {},
  );

  const catalog = buildAICatalog(config, { online: false, models: [] });

  assertEquals(catalog.default_provider, 'gemini');
  assertEquals(catalog.current_model, 'gemini-3.5-flash-lite');
  assertEquals(
    catalog.models.map((model) => model.id),
    ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  );
  assertEquals(catalog.models[0]?.description, 'Default Gemini model for every feature');
  assertEquals(catalog.models[1]?.description, 'Gemini fallback model');
});

Deno.test('ai-catalog: readLMStudioStatus reads the OpenAI-compatible model list', async () => {
  const online = await readLMStudioStatus(
    'http://127.0.0.1:1234/v1',
    undefined,
    (async () =>
      new Response(JSON.stringify({ data: [{ id: 'gemma-local' }, { id: 42 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
  );
  assertEquals(online, { online: true, models: ['gemma-local'] });

  const offline = await readLMStudioStatus('http://127.0.0.1:1234/v1', undefined, (async () => {
    throw new Error('connection refused');
  }) as typeof fetch);
  assertEquals(offline, { online: false, models: [] });
});
