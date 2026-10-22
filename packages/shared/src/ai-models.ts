/**
 * Curated OpenRouter models that are safe to expose in the client model
 * selector. Every entry is free (`openrouter/free` or a `:free` model id), so
 * choosing one never increases the AI budget. Paid models can still be routed
 * server-side with `OPENROUTER_MODEL` / `OPENROUTER_ALLOWED_MODELS`.
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
    displayName: 'Free Models Router',
    description: 'Automatically routes across free models',
  },
  {
    id: 'minimax/minimax-m3.1-flash:free',
    displayName: 'MiniMax M3.1 Flash',
    description: 'Fast free model with a large context window',
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    displayName: 'Nemotron 3.5 Super VL',
    description: 'Vision-language free model',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    displayName: 'Nemotron 3 Super',
    description: 'Large free model for detailed recipes',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    displayName: 'Gemma 4 31B',
    description: 'Google Gemma free model',
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    displayName: 'Gemma 4 26B A4B',
    description: 'Efficient Google Gemma free model',
  },
  {
    id: 'thinkingmachines/inkling:free',
    displayName: 'Inkling',
    description: 'Experimental free model',
  },
  {
    id: 'dots-studio/dots-3-note-preview:free',
    displayName: 'Dots3 Note Preview',
    description: 'Free preview model',
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    displayName: 'LFM2.5 2.6B',
    description: 'Small, fast free text model',
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
