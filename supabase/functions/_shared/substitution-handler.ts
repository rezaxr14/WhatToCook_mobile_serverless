import {
  AI_LIMITS,
  substitutionRequestSchema,
  substitutionResultSchema,
  type UsageSnapshot,
} from '../../../packages/shared/src/ai-contracts.ts';
import { checkCors } from './cors.ts';
import { badRequest } from './errors.ts';
import {
  assertFeature,
  buildProviderRequest,
  cacheKeyFor,
  ensureNotIdempotentDuplicate,
  errorResponse,
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
  type CachedGeneration,
} from './gateway.ts';
import { estimateInputTokens, jsonResponse, readJsonBody } from './http.ts';
import { estimateReserveMicroUsd, usageWithTokenFallback } from './prices.ts';
import { applyLanguage, substitutionPrompt } from './prompts.ts';
import type { GatewayDeps } from './types.ts';
import { generateValidated, normalizeSubstitution } from './validation.ts';

export async function handleSuggestSubstitution(
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
    const parsed = substitutionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid suggest-substitution request.', parsed.error.issues);
    }
    const input = parsed.data;
    assertFeature(config, 'substitution');
    const locale = resolveLocale(auth, input);
    const provider = providerFor(deps, config);
    const model = modelFor(config, 'substitution', input.model);
    const idempotency = await idempotencyKeyFor(
      auth.userId,
      request.headers.get('idempotency-key'),
    );

    const idempotentHit = await readGenerationCache(deps, idempotency.key);
    if (idempotentHit) {
      const started = performance.now();
      await recordCacheHit(deps, auth, {
        requestId: idempotency.requestId,
        feature: 'substitution',
        provider: idempotentHit.provider || provider.id,
        model: idempotentHit.model || model,
        latencyMs: Math.round(performance.now() - started),
      });
      const remaining = await usageSnapshot(deps, auth);
      return jsonResponse(
        buildSubstitutionResponse(idempotentHit, {
          cached: true,
          duplicate: true,
          usage: zeroUsage(),
          remaining,
        }),
        200,
        cors,
      );
    }

    const payload = {
      recipe_name: input.recipe_name?.trim().toLowerCase() ?? null,
      missing_ingredient: input.missing_ingredient.trim().toLowerCase(),
      available_ingredients: [
        ...new Set(input.available_ingredients.map((entry) => entry.trim().toLowerCase())),
      ].sort(),
      dietary: [...new Set(input.dietary.map((entry) => entry.trim().toLowerCase()))].sort(),
      locale,
    };
    const key = await cacheKeyFor({
      feature: 'substitution',
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
          feature: 'substitution',
          provider: hit.provider || provider.id,
          model: hit.model || model,
          latencyMs: Math.round(performance.now() - started),
        });
        const remaining = await usageSnapshot(deps, auth);
        return jsonResponse(
          buildSubstitutionResponse(hit, {
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

    const prompt = substitutionPrompt({
      recipeName: input.recipe_name,
      missingIngredient: input.missing_ingredient,
      availableIngredients: input.available_ingredients,
      dietary: input.dietary,
    });
    const system = applyLanguage(
      'You are a practical professional chef. Always respond with clean, valid JSON without markdown formatting.',
      locale,
    );
    const price = await priceFor(deps, provider.id, model);
    const reserveEstimate = estimateReserveMicroUsd({
      price,
      inputTokens: estimateInputTokens(`${system}\n${prompt}`),
      maxOutputTokens: outputBudget('substitution'),
    });
    const reserve = await reserveUsage(deps, auth, {
      requestId: idempotency.requestId,
      feature: 'substitution',
      estimateMicroUsd: reserveEstimate,
      provider: provider.id,
      model,
      rateLimits: config.rateLimits,
    });
    ensureNotIdempotentDuplicate(reserve);
    let initialRemaining: UsageSnapshot;
    try {
      initialRemaining = await usageSnapshot(deps, auth);
    } catch (error) {
      await refundQuietly(deps, reserve.eventId, error);
      throw error;
    }

    let settled = false;
    try {
      const providerRequest = buildProviderRequest({
        prompt,
        system,
        model,
        feature: 'substitution',
        locale,
      });
      const validated = await generateValidated({
        provider,
        request: providerRequest,
        schema: substitutionResultSchema,
        normalize: normalizeSubstitution,
      });
      const cached: CachedGeneration = {
        data: validated.data,
        model: validated.providerResult.model,
        provider: validated.providerResult.provider,
        rate_limited_models: validated.providerResult.rate_limited_models,
      };
      await writeIdempotencyCache(deps, idempotency.key, 'substitution', cached);
      const usage = usageWithTokenFallback(validated.providerResult.usage, {
        input_tokens: estimateInputTokens(`${system}\n${prompt}`),
        output_tokens: Math.ceil(JSON.stringify(validated.data).length / 4),
      });
      const cost = await settleUsage(deps, {
        eventId: reserve.eventId,
        provider: validated.providerResult.provider,
        model: validated.providerResult.model,
        usage,
      });
      settled = true;
      await writeGenerationCache(deps, key, 'substitution', cached);
      const remaining = await usageSnapshot(deps, auth).catch(() => initialRemaining);
      return jsonResponse(
        buildSubstitutionResponse(cached, {
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

function buildSubstitutionResponse(
  cached: CachedGeneration,
  meta: {
    cached: boolean;
    duplicate: boolean;
    usage: { input_tokens: number; output_tokens: number; cost_micro_usd: number };
    remaining: UsageSnapshot;
  },
): unknown {
  return {
    status: 'done',
    ...(cached.data as Record<string, unknown>),
    cached: meta.cached,
    duplicate: meta.duplicate,
    provider: cached.provider,
    model_used: cached.model,
    rate_limited_models: cached.rate_limited_models,
    usage: meta.usage,
    remaining: meta.remaining,
  };
}
