/**
 * The single OpenRouter model exposed in the client model selector.
 *
 * The deploy selects it with `OPENROUTER_MODEL` (staging uses the free
 * `openrouter/free` router). We deliberately do not list the whole OpenRouter
 * free catalog: the picker should show exactly the model the operator chose.
 * Paid models can still be routed server-side with `OPENROUTER_MODEL`.
 */
export interface AIModelCatalogEntry {
  id: string;
  displayName: string;
  description: string;
}

export const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';

export const OPENROUTER_FREE_MODELS = [
  {
    id: DEFAULT_OPENROUTER_MODEL,
    displayName: 'OpenRouter Free',
    description: 'Free model configured by the server',
  },
] as const satisfies readonly AIModelCatalogEntry[];

export const OPENROUTER_FREE_MODEL_IDS = OPENROUTER_FREE_MODELS.map((model) => model.id);

/**
 * Free OpenRouter models are billed at $0. The gateway uses this to accept
 * client-selected free models without allowing arbitrary paid models.
 */
export function isFreeOpenRouterModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === DEFAULT_OPENROUTER_MODEL || normalized.endsWith(':free');
}

export function openRouterModelInfo(model: string): AIModelCatalogEntry {
  const normalized = model.trim();
  const match = OPENROUTER_FREE_MODELS.find((entry) => entry.id === normalized);
  if (match) return match;
  return {
    id: normalized,
    displayName: normalized,
    description: isFreeOpenRouterModel(normalized) ? 'Free OpenRouter model' : 'OpenRouter model',
  };
}
