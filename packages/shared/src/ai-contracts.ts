import { z } from 'zod';

/**
 * Wire contracts for the AI Edge Functions.
 *
 * These schemas are the single source of truth for both the web/mobile clients
 * and the Deno gateway. The gateway uses them for request validation and for
 * validating model output before it is persisted or returned.
 */

export const AI_LOCALES = ['en', 'tr', 'fa', 'ar', 'es'] as const;
export type AILocale = (typeof AI_LOCALES)[number];

export const AI_PROVIDERS = ['gemini', 'fake'] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];

export const AI_FEATURES = [
  'suggestions',
  'recipe',
  'chat',
  'stream',
  'scan',
  'substitution',
] as const;
export type AIFeature = (typeof AI_FEATURES)[number];

export const AI_ERROR_CODES = [
  'unauthorized',
  'bad_request',
  'origin_not_allowed',
  'payload_too_large',
  'quota_exceeded',
  'rate_limited',
  'ai_disabled',
  'ai_budget_exhausted',
  'provider_error',
  'invalid_model_output',
  'duplicate_request',
  'internal_error',
] as const;
export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

export const AI_LIMITS = {
  maxIngredients: 50,
  maxIngredientLength: 60,
  maxRecipeNameLength: 120,
  maxMessageLength: 4_000,
  maxHistoryMessages: 12,
  maxDietaryPreferences: 12,
  maxDietaryPreferenceLength: 40,
  maxChatContextJsonLength: 12_000,
  maxScanItems: 30,
  maxSubstitutes: 6,
  maxJsonBodyBytes: 64 * 1024,
  maxScanBodyBytes: 20 * 1024 * 1024,
  cacheTtlSeconds: 7 * 24 * 60 * 60,
  idempotencyTtlSeconds: 24 * 60 * 60,
} as const;

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

const localeSchema = z.enum(AI_LOCALES).default('en');

const providerSchema = z.enum(AI_PROVIDERS).optional();

const baseRequestFields = {
  /** User-facing language. `language` is kept as an alias for the existing web client. */
  locale: localeSchema.optional(),
  language: localeSchema.optional(),
  provider: providerSchema,
  model: trimmedString(80).optional(),
  /** Ask the gateway to skip a cache read (the new response is still cached). */
  force_refresh: z.boolean().optional().default(false),
  /** Ask for an NDJSON response instead of one JSON object. */
  stream: z.boolean().optional().default(false),
  servings: z.number().int().min(1).max(24).optional().default(4),
  dietary: z
    .array(trimmedString(AI_LIMITS.maxDietaryPreferenceLength))
    .max(AI_LIMITS.maxDietaryPreferences)
    .optional()
    .default([]),
  /** 0 = familiar, 1 = a little adventurous, 2 = surprising, 3 = wild. */
  surprise: z.number().int().min(0).max(3).optional().default(0),
  surprise_level: z.number().int().min(0).max(3).optional(),
};

const ingredientListSchema = z
  .array(trimmedString(AI_LIMITS.maxIngredientLength))
  .min(1)
  .max(AI_LIMITS.maxIngredients);

const recipeContextSchema = z
  .union([
    z.string().max(8_000),
    z.array(z.unknown()).max(40),
    z.record(z.string(), z.unknown()),
  ])
  .superRefine((value, ctx) => {
    if (JSON.stringify(value ?? null).length > AI_LIMITS.maxChatContextJsonLength) {
      ctx.addIssue({
        code: 'custom',
        message: `Recipe context must be at most ${AI_LIMITS.maxChatContextJsonLength} JSON characters.`,
      });
    }
  })
  .optional();

const historySchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant', 'human', 'chef']),
      content: z.string().max(2_000),
    }),
  )
  .max(AI_LIMITS.maxHistoryMessages)
  .optional()
  .default([]);

const suggestionsRequestSchema = z.object({
  mode: z.literal('suggestions'),
  ingredients: ingredientListSchema,
  ...baseRequestFields,
});

