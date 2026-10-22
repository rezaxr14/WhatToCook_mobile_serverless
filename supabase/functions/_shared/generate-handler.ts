import {
  AI_LIMITS,
  generateRecipeRequestSchema,
  recipeDetailSchema,
  suggestedDishesSchema,
  type GenerateRecipeRequest,
} from '../../../packages/shared/src/ai-contracts.ts';
import { checkCors } from './cors.ts';
import { badRequest, invalidModelOutput } from './errors.ts';
import {
  buildProviderRequest,
  cacheKeyFor,
  ensureNotIdempotentDuplicate,
  errorResponse,
  featureForMode,
  idempotencyKeyFor,
  loadRequestContext,
  modelFor,
  outputBudget,
  preflight,
  priceFor,
  providerFor,
  readGenerationCache,
  recordCacheHit,
  refundQuietly,
  reserveUsage,
  resolveLocale,
  settleUsage,
  usageSnapshot,
  writeGenerationCache,
  writeIdempotencyCache,
  zeroUsage,
  assertFeature,
  type CachedGeneration,
} from './gateway.ts';
import { estimateInputTokens, jsonResponse, readJsonBody } from './http.ts';
import { ndjsonResponse, writeDelta } from './ndjson.ts';
import { estimateReserveMicroUsd, usageWithTokenFallback } from './prices.ts';
import {
  applyLanguage,
  chatPrompt,
  chatSystem,
  detailPrompt,
  suggestionsPrompt,
  streamPrompt,
} from './prompts.ts';
import type {
  AIProvider,
  AuthContext,
  GatewayDeps,
  ProviderRequest,
  ProviderResult,
  RuntimeConfig,
  UsageSnapshot,
} from './types.ts';
import {
  generateValidated,
  normalizeRecipeDetail,
  normalizeSuggestions,
  sanitizeText,
} from './validation.ts';

interface PromptBundle {
  prompt: string;
  system: string;
}

interface GeneratedPayload {
  data: unknown;
  providerResult: ProviderResult;
}

export async function handleGenerateRecipe(
  request: Request,
  deps: GatewayDeps,
): Promise<Response> {
  const pre = await preflight(request, deps);
  if (pre) return pre;

  let cors = checkCors(request, deps.allowedOrigins()).headers;
  try {
    const context = await loadRequestContext(request, deps);
    if (context instanceof Response) return context;
    const { auth, config, cors: contextCors } = context;
    cors = contextCors;

    const body = await readJsonBody(request, AI_LIMITS.maxJsonBodyBytes);
    const parsed = generateRecipeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid generate-recipe request.', parsed.error.issues);
    }
    const input = parsed.data;
    const feature = featureForMode(input.mode);
    assertFeature(config, feature);
    const locale = resolveLocale(auth, input);
    const provider = providerFor(deps, config);
    const model = modelFor(config, feature);
    const prompt = buildPrompt(input, locale);
    const idempotency = await idempotencyKeyFor(
      auth.userId,
      request.headers.get('idempotency-key'),
    );

    const idempotentHit = await readGenerationCache(deps, idempotency.key);
    if (idempotentHit) {
      const started = performance.now();
      await recordCacheHit(deps, auth, {
        requestId: idempotency.requestId,
        feature,
        provider: idempotentHit.provider || provider.id,
        model: idempotentHit.model || model,
        latencyMs: Math.round(performance.now() - started),
      });
      const remaining = await usageSnapshot(deps, auth);
      if (input.stream) {
        return streamCached(
          request,
          cors,
          input,
          feature,
          remaining,
          idempotentHit,
        );
      }
      return jsonResponse(
        buildJsonResponse(input, feature, idempotentHit, {
          cached: true,
          duplicate: true,
          usage: zeroUsage(),
          remaining,
        }),
        200,
        cors,
      );
    }

    const payload = cachePayload(input, locale);
    const key = await cacheKeyFor({
      feature,
      provider: provider.id,
      model,
      locale,
      payload,
    });

    if (!input.force_refresh) {
      const hit = await readGenerationCache(deps, key);
      if (hit) {
        const started = performance.now();
        await deps.cache.touch(key).catch(() => undefined);
        await recordCacheHit(deps, auth, {
          requestId: idempotency.requestId,
          feature,
          provider: hit.provider || provider.id,
          model: hit.model || model,
          latencyMs: Math.round(performance.now() - started),
        });
        const remaining = await usageSnapshot(deps, auth);
        if (input.stream) {
          return streamCached(request, cors, input, feature, remaining, hit);
        }
        return jsonResponse(
          buildJsonResponse(input, feature, hit, {
            cached: true,
            duplicate: false,
            usage: zeroUsage(),
            remaining,
          }),
          200,
          cors,
        );
      }
    }

    const price = await priceFor(deps, provider.id, model);
    const reserveEstimate = estimateReserveMicroUsd({
      price,
      inputTokens: estimateInputTokens(`${prompt.system}\n${prompt.prompt}`),
      maxOutputTokens: outputBudget(feature),
    });
    const reserve = await reserveUsage(deps, auth, {
      requestId: idempotency.requestId,
      feature,
      estimateMicroUsd: reserveEstimate,
      provider: provider.id,
      model,
    });
    ensureNotIdempotentDuplicate(reserve);
    let initialRemaining: UsageSnapshot;
    try {
      initialRemaining = await usageSnapshot(deps, auth);
    } catch (error) {
      await refundQuietly(deps, reserve.eventId, error);
      throw error;
    }

    if (input.stream) {
      return streamGenerated(request, cors, {
        deps,
        auth,
        config,
        input,
        feature,
        locale,
        provider,
        model,
        prompt,
        key,
        idempotencyKey: idempotency.key,
        eventId: reserve.eventId,
        remaining: initialRemaining,
      });
    }

    let settled = false;
    try {
      const generated = await generatePayload(input, feature, provider, prompt, locale, model);
      const cached: CachedGeneration = {
        data: generated.data,
        model: generated.providerResult.model,
        provider: generated.providerResult.provider,
        rate_limited_models: generated.providerResult.rate_limited_models,
      };
      await writeIdempotencyCache(deps, idempotency.key, feature, cached);
      const usage = usageWithTokenFallback(generated.providerResult.usage, {
        input_tokens: estimateInputTokens(`${prompt.system}\n${prompt.prompt}`),
        output_tokens: 0,
      });
      const cost = await settleUsage(deps, {
        eventId: reserve.eventId,
        provider: generated.providerResult.provider,
        model: generated.providerResult.model,
        usage,
      });
      settled = true;
      await writeGenerationCache(deps, key, feature, cached);
      const remaining = await usageSnapshot(deps, auth).catch(() => initialRemaining);
      return jsonResponse(
        buildJsonResponse(input, feature, cached, {
          cached: false,
          duplicate: false,
          usage: { ...usage, cost_micro_usd: cost },
          remaining,
        }),
        200,
        cors,
      );
    } catch (error) {
      if (!settled) {
        await deps.cache.delete(idempotency.key).catch(() => undefined);
        await refundQuietly(deps, reserve.eventId, error);
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, cors);
  }
}

