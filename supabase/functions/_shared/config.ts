import type { AIFeature, AIProviderId } from '../../../packages/shared/src/ai-contracts.ts';
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

const TEXT_FEATURES: AIFeature[] = [
  'suggestions',
  'recipe',
  'chat',
  'stream',
  'substitution',
];

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

  const envTextModel = env.GEMINI_MODEL?.trim();
  if (envTextModel) {
    for (const feature of TEXT_FEATURES) models[feature] = envTextModel;
  }
  const envVisionModel = env.GEMINI_VISION_MODEL?.trim() || envTextModel;
  if (envVisionModel) models.scan = envVisionModel;

  const providerId = normalizeProvider(
    env.AI_PROVIDER?.trim() || stringValue(routing.provider) || 'gemini',
  );

  return {
    providerId,
    killSwitch: row?.ai_kill_switch === true,
    featureFlags: parseFeatureFlags(row?.feature_flags),
    globalDailyCapMicroUsd: Number(row?.global_daily_cap_micro_usd ?? 5_000_000),
    models,
    fallbacks: {
      text: stringArray(fallbacks.text).length
        ? stringArray(fallbacks.text)
        : stringArray(routing.text_fallbacks),
      vision: stringArray(fallbacks.vision).length
        ? stringArray(fallbacks.vision)
        : stringArray(routing.vision_fallbacks),
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
  if (value === 'gemini' || value === 'fake') return value;
  throw providerError('The configured AI provider is not supported.');
}

function parseFeatureFlags(value: Record<string, unknown> | null | undefined): Record<string, boolean> {
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
