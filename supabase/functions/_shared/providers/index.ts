import { providerError } from '../errors.ts';
import { DEFAULT_OPENROUTER_MODEL } from '../../../../packages/shared/src/ai-models.ts';
import { FakeProvider } from './fake.ts';
import { FallbackProvider } from './fallback.ts';
import { GeminiProvider } from './gemini.ts';
import { OpenRouterProvider } from './openrouter.ts';
import type { AIProvider, RuntimeConfig } from '../types.ts';

export function createProvider(
  providerId: string,
  config: RuntimeConfig,
  env: Record<string, string | undefined>,
): AIProvider {
  if (providerId === 'fake') {
    return new FakeProvider({
      delayMs: numberFromEnv(env.FAKE_PROVIDER_DELAY_MS, 0),
      invalidOutput: booleanFromEnv(env.FAKE_PROVIDER_INVALID_OUTPUT),
      emptyOutput: booleanFromEnv(env.FAKE_PROVIDER_EMPTY_OUTPUT),
      failFeatures: commaList(env.FAKE_PROVIDER_FAIL_FEATURES),
    });
  }

  if (providerId === 'gemini') {
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw providerError('Gemini is not configured on the server.');
    }
    const textFallbacks = unique([
      ...config.fallbacks.text,
      config.models.suggestions,
      config.models.recipe,
      config.models.chat,
      config.models.stream,
      config.models.substitution,
    ]);
    const visionFallbacks = unique([
      ...config.fallbacks.vision,
      config.models.scan,
      config.models.recipe,
    ]);
    const primary = new GeminiProvider({ apiKey, textFallbacks, visionFallbacks });

    // Optional cross-provider fallback: keep serving from OpenRouter's free
    // model when Gemini is unavailable or the key hits its quota. Opt-in so a
    // deployment never silently sends prompts to a second vendor.
    if (env.AI_FALLBACK_PROVIDER?.trim().toLowerCase() === 'openrouter') {
      const openRouterKey = env.OPENROUTER_API_KEY?.trim();
      if (openRouterKey) {
        return new FallbackProvider(
          primary,
          new OpenRouterProvider({
            apiKey: openRouterKey,
            textFallbacks: [],
            visionFallbacks: [],
            siteUrl: env.OPENROUTER_SITE_URL?.trim() || undefined,
            appName: env.OPENROUTER_APP_NAME?.trim() || 'WhatToCook',
            jsonMode: env.OPENROUTER_JSON_MODE !== 'false',
            timeoutMs: 60_000,
            streamTimeoutMs: 120_000,
          }),
          env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
          env.AI_FALLBACK_VISION === 'true',
        );
      }
      console.warn('ai_fallback_skipped', 'OPENROUTER_API_KEY is not configured');
    }

    return primary;
  }

  if (providerId === 'openrouter') {
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw providerError('OpenRouter is not configured on the server.');
    }
    const textFallbacks = unique([
      ...config.fallbacks.text,
      config.models.suggestions,
      config.models.recipe,
      config.models.chat,
      config.models.stream,
      config.models.substitution,
    ]);
    const visionFallbacks = unique([
      ...config.fallbacks.vision,
      config.models.scan,
      config.models.recipe,
    ]);
    return new OpenRouterProvider({
      apiKey,
      textFallbacks,
      visionFallbacks,
      siteUrl: env.OPENROUTER_SITE_URL?.trim() || undefined,
      appName: env.OPENROUTER_APP_NAME?.trim() || 'WhatToCook',
      jsonMode: env.OPENROUTER_JSON_MODE !== 'false',
    });
  }

  if (providerId === 'lmstudio') {
    const textFallbacks = unique([
      ...config.fallbacks.text,
      ...config.allowedModels,
      config.models.suggestions,
      config.models.recipe,
      config.models.chat,
      config.models.stream,
      config.models.substitution,
    ]);
    const visionFallbacks = unique([
      ...config.fallbacks.vision,
      ...config.allowedModels,
      config.models.scan,
      config.models.recipe,
    ]);
    return new OpenRouterProvider({
      providerId: 'lmstudio',
      displayName: 'LM Studio',
      baseUrl: env.LMSTUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1234/v1',
      apiKey: env.LMSTUDIO_API_KEY?.trim() || undefined,
      textFallbacks,
      visionFallbacks,
      // LM Studio rejects `response_format: json_object` for many local models
      // (it expects `json_schema` or `text`), so JSON mode is opt-in here and
      // structured calls rely on the shared JSON repair/validation instead.
      jsonMode: env.LMSTUDIO_JSON_MODE === 'true',
      timeoutMs: numberFromEnv(env.LMSTUDIO_TIMEOUT_MS, 120_000),
      streamTimeoutMs: numberFromEnv(env.LMSTUDIO_STREAM_TIMEOUT_MS, 180_000),
    });
  }

  throw providerError('The configured AI provider is not supported.');
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanFromEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function commaList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