function streamGenerated(
  request: Request,
  cors: Headers,
  input: {
    deps: GatewayDeps;
    auth: AuthContext;
    config: RuntimeConfig;
    input: GenerateRecipeRequest;
    feature: ReturnType<typeof featureForMode>;
    locale: string;
    provider: AIProvider;
    model: string;
    prompt: PromptBundle;
    key: string;
    idempotencyKey: string;
    eventId: string;
    remaining: UsageSnapshot;
  },
): Response {
  return ndjsonResponse(request, cors, async (writer) => {
    let settled = false;
    let outputText = '';
    let providerResult: ProviderResult | null = null;

    writer.write({
      type: 'meta',
      feature: input.feature,
      cached: false,
      remaining: input.remaining,
      model: input.model,
      provider: input.provider.id,
    });

    try {
      if (input.input.mode === 'chat' || input.input.mode === 'stream') {
        const providerRequest = buildProviderRequest({
          prompt: input.prompt.prompt,
          system: input.prompt.system,
          model: input.model,
          feature: input.feature,
          locale: input.locale,
          signal: writer.signal,
        });
        const iterator = input.provider.streamText(providerRequest);
        let next = await iterator.next();
        while (!next.done) {
          outputText += next.value;
          writeDelta(writer, next.value);
          next = await iterator.next();
        }
        providerResult = next.value;
        outputText = providerResult.text || outputText;
        if (!sanitizeText(outputText)) {
          throw invalidModelOutput('The AI returned an empty response.');
        }
      } else {
        const generated = await generatePayload(
          input.input,
          input.feature,
          input.provider,
          input.prompt,
          input.locale,
          input.model,
        );
        providerResult = generated.providerResult;
        outputText = JSON.stringify(generated.data);
        for (const chunk of chunkText(outputText, 480)) writeDelta(writer, chunk);
      }

      const finalProviderResult = providerResult;
      if (!finalProviderResult) throw invalidModelOutput('The AI returned no response.');
      const data = dataForMode(input.input, finalProviderResult, outputText);
      const cached: CachedGeneration = {
        data,
        model: finalProviderResult.model,
        provider: finalProviderResult.provider,
        rate_limited_models: finalProviderResult.rate_limited_models,
      };
      await writeIdempotencyCache(input.deps, input.idempotencyKey, input.feature, cached);
      const usage = usageWithTokenFallback(finalProviderResult.usage, {
        input_tokens: estimateInputTokens(`${input.prompt.system}\n${input.prompt.prompt}`),
        output_tokens: Math.ceil(outputText.length / 4),
      });
      const cost = await settleUsage(input.deps, {
        eventId: input.eventId,
        provider: finalProviderResult.provider,
        model: finalProviderResult.model,
        usage,
      });
      settled = true;
      await writeGenerationCache(input.deps, input.key, input.feature, cached);
      writer.write({
        type: 'final',
        data,
        usage: { ...usage, cost_micro_usd: cost },
        model: finalProviderResult.model,
        provider: finalProviderResult.provider,
      });
    } catch (error) {
      if (writer.signal.aborted) {
        // The client cancelled. The provider may have already produced some
        // output, so settle the partial usage instead of refunding it.
        if (!settled) {
          const usage = {
            input_tokens: estimateInputTokens(`${input.prompt.system}\n${input.prompt.prompt}`),
            output_tokens: Math.ceil(outputText.length / 4),
          };
          try {
            await settleUsage(input.deps, {
              eventId: input.eventId,
              provider: providerResult?.provider ?? input.provider.id,
              model: providerResult?.model ?? input.model,
              usage,
            });
            settled = true;
          } catch (settleError) {
            await refundQuietly(input.deps, input.eventId, settleError);
          }
        }
        return;
      }

      if (!settled) {
        await input.deps.cache.delete(input.idempotencyKey).catch(() => undefined);
        await refundQuietly(input.deps, input.eventId, error);
      }
      throw error;
    }
  });
}

