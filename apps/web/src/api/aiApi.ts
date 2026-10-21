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

const AI_NOT_READY_MESSAGE =
  'The AI kitchen is being connected in milestone M4. Catalog browsing, pantry matching, recipe details and grocery lists already work.';

function aiNotReady(): ApiError {
  return new ApiError(AI_NOT_READY_MESSAGE, 503, null, 'ai_not_ready');
}

function language(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

async function invokeAi<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new ApiError(
      'Supabase is not configured. Set apps/web/.env.local first.',
      503,
      null,
      'supabase_not_configured',
    );
  }

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (!status || status === 404 || status === 501) throw aiNotReady();
    throw toApiError(error, fallback);
  }
  return data as T;
}

/**
 * The reference app exposed Django AI endpoints. The serverless port uses
 * three Edge Functions (`generate-recipe`, `scan-pantry`,
 * `suggest-substitution`). The UI is ported now; these calls will stay in a
 * friendly not-connected state until M4 deploys the gateway.
 */
export const aiApi = {
  getProviders: async (): Promise<AIProvidersResponse> => ({
    default_provider: 'gemini',
    has_gemini: true,
    gemini_model: 'gemini-3.5-flash-lite',
    has_lmstudio: false,
    lmstudio_online: false,
    lmstudio_model: '',
    providers: [
      {
        id: 'gemini',
        name: 'Google Gemini',
        active: true,
        online: true,
        badge: 'Cloud AI',
      },
    ],
  }),

  getModels: async (): Promise<AIModelsResponse> => ({
    models: [
      {
        id: 'gemini-3.5-flash-lite',
        displayName: 'Gemini 3.5 Flash Lite',
        description: 'Fast, economical suggestions',
      },
      {
        id: 'gemini-3.5-flash',
        displayName: 'Gemini 3.5 Flash',
        description: 'Balanced quality and speed',
      },
      {
        id: 'gemini-3.1-pro',
        displayName: 'Gemini 3.1 Pro',
        description: 'Best for detailed recipes',
      },
    ],
    current_model: 'gemini-3.5-flash-lite',
    is_live: true,
  }),

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
    error: AI_NOT_READY_MESSAGE,
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
