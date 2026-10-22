import { isFreeOpenRouterModel } from '../../../packages/shared/src/ai-models.ts';
import type { ModelPrice, ProviderUsage } from './types.ts';
import type { DbClient } from './db.ts';
import { mapDatabaseError } from './errors.ts';

export function calculateCostMicroUsd(usage: ProviderUsage, price: ModelPrice): number {
  const input = Math.ceil((usage.input_tokens * price.input_micro_usd_per_million) / 1_000_000);
  const output = Math.ceil((usage.output_tokens * price.output_micro_usd_per_million) / 1_000_000);
  return Math.max(0, input + output);
}

export function estimateReserveMicroUsd(input: {
  price: ModelPrice;
  inputTokens: number;
  maxOutputTokens: number;
}): number {
  return calculateCostMicroUsd(
    { input_tokens: input.inputTokens, output_tokens: input.maxOutputTokens },
    input.price,
  );
}

export function usageWithTokenFallback(
  reported: ProviderUsage | undefined,
  fallback: ProviderUsage,
): ProviderUsage {
  return {
    input_tokens: Math.max(0, reported?.input_tokens ?? fallback.input_tokens),
    output_tokens: Math.max(0, reported?.output_tokens ?? fallback.output_tokens),
  };
}

/** Conservative output-token budget by feature. */
export const MAX_OUTPUT_TOKENS = {
  suggestions: 1_400,
  recipe: 2_400,
  chat: 1_200,
  stream: 2_200,
  scan: 1_200,
  substitution: 800,
} as const;

/**
 * OpenRouter model ids are selected at deploy time, so they cannot have a
 * hard-coded price row. Use an explicit env override when the model price is
 * known; otherwise fall back to a deliberately conservative estimate so the
 * monthly and global caps still apply. The defaults are USD 1 / USD 3 per 1M
 * input/output tokens.
 */
export const DEFAULT_OPENROUTER_INPUT_MICRO_USD_PER_MILLION = 1_000_000;
export const DEFAULT_OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION = 3_000_000;

export function localPrice(provider: string, model: string): ModelPrice {
  return {
    provider,
    model,
    input_micro_usd_per_million: 0,
    output_micro_usd_per_million: 0,
  };
}

export function openRouterPriceFromEnv(
  provider: string,
  model: string,
  env: Record<string, string | undefined>,
): ModelPrice | null {
  if (provider !== 'openrouter') return null;
  if (isFreeOpenRouterModel(model)) {
    return {
      provider,
      model,
      input_micro_usd_per_million: 0,
      output_micro_usd_per_million: 0,
    };
  }
  return {
    provider,
    model,
    input_micro_usd_per_million: nonNegativeNumber(
      env.OPENROUTER_INPUT_MICRO_USD_PER_MILLION,
      DEFAULT_OPENROUTER_INPUT_MICRO_USD_PER_MILLION,
    ),
    output_micro_usd_per_million: nonNegativeNumber(
      env.OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION,
      DEFAULT_OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION,
    ),
  };
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

interface PriceRow {
  provider: string;
  model: string;
  input_micro_usd_per_million: number;
  output_micro_usd_per_million: number;
}

export async function getActivePrice(
  db: DbClient,
  provider: string,
  model: string,
  now: Date,
): Promise<ModelPrice | null> {
  const { data, error } = await db
    .from('ai_model_prices')
    .select('provider, model, input_micro_usd_per_million, output_micro_usd_per_million')
    .eq('provider', provider)
    .eq('model', model)
    .eq('active', true)
    .lte('effective_from', now.toISOString())
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapDatabaseError(error.message, error);
  const row = data as PriceRow | null;
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    input_micro_usd_per_million: Number(row.input_micro_usd_per_million),
    output_micro_usd_per_million: Number(row.output_micro_usd_per_million),
  };
}
