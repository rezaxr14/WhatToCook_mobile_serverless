import { DEFAULT_OPENROUTER_MODEL, OPENROUTER_FREE_MODELS } from '@whattocook/shared';

import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';

import type {
  AICatalogResponse,
  AIChatMessage,
  AIChatResponse,
  AIRecipeDetail,
  AIRecipeInstruction,
  AIScanResponse,
  AISuggestionsResponse,
  AISubstitutionResult,
  AIUsageSnapshot,
} from './types';

/**
 * AI gateway client.
 *
 * Every request goes through the Supabase Edge Functions, so provider keys
 * never reach the device. Errors are normalised into readable messages and the
 * not-deployed case is translated into a friendly "not connected" notice.
 */

export class AIRequestError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code = 'provider_error', status?: number) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
    this.status = status;
  }
}

function language(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

function isResponse(value: unknown): value is Response {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { json?: unknown }).json === 'function' &&
    typeof (value as { status?: unknown }).status === 'number'
  );
}

async function invokeAi<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const context = (error as { context?: unknown }).context;
    const status = isResponse(context) ? context.status : undefined;
    let message: string | undefined;
    let code = 'provider_error';

    if (isResponse(context)) {
      try {
        const payload = (await context.json()) as { message?: string; error?: string; code?: string };
        message = payload.message ?? payload.error;
        code = payload.code ?? code;
      } catch {
        // The body was empty or not JSON; fall back to the SDK message.
      }
    }

    if (!status || status === 404 || status === 501) {
      throw new AIRequestError(i18n.t('mobile.ai.notConnected'), 'ai_not_ready', status);
    }
    if (status === 401) {
      throw new AIRequestError(
        message ?? i18n.t('mobile.common.error'),
        'unauthorized',
        status,
      );
    }
    if (status === 429) {
      throw new AIRequestError(
        message ?? i18n.t('mobile.ai.noQuota'),
        code === 'quota_exceeded' ? code : 'rate_limited',
        status,
      );
    }
    throw new AIRequestError(
      message ?? error.message ?? i18n.t('mobile.common.error'),
      code,
      status,
    );
  }

  const payload = data as { error?: string; message?: string } | null;
  if (payload?.error) {
    throw new AIRequestError(payload.message ?? payload.error, payload.error);
  }
  return data as T;
}

/** Normalise model output where instructions may be strings or objects. */
function normaliseInstructions(
  input: Array<AIRecipeInstruction | string> | undefined,
): AIRecipeInstruction[] {
  return (input ?? [])
    .map((entry) =>
      typeof entry === 'string'
        ? { step: entry, time_minutes: null, chef_tip: null }
        : {
            step: entry.step,
            time_minutes: entry.time_minutes ?? null,
            chef_tip: entry.chef_tip ?? null,
          },
    )
    .filter((entry) => entry.step.trim().length > 0);
}

function normaliseDetail(detail: AIRecipeDetail): AIRecipeDetail {
  return {
    ...detail,
    instructions: normaliseInstructions(detail.instructions),
    ingredients: detail.ingredients ?? [],
    chef_tips: detail.chef_tips ?? [],
  };
}

function staticCatalog(): AICatalogResponse {
  return {
    default_provider: 'openrouter',
    providers: [{ id: 'openrouter', name: 'OpenRouter', active: true, online: true, badge: 'Cloud AI' }],
    models: OPENROUTER_FREE_MODELS.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
    })),
    current_model: DEFAULT_OPENROUTER_MODEL,
    is_live: true,
    provider: 'openrouter',
  };
}

let catalogPromise: Promise<AICatalogResponse> | null = null;

/**
 * The `ai-models` function is optional (staging may not have it yet). When it
 * is missing we fall back to the shared free-model catalog so the selector and
 * the suggestion flow keep working.
 */
export function fetchAiCatalog(): Promise<AICatalogResponse> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-models', { method: 'POST' });
        if (error) return staticCatalog();
        const catalog = data as Partial<AICatalogResponse> | null;
        if (!catalog?.default_provider || !Array.isArray(catalog.models)) return staticCatalog();
        return {
          ...staticCatalog(),
          ...catalog,
          models: catalog.models,
          providers: catalog.providers ?? staticCatalog().providers,
        };
      } catch {
        return staticCatalog();
      }
    })();
  }
  return catalogPromise;
}

export interface SuggestionsInput {
  ingredients: string[];
  dietary?: string[];
  servings?: number;
  surprise?: number;
  model?: string;
  forceRefresh?: boolean;
}

export async function generateSuggestions(
  input: SuggestionsInput,
): Promise<AISuggestionsResponse> {
  const response = await invokeAi<AISuggestionsResponse & { recipes?: AISuggestionsResponse['recipes'] }>(
    'generate-recipe',
    {
      mode: 'suggestions',
      ingredients: input.ingredients,
      dietary: input.dietary ?? [],
      servings: input.servings ?? 4,
      surprise: input.surprise ?? 0,
      model: input.model || undefined,
      force_refresh: input.forceRefresh ?? false,
      language: language(),
      locale: language(),
    },
  );

  if (!Array.isArray(response.recipes) || response.recipes.length === 0) {
    throw new AIRequestError(i18n.t('mobile.ai.error'), 'invalid_model_output');
  }
  return response as AISuggestionsResponse;
}

export async function fetchRecipeDetail(
  recipeName: string,
  model?: string,
  servings = 4,
): Promise<AIRecipeDetail> {
  const response = await invokeAi<AIRecipeDetail>('generate-recipe', {
    mode: 'detail',
    recipe_name: recipeName,
    servings,
    model: model || undefined,
    language: language(),
    locale: language(),
  });
  return normaliseDetail(response);
}

export async function sendRecipeChat(input: {
  recipeName: string;
  message: string;
  ingredients: string[];
  instructions: string[];
  history: AIChatMessage[];
  model?: string;
}): Promise<AIChatResponse> {
  return invokeAi<AIChatResponse>('generate-recipe', {
    mode: 'chat',
    recipe_name: input.recipeName,
    message: input.message,
    ingredients: input.ingredients.slice(0, 40),
    instructions: input.instructions.slice(0, 40),
    history: input.history.slice(-12).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2_000),
    })),
    model: input.model || undefined,
    language: language(),
    locale: language(),
  });
}

export async function scanPantryImage(input: {
  base64: string;
  mimeType: string;
  minConfidence?: number;
  model?: string;
}): Promise<AIScanResponse> {
  return invokeAi<AIScanResponse>('scan-pantry', {
    image: input.base64,
    mime_type: input.mimeType,
    min_confidence: input.minConfidence ?? 0.45,
    max_items: 25,
    model: input.model || undefined,
    language: language(),
    locale: language(),
  });
}

export async function fetchSubstitutes(input: {
  missingIngredient: string;
  recipeName?: string;
  availableIngredients?: string[];
  dietary?: string[];
}): Promise<AISubstitutionResult> {
  return invokeAi<AISubstitutionResult>('suggest-substitution', {
    missing_ingredient: input.missingIngredient,
    recipe_name: input.recipeName,
    available_ingredients: input.availableIngredients ?? [],
    dietary: input.dietary ?? [],
    language: language(),
    locale: language(),
  });
}

/** Current plan usage, used for the remaining-requests badge. */
export async function fetchUsage(): Promise<AIUsageSnapshot | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_usage');
    if (error || !data || typeof data !== 'object') return null;
    const payload = data as Partial<AIUsageSnapshot>;
    if (!payload.daily || !payload.monthly) return null;
    return payload as AIUsageSnapshot;
  } catch {
    return null;
  }
}
