import { DEFAULT_OPENROUTER_MODEL, OPENROUTER_FREE_MODELS } from '@whattocook/shared';
import i18n from '../i18n';
import { ApiError, toApiError } from './client';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type {
  AIRecipeDetail,
  AIProvider,
  AIProvidersResponse,
  RecipeChatRequest,
  RecipeChatResponse,
  AIModelsResponse,
} from '../types/ai';
import type { AISuggestedDish } from '../types/ai';

export interface AISuggestionsResponse {
  status: 'done' | 'processing' | 'pending' | 'error';
  error?: string;
  recipes?: AISuggestedDish[];
  task_id?: string;
  cached?: boolean;
  provider?: string;
  model?: string;
  model_used?: string;
  rate_limited_models?: string[];
}

export interface AIModelOption {
  id: string;
  displayName: string;
  description?: string;
}

const AI_UNAVAILABLE_MESSAGE =
  'The AI kitchen is unavailable right now. Please try again in a moment.';

function aiNotReady(): ApiError {
  return new ApiError(AI_UNAVAILABLE_MESSAGE, 503, null, 'ai_not_ready');
}

function language(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

/**
 * AI functions require an authenticated caller (the Edge Function enforces it).
 * Visitors can try the studio without creating an account: start the anonymous
 * guest session the first time an AI request is made. Provider API keys still
 * live only in Supabase secrets.
 */
async function ensureSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { locale: language() } },
  });
  if (error) {
    throw toApiError(error, 'Could not start a guest AI session. Please try again.');
  }
}

async function invokeAi<T>(
  name: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new ApiError(
      'Supabase is not configured. Set apps/web/.env.local first.',
      503,
      null,
      'supabase_not_configured',
    );
  }

  await ensureSession();

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (!status || status === 404 || status === 501) throw aiNotReady();
    throw toApiError(error, fallback);
  }
  return data as T;
}

interface AICatalogResponse extends AIProvidersResponse, AIModelsResponse {}

/**
 * Static fallback used when the `ai-models` function is not deployed. The
 * gateway owns provider/model routing; the selector only offers free OpenRouter
 * models, so a client choice can never increase the AI budget.
 */
function staticCatalog(): AICatalogResponse {
  return {
    default_provider: 'openrouter',
    has_gemini: false,
    gemini_model: '',
    has_openrouter: true,
    openrouter_model: DEFAULT_OPENROUTER_MODEL,
    has_lmstudio: false,
    lmstudio_online: false,
    lmstudio_model: '',
    providers: [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        active: true,
        online: true,
        badge: 'Cloud AI',
      },
    ],
    models: OPENROUTER_FREE_MODELS.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      provider: 'openrouter',
    })),
    current_model: DEFAULT_OPENROUTER_MODEL,
    is_live: true,
    provider: 'openrouter',
  };
}

let catalogPromise: Promise<AICatalogResponse | null> | null = null;

/**
 * Fetch the server-owned provider/model catalog once per session. Provider API
 * keys stay server-side; the response only reports the active provider, the
 * local LM Studio state, and the models the client may request.
 */
async function fetchCatalog(): Promise<AICatalogResponse> {
  if (!isSupabaseConfigured) return staticCatalog();
  if (!catalogPromise) {
    catalogPromise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-models', { method: 'POST' });
        if (error) return null;
        const catalog = data as Partial<AICatalogResponse> | null;
        if (!catalog?.default_provider || !Array.isArray(catalog.models)) return null;
        return catalog as AICatalogResponse;
      } catch {
        return null;
      }
    })();
  }
  return (await catalogPromise) ?? staticCatalog();
}

/**
 * Catalog metadata for the model selector, served by the `ai-models` function.
 */
export const aiApi = {
  getProviders: async (): Promise<AIProvidersResponse> => {
    const {
      models: _models,
      current_model: _currentModel,
      is_live: _isLive,
      provider: _provider,
      ...providers
    } = await fetchCatalog();
    return providers;
  },

  getModels: async (): Promise<AIModelsResponse> => {
    const catalog = await fetchCatalog();
    return {
      models: catalog.models,
      current_model: catalog.current_model,
      is_live: catalog.is_live,
      provider: catalog.default_provider,
    };
  },

  getSuggestions: async (payload?: {
    ingredients?: string[];
    provider?: AIProvider;
    model?: string;
    force_refresh?: boolean;
    language?: string;
  }): Promise<AISuggestionsResponse> => {
    return invokeAi<AISuggestionsResponse>(
      'generate-recipe',
      {
        mode: 'suggestions',
        ...payload,
        language: payload?.language ?? language(),
        locale: payload?.language ?? language(),
      },
      'Could not generate AI suggestions.',
    );
  },

  pollTaskStatus: async (_taskId: string): Promise<AISuggestionsResponse> => ({
    status: 'error',
    error: AI_UNAVAILABLE_MESSAGE,
  }),

  getRecipeDetail: async (
    recipeName: string,
    provider?: AIProvider,
    model?: string,
    lang?: string,
  ): Promise<AIRecipeDetail & { model_used?: string; rate_limited_models?: string[] }> => {
    return invokeAi(
      'generate-recipe',
      {
        mode: 'detail',
        recipe_name: recipeName,
        provider,
        model,
        language: lang ?? language(),
        locale: lang ?? language(),
      },
      'Could not generate that AI recipe.',
    );
  },

  askRecipeChat: async (payload: RecipeChatRequest): Promise<RecipeChatResponse> => {
    return invokeAi(
      'generate-recipe',
      { mode: 'chat', ...payload, language: payload.language ?? language() },
      'The AI sous-chef is unavailable right now.',
    );
  },
};
