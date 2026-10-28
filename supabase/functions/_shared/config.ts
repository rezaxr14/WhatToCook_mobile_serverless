import type { AIFeature, AIProviderId } from '../../../packages/shared/src/ai-contracts.ts';
import { DEFAULT_OPENROUTER_MODEL } from '../../../packages/shared/src/ai-models.ts';
import { mapDatabaseError, providerError } from './errors.ts';
import type { DbClient } from './db.ts';
import { parseAllowedOrigins } from './cors.ts';
import type { RuntimeConfig } from './types.ts';

export type Env = Record<string, string | undefined>;

export interface AppConfigRow {
  ai_kill_switch: boolean;
  global_daily_cap_micro_usd: number;
  feature_flags: Record<string, unknown> | null;
  model_routing: Record<string, unknown> | null;
}

const TEXT_FEATURES: AIFeature[] = ['suggestions', 'recipe', 'chat', 'stream', 'substitution'];

export function parseRuntimeConfig(row: AppConfigRow | null, env: Env): RuntimeConfig {
  const routing = asRecord(row?.model_routing);
  const rawModels = asRecord(routing.models);
  const flatModels = asRecord(routing);
  const fallbacks = asRecord(routing.fallbacks);

  const models: Partial<Record<AIFeature, string>> = {};
  const modelValue = (feature: AIFeature, aliases: string[] = []): string | undefined => {
    for (const key of [feature, ...aliases]) {
      const value = rawModels[key] ?? flatModels[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  };

  const setModel = (feature: AIFeature, value: string | undefined) => {
    if (value) models[feature] = value;
  };

  setModel('suggestions', modelValue('suggestions'));
  setModel('recipe', modelValue('recipe', ['detail']));
  setModel('chat', modelValue('chat'));
  setModel('stream', modelValue('stream'));
  setModel('scan', modelValue('scan', ['vision']));
  setModel('substitution', modelValue('substitution'));

  const providerId = normalizeProvider(
    env.AI_PROVIDER?.trim() || stringValue(routing.provider) || 'gemini',
  );

  let textFallbacks = stringArray(fallbacks.text).length
    ? stringArray(fallbacks.text)
    : stringArray(routing.text_fallbacks);
  let visionFallbacks = stringArray(fallbacks.vision).length
    ? stringArray(fallbacks.vision)
    : stringArray(routing.vision_fallbacks);
  let allowedModels: string[] = [];
  let openRouterModel = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const allowedProviders = new Set<string>([providerId]);

  if (providerId === 'openrouter') {
    // OpenRouter model ids are namespaced (for example `openai/gpt-4o-mini`),
    // so the Gemini routing in app_config cannot be reused. A single model can
    // cover every feature; the optional vision override is for multimodal
    // models. Fallbacks are opt-in and must also be OpenRouter model ids.
    const configuredOpenRouterModel = env.OPENROUTER_MODEL?.trim();
    if (!configuredOpenRouterModel) {
      throw providerError('OPENROUTER_MODEL is not configured for the OpenRouter provider.');
    }
    openRouterModel = configuredOpenRouterModel;
    for (const feature of TEXT_FEATURES) models[feature] = openRouterModel;
    models.scan = env.OPENROUTER_VISION_MODEL?.trim() || openRouterModel;
    textFallbacks = commaList(env.OPENROUTER_FALLBACK_MODELS);
    visionFallbacks = commaList(env.OPENROUTER_VISION_FALLBACK_MODELS);
    if (!visionFallbacks.length) visionFallbacks = textFallbacks;
    // The picker shows the deploy-selected model only. Operators can opt into a
    // larger allowlist explicitly with OPENROUTER_ALLOWED_MODELS.
    const configuredModels = commaList(env.OPENROUTER_ALLOWED_MODELS);
    allowedModels = uniqueStrings([openRouterModel, ...configuredModels]);
  } else if (providerId === 'lmstudio') {
    const lmStudioModel = env.LMSTUDIO_MODEL?.trim();
    if (!lmStudioModel) {
      throw providerError('LMSTUDIO_MODEL is not configured for the LM Studio provider.');
    }
    for (const feature of TEXT_FEATURES) models[feature] = lmStudioModel;
    models.scan = env.LMSTUDIO_VISION_MODEL?.trim() || lmStudioModel;
    textFallbacks = commaList(env.LMSTUDIO_FALLBACK_MODELS);
    visionFallbacks = commaList(env.LMSTUDIO_VISION_FALLBACK_MODELS);
    if (!visionFallbacks.length) visionFallbacks = textFallbacks;
    const configuredModels = commaList(env.LMSTUDIO_ALLOWED_MODELS);
    allowedModels = [...new Set([lmStudioModel, ...configuredModels])];
  } else {
    const envTextModel = env.GEMINI_MODEL?.trim();
    if (envTextModel) {
      for (const feature of TEXT_FEATURES) models[feature] = envTextModel;
    }
    const envVisionModel = env.GEMINI_VISION_MODEL?.trim() || envTextModel;
    if (envVisionModel) models.scan = envVisionModel;

    // Gemini ignores unknown client choices by design. The models exposed by
    // the `ai-models` catalog (the routed models plus their fallbacks) are the
    // ones the client may request, so the model selector actually changes the
    // model instead of silently falling back to the routed default. Pricing is
    // still resolved server-side, so a model without a price row is rejected.
    allowedModels = uniqueStrings([...Object.values(models), ...textFallbacks, ...visionFallbacks]);

    // Keep OpenRouter's free router selectable next to Gemini. It is opt-in so a
    // deployment never sends prompts to a second vendor without the key, and
    // only the single `OPENROUTER_MODEL` from the environment is exposed.
    const configuredProviders = commaList(env.AI_ALLOWED_PROVIDERS).map((entry) =>
      entry.toLowerCase(),
    );
    const fallbackProvider = env.AI_FALLBACK_PROVIDER?.trim().toLowerCase();
    const wantsOpenRouter =
      configuredProviders.includes('openrouter') ||
      fallbackProvider === 'openrouter' ||
      Boolean(env.OPENROUTER_API_KEY?.trim());
    if (wantsOpenRouter) allowedProviders.add('openrouter');
  }

  return {
    providerId,
    allowedProviders: [...allowedProviders],
    openRouterModel,
    killSwitch: row?.ai_kill_switch === true,
    featureFlags: parseFeatureFlags(row?.feature_flags),
    globalDailyCapMicroUsd: Number(row?.global_daily_cap_micro_usd ?? 5_000_000),
    rateLimits: {
      rpm: parseRequestLimit(env.AI_RPM_LIMIT, 'AI_RPM_LIMIT'),
      rpd: parseRequestLimit(env.AI_RPD_LIMIT, 'AI_RPD_LIMIT'),
      // Per-client guards are on by default so a new deployment cannot be
      // hammered before anyone tunes the environment. An explicitly blank value
      // (set but empty) disables the guard.
      userRpm: parseLimitOrDefault(env.AI_USER_RPM_LIMIT, DEFAULT_USER_RPM, 'AI_USER_RPM_LIMIT'),
      anonRpm: parseLimitOrDefault(env.AI_ANON_RPM_LIMIT, DEFAULT_ANON_RPM, 'AI_ANON_RPM_LIMIT'),
      ipRpm: parseLimitOrDefault(env.AI_IP_RPM_LIMIT, DEFAULT_IP_RPM, 'AI_IP_RPM_LIMIT'),
    },
    models,
    allowedModels,
    fallbacks: {
      text: textFallbacks,
      vision: visionFallbacks,
    },
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
  };
}

export async function loadRuntimeConfig(db: DbClient, env: Env): Promise<RuntimeConfig> {
  const { data, error } = await db
    .from('app_config')
    .select('ai_kill_switch, global_daily_cap_micro_usd, feature_flags, model_routing')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw mapDatabaseError(error.message, error);
  return parseRuntimeConfig((data ?? null) as AppConfigRow | null, env);
}

function normalizeProvider(value: string): AIProviderId {
  if (value === 'gemini' || value === 'openrouter' || value === 'lmstudio' || value === 'fake') {
    return value;
  }
  throw providerError('The configured AI provider is not supported.');
}

function parseFeatureFlags(
  value: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (typeof entry === 'boolean') flags[key] = entry;
  }
  return flags;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function commaList(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function parseRequestLimit(value: string | undefined, name: string): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw providerError(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

/** Defaults for the per-user/per-IP gateway guards (requests per minute). */
const DEFAULT_USER_RPM = 20;
const DEFAULT_ANON_RPM = 8;
const DEFAULT_IP_RPM = 40;

/**
 * Unset env keeps the secure default; an env var that is present but blank
 * disables the guard (returns null). `0` is a real value that blocks every
 * request, matching the global RPM semantics.
 */
function parseLimitOrDefault(
  value: string | undefined,
  fallback: number,
  name: string,
): number | null {
  if (value === undefined) return fallback;
  return parseRequestLimit(value, name);
}