function streamCached(
  request: Request,
  cors: Headers,
  input: GenerateRecipeRequest,
  feature: ReturnType<typeof featureForMode>,
  remaining: UsageSnapshot,
  cached: CachedGeneration,
): Response {
  return ndjsonResponse(request, cors, async (writer) => {
    writer.write({
      type: 'meta',
      feature,
      cached: true,
      remaining,
      model: cached.model,
      provider: cached.provider,
    });
    const text = textForCached(input, cached);
    for (const chunk of chunkText(text, 480)) {
      if (writer.signal.aborted) return;
      writeDelta(writer, chunk);
    }
    writer.write({
      type: 'final',
      data: cached.data,
      usage: zeroUsage(),
      model: cached.model,
      provider: cached.provider,
    });
  });
}

function buildPrompt(input: GenerateRecipeRequest, locale: string): PromptBundle {
  const dietary = input.dietary ?? [];
  const servings = input.servings ?? 4;
  const surprise = input.surprise_level ?? input.surprise ?? 0;

  switch (input.mode) {
    case 'suggestions':
      return {
        prompt: suggestionsPrompt({
          ingredients: input.ingredients,
          dietary,
          servings,
          surprise,
        }),
        system: applyLanguage(
          'You are a professional culinary chef. Always respond with clean, valid JSON without markdown formatting.',
          locale,
        ),
      };
    case 'detail':
      return {
        prompt: detailPrompt({
          recipeName: input.recipe_name,
          dietary,
          servings,
          surprise,
        }),
        system: applyLanguage(
          'You are a professional chef. Always output valid structured JSON without markdown wrappers.',
          locale,
        ),
      };
    case 'chat':
      return {
        prompt: chatPrompt({ message: input.message, history: input.history ?? [] }),
        system: chatSystem({
          recipeName: input.recipe_name,
          ingredients: input.ingredients,
          instructions: input.instructions,
          locale,
        }),
      };
    case 'stream':
      return {
        prompt: streamPrompt({
          recipeName: input.recipe_name,
          ingredients: input.ingredients ?? [],
          dietary,
          servings,
          surprise,
        }),
        system: applyLanguage(
          'You are a Michelin-star master chef writing a beautifully formatted recipe.',
          locale,
        ),
      };
  }
}

async function generatePayload(
  input: GenerateRecipeRequest,
  feature: ReturnType<typeof featureForMode>,
  provider: AIProvider,
  prompt: PromptBundle,
  locale: string,
  model: string,
): Promise<GeneratedPayload> {
  const request = buildProviderRequest({
    prompt: prompt.prompt,
    system: prompt.system,
    model,
    feature,
    locale,
  });

  switch (input.mode) {
    case 'suggestions': {
      const validated = await generateValidated({
        provider,
        request,
        schema: suggestedDishesSchema,
        normalize: normalizeSuggestions,
      });
      const data = validated.data.map((dish) => ({
        ...dish,
        provider: validated.providerResult.provider,
        model_used: validated.providerResult.model,
      }));
      return { data, providerResult: validated.providerResult };
    }
    case 'detail': {
      const validated = await generateValidated({
        provider,
        request,
        schema: recipeDetailSchema,
        normalize: normalizeRecipeDetail,
      });
      return { data: validated.data, providerResult: validated.providerResult };
    }
    case 'chat':
    case 'stream': {
      const result = await generateTextNonEmpty(provider, request);
      const text = sanitizeText(result.text);
      const data =
        input.mode === 'chat'
          ? {
              reply: text,
              recipe_name: input.recipe_name,
              model_used: result.model,
              rate_limited_models: result.rate_limited_models,
            }
          : {
              content: text,
              recipe_name: input.recipe_name,
              model_used: result.model,
              rate_limited_models: result.rate_limited_models,
            };
      return { data, providerResult: result };
    }
  }
}

