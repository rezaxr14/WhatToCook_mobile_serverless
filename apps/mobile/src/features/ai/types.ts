/** Wire types for the AI gateway, kept in sync with `packages/shared/src/ai-contracts.ts`. */

export interface AIUsageSnapshot {
  plan_id: string;
  daily: Record<string, { limit: number; used: number; remaining: number | null }>;
  monthly: {
    budget_micro_usd: number;
    used_micro_usd: number;
    remaining_micro_usd: number | null;
  };
  resets_at: string;
}

export interface AISuggestedDish {
  name: string;
  short_description: string;
  cuisine: string;
  difficulty: string;
  prep_time?: string;
  image_hint?: string;
  image?: string;
  provider?: string;
  model_used?: string;
}

export interface AIRecipeIngredient {
  name: string;
  amount: string;
  unit: string;
}

export interface AIRecipeInstruction {
  step: string;
  time_minutes?: number | null;
  chef_tip?: string | null;
}

export interface AIRecipeDetail {
  name: string;
  description: string;
  cuisine: string;
  difficulty: string;
  time_minutes: number;
  servings?: number;
  ingredients: AIRecipeIngredient[];
  instructions: AIRecipeInstruction[];
  nutrition?: {
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
  };
  chef_tips?: string[];
  image?: string;
  provider?: string;
  model_used?: string;
  cached?: boolean;
  remaining?: AIUsageSnapshot;
}

export interface AISuggestionsResponse {
  status: 'done';
  recipes: AISuggestedDish[];
  cached?: boolean;
  provider?: string;
  model?: string;
  model_used?: string;
  remaining?: AIUsageSnapshot;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIChatResponse {
  reply: string;
  recipe_name: string;
  model_used?: string;
  remaining?: AIUsageSnapshot;
}

export interface AIScanItem {
  name: string;
  display_name?: string;
  category: string;
  confidence: number;
  estimated_quantity?: string | null;
  ingredient_id?: number | null;
  slug?: string | null;
  matched: boolean;
}

export interface AIScanResponse {
  status: 'done';
  items: AIScanItem[];
  detected_count: number;
  matched_count: number;
  cached?: boolean;
  provider?: string;
  model_used?: string;
  remaining?: AIUsageSnapshot;
}

export interface AISubstitutionResult {
  status: 'done';
  missing_ingredient: string;
  substitutes: Array<{ name: string; ratio: string; notes: string }>;
  tip: string;
  disclaimer?: string;
  cached?: boolean;
  model_used?: string;
  remaining?: AIUsageSnapshot;
}

export interface AIModelOption {
  id: string;
  displayName: string;
  description: string;
  provider?: string;
}

export interface AIProviderOption {
  id: string;
  name: string;
  active: boolean;
  online?: boolean;
  badge: string;
}

export interface AICatalogResponse {
  default_provider: string;
  providers: AIProviderOption[];
  models: AIModelOption[];
  current_model: string;
  is_live: boolean;
  provider?: string;
}
