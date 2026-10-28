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
  /** Provider that serves this model. The picker switches on this field. */
  provider: AIProviderId;
}

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  active: boolean;
  online?: boolean;
  badge: string;
}

export interface AICatalogResponse {
  default_provider: AIProviderId;
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
    config.models.suggestions ?? config.models.scan ?? (provider === 'fake' ? 'fake-1' : '');
  const models = catalogModels(config, lmStudio, currentModel);
  const allowOpenRouter = config.allowedProviders.includes('openrouter');

  if (provider === 'openrouter') {
    return {
      default_provider: 'openrouter',
      has_gemini: false,
      gemini_model: '',
      has_openrouter: true,
      openrouter_model: currentModel || config.openRouterModel || DEFAULT_OPENROUTER_MODEL,
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
      current_model: currentModel || config.openRouterModel || DEFAULT_OPENROUTER_MODEL,
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
  const providers: AIProviderInfo[] = [
    {
      // Fake is a demo engine, not a vendor. Keep reporting it through the
      // existing Gemini slot so the web client's provider union stays stable.
      id: 'gemini',
      name: isFake ? 'Demo AI' : 'Google Gemini',
      active: true,
      online: true,
      badge: isFake ? 'Demo' : 'Cloud AI',
    },
  ];
  if (allowOpenRouter) {
    providers.push({
      id: 'openrouter',
      name: 'OpenRouter',
      active: true,
      online: true,
      badge: 'Free AI',
    });
  }

  return {
    default_provider: 'gemini',
    has_gemini: true,
    gemini_model: currentModel,
    has_openrouter: allowOpenRouter,
    openrouter_model: allowOpenRouter ? config.openRouterModel : '',
    has_lmstudio: false,
    lmstudio_online: false,
    lmstudio_model: '',
    providers,
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
  const provider = config.providerId;

  if (provider === 'openrouter') {
    return unique([...config.allowedModels, currentModel || config.openRouterModel]).map((id) => ({
      ...openRouterModelInfo(id),
      provider: 'openrouter',
    }));
  }

  if (provider === 'lmstudio') {
    return unique([...lmStudio.models, ...config.allowedModels, currentModel]).map((id) => ({
      id,
      displayName: id,
      description: 'Local model served by LM Studio',
      provider: 'lmstudio',
    }));
  }

  if (provider === 'fake') {
    return [
      {
        id: currentModel || 'fake-1',
        displayName: currentModel || 'fake-1',
        description: 'Deterministic demo provider',
        provider: 'gemini',
      },
    ];
  }

  const models: AICatalogModel[] = unique([
    ...Object.values(config.models),
    ...config.fallbacks.text,
    ...config.fallbacks.vision,
    currentModel,
  ]).map((id) => ({
    id,
    displayName: id,
    description:
      id === currentModel ? 'Default Gemini model for every feature' : 'Gemini fallback model',
    provider: 'gemini',
  }));

  // Exactly one OpenRouter entry: the free model configured through
  // OPENROUTER_MODEL. The picker never lists the whole free router catalog.
  if (config.allowedProviders.includes('openrouter')) {
    const openRouterId = config.openRouterModel || DEFAULT_OPENROUTER_MODEL;
    if (!models.some((model) => model.id === openRouterId)) {
      models.push({ ...openRouterModelInfo(openRouterId), provider: 'openrouter' });
    }
  }

  return models;
}

function unique(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.map((value) => value?.trim() ?? '').filter((value) => value.length > 0)),
  ];
}