const detailRequestSchema = z.object({
  mode: z.literal('detail'),
  recipe_name: trimmedString(AI_LIMITS.maxRecipeNameLength),
  ...baseRequestFields,
});

const chatRequestSchema = z.object({
  mode: z.literal('chat'),
  recipe_name: trimmedString(AI_LIMITS.maxRecipeNameLength),
  message: trimmedString(AI_LIMITS.maxMessageLength),
  ingredients: recipeContextSchema,
  instructions: recipeContextSchema,
  history: historySchema,
  ...baseRequestFields,
});

const streamRequestSchema = z.object({
  mode: z.literal('stream'),
  recipe_name: trimmedString(AI_LIMITS.maxRecipeNameLength),
  ingredients: ingredientListSchema.optional(),
  ...baseRequestFields,
});

export const generateRecipeRequestSchema = z.discriminatedUnion('mode', [
  suggestionsRequestSchema,
  detailRequestSchema,
  chatRequestSchema,
  streamRequestSchema,
]);

export type GenerateRecipeRequest = z.infer<typeof generateRecipeRequestSchema>;

export const scanPantryRequestSchema = z.object({
  /** Base64 payload without a data-URL prefix. `image_base64` is an alias. */
  image: z.string().min(32).optional(),
  image_base64: z.string().min(32).optional(),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional().default('image/jpeg'),
  language: localeSchema.optional(),
  locale: localeSchema.optional(),
  min_confidence: z.number().min(0).max(1).optional().default(0.5),
  max_items: z.number().int().min(1).max(AI_LIMITS.maxScanItems).optional().default(25),
});

export type ScanPantryRequest = z.infer<typeof scanPantryRequestSchema>;

export const substitutionRequestSchema = z.object({
  recipe_name: trimmedString(AI_LIMITS.maxRecipeNameLength).optional(),
  missing_ingredient: trimmedString(AI_LIMITS.maxIngredientLength),
  available_ingredients: z
    .array(trimmedString(AI_LIMITS.maxIngredientLength))
    .max(AI_LIMITS.maxIngredients)
    .optional()
    .default([]),
  dietary: z
    .array(trimmedString(AI_LIMITS.maxDietaryPreferenceLength))
    .max(AI_LIMITS.maxDietaryPreferences)
    .optional()
    .default([]),
  language: localeSchema.optional(),
  locale: localeSchema.optional(),
  provider: providerSchema,
  model: trimmedString(80).optional(),
  force_refresh: z.boolean().optional().default(false),
});

export type SubstitutionRequest = z.infer<typeof substitutionRequestSchema>;

const difficultySchema = z.union([
  z.enum(['Easy', 'Medium', 'Hard']),
  trimmedString(20),
]);

export const suggestedDishSchema = z.object({
  name: trimmedString(120),
  short_description: trimmedString(600),
  cuisine: trimmedString(80),
  difficulty: difficultySchema,
  prep_time: trimmedString(40).optional(),
  image_hint: trimmedString(60).optional(),
  image: trimmedString(500).optional(),
  provider: trimmedString(30).optional(),
  model_used: trimmedString(80).optional(),
});

export const suggestedDishesSchema = z.array(suggestedDishSchema).min(1).max(8);

const instructionSchema = z.object({
  step: trimmedString(2_000),
  time_minutes: z.number().int().min(0).max(1_440).nullable().optional().default(null),
  chef_tip: trimmedString(600).nullable().optional().default(null),
});

export const recipeIngredientSchema = z.object({
  name: trimmedString(120),
  amount: trimmedString(40),
  unit: trimmedString(40),
});

export const recipeNutritionSchema = z.object({
  calories: trimmedString(40).optional(),
  protein: trimmedString(40).optional(),
  carbs: trimmedString(40).optional(),
  fat: trimmedString(40).optional(),
});

