import type { AIProviderId } from '../../../packages/shared/src/ai-contracts.ts';
import {
  DEFAULT_OPENROUTER_MODEL,
  openRouterModelInfo,
} from '../../../packages/shared/src/ai-models.ts';
import type { RuntimeConfig } from './types.ts';

export interface AICatalogModel {
  id: string;
  displayName: string;
  description: string;
}

export interface AIProviderInfo {
  id: AIProviderId | 'gemini';
  name: string;
  active: boolean;
  online?: boolean;
  badge: string;
}

export interface AICatalogResponse {
  default_provider: AIProviderId | 'gemini';
  has_gemini: boolean;
  gemini_model: string;
  has_openrouter: boolean;
  openrouter_model: string;
  has_lmstudio: boolean;
  lmstudio_online: boolean;
  lmstudio_model: string;
  providers: AIProviderInfo[];
  models: AICatalogModel[];
  current_model: string;
  is_live: boolean;
}

export interface LMStudioStatus {
  online: boolean;
  models: string[];
}

export function buildAICatalog(config: RuntimeConfig, lmStudio: LMStudioStatus): AICatalogResponse {
  const provider = config.providerId;
  const currentModel =
    config.models.suggestions ??
    config.models.scan ??
    (provider === 'fake' ? 'fake-1' : '');
  const models = catalogModels(config, lmStudio, currentModel);

  if (provider === 'openrouter') {
    return {
      default_provider: 'openrouter',
      has_gemini: false,
      gemini_model: '',
      has_openrouter: true,
      openrouter_model: currentModel || DEFAULT_OPENROUTER_MODEL,
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
      models,
      current_model: currentModel || DEFAULT_OPENROUTER_MODEL,
      is_live: true,
    };
  }

  if (provider === 'lmstudio') {
    return {
      default_provider: 'lmstudio',
      has_gemini: false,
      gemini_model: '',
      has_openrouter: false,
      openrouter_model: '',
      has_lmstudio: true,
      lmstudio_online: lmStudio.online,
      lmstudio_model: currentModel,
      providers: [
        {
          id: 'lmstudio',
          name: 'LM Studio',
          active: true,
          online: lmStudio.online,
          badge: 'Local AI',
        },
      ],
      models,
      current_model: currentModel,
      is_live: lmStudio.online,
    };
  }

  const isFake = provider === 'fake';
  return {
    default_provider: 'gemini',
    has_gemini: true,
    gemini_model: currentModel,
    has_openrouter: false,
    openrouter_model: '',
    has_lmstudio: false,
    lmstudio_online: false,
    lmstudio_model: '',
    providers: [
      {
        id: 'gemini',
        name: isFake ? 'Demo AI' : 'Google Gemini',
        active: true,
        online: true,
        badge: isFake ? 'Demo' : 'Cloud AI',
      },
    ],
    models,
    current_model: currentModel,
    is_live: !isFake,
  };
}

export async function readLMStudioStatus(
  baseUrl: string,
  apiKey?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LMStudioStatus> {
  const headers: Record<string, string> = {};
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers,
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return { online: false, models: [] };
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(payload.data)
      ? payload.data
          .map((entry) => (typeof entry.id === 'string' ? entry.id.trim() : ''))
          .filter(Boolean)
      : [];
    return { online: true, models };
  } catch {
    return { online: false, models: [] };
  }
}

function catalogModels(
  config: RuntimeConfig,
  lmStudio: LMStudioStatus,
  currentModel: string,
): AICatalogModel[] {
  const ids =
    config.providerId === 'openrouter'
      ? config.allowedModels
      : config.providerId === 'lmstudio'
        ? [...lmStudio.models, ...config.allowedModels, currentModel]
        : config.providerId === 'fake'
          ? [currentModel || 'fake-1']
          : [
              ...Object.values(config.models),
              ...config.fallbacks.text,
              ...config.fallbacks.vision,
              currentModel,
            ];

  return unique(ids).map((id) => {
    if (config.providerId === 'openrouter') return openRouterModelInfo(id);
    if (config.providerId === 'lmstudio') {
      return {
        id,
        displayName: id,
        description: 'Local model served by LM Studio',
      };
    }
    return {
      id,
      displayName: id,
      description: config.providerId === 'fake' ? 'Deterministic demo provider' : 'Gemini model',
    };
  });
}

function unique(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim() ?? '')
        .filter((value) => value.length > 0),
    ),
  ];
}