async function generateTextNonEmpty(
  provider: AIProvider,
  request: ProviderRequest,
): Promise<ProviderResult> {
  let current = request;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await provider.generateText(current);
    if (sanitizeText(result.text)) return result;
    current = {
      ...current,
      prompt: `${current.prompt}\n\nReturn a complete, non-empty answer.`,
    };
  }
  throw invalidModelOutput('The AI returned an empty response.');
}

function dataForMode(
  input: GenerateRecipeRequest,
  providerResult: ProviderResult,
  outputText: string,
): unknown {
  switch (input.mode) {
    case 'chat':
      return {
        reply: sanitizeText(providerResult.text || outputText),
        recipe_name: input.recipe_name,
        model_used: providerResult.model,
        rate_limited_models: providerResult.rate_limited_models,
      };
    case 'stream':
      return {
        content: sanitizeText(providerResult.text || outputText),
        recipe_name: input.recipe_name,
        model_used: providerResult.model,
        rate_limited_models: providerResult.rate_limited_models,
      };
    default:
      return JSON.parse(outputText);
  }
}

function buildJsonResponse(
  input: GenerateRecipeRequest,
  _feature: ReturnType<typeof featureForMode>,
  cached: CachedGeneration,
  meta: {
    cached: boolean;
    duplicate: boolean;
    usage: { input_tokens: number; output_tokens: number; cost_micro_usd: number };
    remaining: UsageSnapshot;
  },
): unknown {
  const common = {
    cached: meta.cached,
    duplicate: meta.duplicate,
    provider: cached.provider,
    model_used: cached.model,
    rate_limited_models: cached.rate_limited_models,
    usage: meta.usage,
    remaining: meta.remaining,
  };
  switch (input.mode) {
    case 'suggestions':
      return {
        status: 'done',
        recipes: cached.data,
        model: cached.model,
        ...common,
      };
    case 'detail':
      return { ...(cached.data as Record<string, unknown>), ...common };
    case 'chat':
      return { ...(cached.data as Record<string, unknown>), ...common };
    case 'stream':
      return { ...(cached.data as Record<string, unknown>), ...common };
  }
}

function cachePayload(input: GenerateRecipeRequest, locale: string): unknown {
  const dietary = [...(input.dietary ?? [])].map((entry) => entry.trim().toLowerCase()).sort();
  const base = {
    locale,
    dietary,
    servings: input.servings ?? 4,
    surprise: input.surprise_level ?? input.surprise ?? 0,
  };
  switch (input.mode) {
    case 'suggestions':
      return {
        ...base,
        mode: input.mode,
        ingredients: [...new Set(input.ingredients.map((entry) => entry.trim().toLowerCase()))].sort(),
      };
    case 'detail':
      return { ...base, mode: input.mode, recipe_name: input.recipe_name.trim().toLowerCase() };
    case 'chat':
      return {
        ...base,
        mode: input.mode,
        recipe_name: input.recipe_name.trim().toLowerCase(),
        message: input.message.trim(),
        history: input.history ?? [],
        ingredients: input.ingredients ?? null,
        instructions: input.instructions ?? null,
      };
    case 'stream':
      return {
        ...base,
        mode: input.mode,
        recipe_name: input.recipe_name.trim().toLowerCase(),
        ingredients: [...new Set((input.ingredients ?? []).map((entry) => entry.trim().toLowerCase()))].sort(),
      };
  }
}

function textForCached(input: GenerateRecipeRequest, cached: CachedGeneration): string {
  if (input.mode === 'chat') {
    return typeof (cached.data as { reply?: unknown }).reply === 'string'
      ? (cached.data as { reply: string }).reply
      : '';
  }
  if (input.mode === 'stream') {
    return typeof (cached.data as { content?: unknown }).content === 'string'
      ? (cached.data as { content: string }).content
      : '';
  }
  return JSON.stringify(cached.data);
}

function chunkText(text: string, size: number): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += size) {
    chunks.push(text.slice(offset, offset + size));
  }
  return chunks;
}