export const recipeDetailSchema = z.object({
  name: trimmedString(120),
  description: trimmedString(1_200),
  cuisine: trimmedString(80),
  difficulty: difficultySchema,
  time_minutes: z.number().int().min(0).max(1_440),
  servings: z.number().int().min(1).max(24).optional(),
  ingredients: z.array(recipeIngredientSchema).min(1).max(60),
  instructions: z
    .array(
      z.union([
        instructionSchema,
        z.string().trim().min(1).max(2_000).transform((step) => ({
          step,
          time_minutes: null,
          chef_tip: null,
        })),
      ]),
    )
    .min(1)
    .max(60),
  nutrition: recipeNutritionSchema.optional(),
  chef_tips: z.array(trimmedString(600)).max(8).optional().default([]),
  image: trimmedString(500).optional(),
  provider: trimmedString(30).optional(),
  model_used: trimmedString(80).optional(),
});

export type RecipeDetail = z.infer<typeof recipeDetailSchema>;

export const pantryScanItemSchema = z.object({
  name: trimmedString(120),
  display_name: trimmedString(120).optional(),
  category: trimmedString(60),
  confidence: z.number().min(0).max(1),
  estimated_quantity: trimmedString(80).nullable().optional().default(null),
  /** Server-side catalog mapping. Null means the user must confirm/edit it. */
  ingredient_id: z.number().int().positive().nullable().optional().default(null),
  slug: trimmedString(80).nullable().optional().default(null),
  matched: z.boolean().optional().default(false),
});

export const pantryScanItemsSchema = z
  .array(pantryScanItemSchema)
  .max(AI_LIMITS.maxScanItems);

export const substitutionResultSchema = z.object({
  missing_ingredient: trimmedString(120),
  substitutes: z
    .array(
      z.object({
        name: trimmedString(120),
        ratio: trimmedString(80),
        notes: trimmedString(400),
      }),
    )
    .min(1)
    .max(AI_LIMITS.maxSubstitutes),
  tip: trimmedString(600),
  disclaimer: trimmedString(300).optional(),
});

export type SubstitutionResult = z.infer<typeof substitutionResultSchema>;

export const usageSchema = z.object({
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cost_micro_usd: z.number().int().min(0),
});

export type AIUsage = z.infer<typeof usageSchema>;

export const usageSnapshotSchema = z.object({
  plan_id: z.string(),
  daily: z.record(
    z.string(),
    z.object({
      limit: z.number().int(),
      used: z.number().int().min(0),
      remaining: z.number().int().min(0).nullable(),
    }),
  ),
  monthly: z.object({
    budget_micro_usd: z.number().int(),
    used_micro_usd: z.number().int().min(0),
    remaining_micro_usd: z.number().int().min(0).nullable(),
  }),
  resets_at: z.string(),
});

export type UsageSnapshot = z.infer<typeof usageSnapshotSchema>;

export const ndjsonMetaSchema = z.object({
  type: z.literal('meta'),
  feature: z.string(),
  cached: z.boolean().optional().default(false),
  remaining: usageSnapshotSchema,
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const ndjsonDeltaSchema = z.object({
  type: z.literal('delta'),
  text: z.string(),
});

export const ndjsonFinalSchema = z.object({
  type: z.literal('final'),
  data: z.unknown(),
  usage: usageSchema,
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const ndjsonErrorSchema = z.object({
  type: z.literal('error'),
  code: z.enum(AI_ERROR_CODES),
  message: z.string(),
  resets_at: z.string().optional(),
  retry_after: z.number().int().min(0).optional(),
});

export const ndjsonEventSchema = z.discriminatedUnion('type', [
  ndjsonMetaSchema,
  ndjsonDeltaSchema,
  ndjsonFinalSchema,
  ndjsonErrorSchema,
]);

export type NDJSONEvent = z.infer<typeof ndjsonEventSchema>;

/**
 * Stable JSON used for cache keys: object keys are sorted recursively.
 * Arrays keep their order unless the caller sorts them first.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

/** Normalize ingredient names for cache keys and catalog matching. */
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
