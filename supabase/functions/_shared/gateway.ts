import {
  AI_LIMITS,
  type AIFeature,
  type UsageSnapshot,
} from '../../../packages/shared/src/ai-contracts.ts';
import { isFreeOpenRouterModel } from '../../../packages/shared/src/ai-models.ts';
import { assertAllowedOrigin, preflightResponse } from './cors.ts';
import { buildCacheKey, buildIdempotencyCacheKey } from './cache.ts';
import { clientIpHash } from './client-ip.ts';
import {
  aiDisabled,
  AppError,
  asAppError,
  badRequest,
  duplicateRequest,
  internalError,
  providerError,
} from './errors.ts';
import { jsonResponse, requestIdFromIdempotencyKey } from './http.ts';
import { calculateCostMicroUsd, MAX_OUTPUT_TOKENS } from './prices.ts';
import type {
  AIProvider,
  AuthContext,
  CacheHit,
  GatewayDeps,
  ModelPrice,
  ProviderRequest,
  ProviderUsage,
  RateLimits,
  ReserveResult,
  RuntimeConfig,
} from './types.ts';

export interface RequestContext {
  auth: AuthContext;
  config: RuntimeConfig;
  cors: Headers;
}

export async function preflight(request: Request, deps: GatewayDeps): Promise<Response | null> {
  return preflightResponse(request, deps.allowedOrigins());
}

export async function loadRequestContext(
  request: Request,
  deps: GatewayDeps,
): Promise<RequestContext | Response> {
  const config = await deps.loadConfig();
  const allowed = config.allowedOrigins.length > 0 ? config.allowedOrigins : deps.allowedOrigins();
  const cors = assertAllowedOrigin(request, allowed);
  const auth = await deps.auth(request);
  return { auth, config, cors };
}

export function assertFeature(config: RuntimeConfig, feature: AIFeature): void {
  if (config.killSwitch) throw aiDisabled();
  if (config.featureFlags[feature] === false) throw aiDisabled();
}

export function providerFor(deps: GatewayDeps, config: RuntimeConfig): AIProvider {
  if (
    config.providerId !== 'gemini' &&
    config.providerId !== 'openrouter' &&
    config.providerId !== 'lmstudio' &&
    config.providerId !== 'fake'
  ) {
    throw providerError('The configured AI provider is not supported.');
  }
  return deps.provider(config.providerId, config);
}

export function modelFor(
  config: RuntimeConfig,
  feature: AIFeature,
  requestedModel?: string,
): string {
  if (config.providerId === 'fake') return config.models[feature] ?? 'fake-1';
  const model = config.models[feature];
  if (!model) throw providerError('AI model routing is not configured for this feature.');

  // The client may choose a model only when the server allows it. OpenRouter
  // free models are always safe because they are billed at $0; any other
  // choice must be explicitly allowlisted. Unknown choices fall back to the
  // deploy-time routed model instead of failing an otherwise valid request.
  const requested = requestedModel?.trim();
  if (requested && config.allowedModels.includes(requested)) {
    return requested;
  }
  if (config.providerId === 'openrouter' && requested && isFreeOpenRouterModel(requested)) {
    return requested;
  }
  return model;
}

export async function priceFor(
  deps: GatewayDeps,
  provider: string,
  model: string,
): Promise<ModelPrice> {
  if (provider === 'fake') {
    return {
      provider,
      model,
      input_micro_usd_per_million: 0,
      output_micro_usd_per_million: 0,
    };
  }
  const price = await deps.getPrice(provider, model);
  if (!price) {
    throw providerError('AI pricing is not configured for the selected model.');
  }
  return price;
}

export function outputBudget(feature: AIFeature): number {
  return MAX_OUTPUT_TOKENS[feature];
}

export function featureForMode(mode: 'suggestions' | 'detail' | 'chat' | 'stream'): AIFeature {
  switch (mode) {
    case 'suggestions':
      return 'suggestions';
    case 'detail':
      return 'recipe';
    case 'chat':
      return 'chat';
    case 'stream':
      return 'stream';
  }
}

export function resolveLocale(
  auth: AuthContext,
  input: { locale?: string; language?: string },
): string {
  return input.locale ?? input.language ?? auth.profile.locale ?? 'en';
}

export async function cacheKeyFor(input: {
  feature: AIFeature;
  provider: string;
  model: string;
  locale: string;
  payload: unknown;
}): Promise<string> {
  return buildCacheKey({
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    locale: input.locale,
    promptVersion: 'm4-v1',
    payload: input.payload,
  });
}

export async function idempotencyKeyFor(
  userId: string,
  idempotencyHeader: string | null,
): Promise<{ requestId: string; key: string }> {
  const requestId = await requestIdFromIdempotencyKey(idempotencyHeader, userId);
  return { requestId, key: await buildIdempotencyCacheKey(userId, requestId) };
}

export interface CachedGeneration {
  data: unknown;
  model: string;
  provider: string;
  rate_limited_models: string[];
}

export async function readGenerationCache(
  deps: GatewayDeps,
  key: string,
): Promise<CachedGeneration | null> {
  const hit = await deps.cache.get(key);
  if (!hit) return null;
  const value = hit.response as Partial<CachedGeneration> | null;
  if (!value || typeof value !== 'object' || !('data' in value)) return null;
  return {
    data: value.data,
    model: typeof value.model === 'string' ? value.model : '',
    provider: typeof value.provider === 'string' ? value.provider : '',
    rate_limited_models: Array.isArray(value.rate_limited_models)
      ? value.rate_limited_models.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

export async function writeGenerationCache(
  deps: GatewayDeps,
  key: string,
  feature: AIFeature,
  data: CachedGeneration,
): Promise<void> {
  try {
    await deps.cache.set({
      key,
      feature,
      response: data,
      ttlSeconds: AI_LIMITS.cacheTtlSeconds,
    });
  } catch (error) {
    console.error('ai_cache_write_failed', error instanceof Error ? error.message : 'unknown');
  }
}

export async function writeIdempotencyCache(
  deps: GatewayDeps,
  key: string,
  feature: AIFeature,
  data: CachedGeneration,
): Promise<void> {
  try {
    await deps.cache.set({
      key,
      feature,
      response: data,
      ttlSeconds: AI_LIMITS.idempotencyTtlSeconds,
    });
  } catch (error) {
    console.error(
      'ai_idempotency_cache_write_failed',
      error instanceof Error ? error.message : 'unknown',
    );
  }
}

export async function reserveUsage(
  deps: GatewayDeps,
  auth: AuthContext,
  input: {
    request: Request;
    requestId: string;
    feature: AIFeature;
    estimateMicroUsd: number;
    provider: string;
    model: string;
    rateLimits: RateLimits;
  },
): Promise<ReserveResult> {
  await deps.quota.checkRateLimit({
    ...input.rateLimits,
    now: deps.now(),
    userId: auth.userId,
    planId: auth.plan.id,
    ipKey: await clientIpHash(input.request),
  });
  return deps.quota.reserve({
    userId: auth.userId,
    requestId: input.requestId,
    feature: input.feature,
    reservedMicroUsd: input.estimateMicroUsd,
    provider: input.provider,
    model: input.model,
  });
}

export async function usageSnapshot(deps: GatewayDeps, auth: AuthContext): Promise<UsageSnapshot> {
  return deps.quota.getUsage(auth);
}

export async function recordCacheHit(
  deps: GatewayDeps,
  auth: AuthContext,
  input: {
    requestId: string;
    feature: AIFeature;
    provider: string;
    model: string;
    latencyMs: number;
  },
): Promise<void> {
  try {
    await deps.quota.recordCacheHit({
      userId: auth.userId,
      requestId: input.requestId,
      feature: input.feature,
      provider: input.provider,
      model: input.model,
      latencyMs: input.latencyMs,
    });
  } catch (error) {
    console.error('ai_cache_hit_record_failed', error instanceof Error ? error.message : 'unknown');
  }
}

export async function settleUsage(
  deps: GatewayDeps,
  input: {
    eventId: string;
    provider: string;
    model: string;
    usage: ProviderUsage;
  },
): Promise<number> {
  const price = await priceFor(deps, input.provider, input.model);
  const cost = calculateCostMicroUsd(input.usage, price);
  await deps.quota.settle({
    eventId: input.eventId,
    inputTokens: input.usage.input_tokens,
    outputTokens: input.usage.output_tokens,
    costMicroUsd: cost,
  });
  return cost;
}

export async function refundQuietly(
  deps: GatewayDeps,
  eventId: string,
  error: unknown,
): Promise<void> {
  const appError = asAppError(error);
  try {
    await deps.quota.refund(eventId, appError.code);
  } catch (refundError) {
    console.error(
      'ai_refund_failed',
      refundError instanceof Error ? refundError.message : 'unknown',
    );
  }
}

export function ensureNotIdempotentDuplicate(reserve: ReserveResult): void {
  if (reserve.idempotent && reserve.status !== 'reserved') {
    throw duplicateRequest(
      'This Idempotency-Key was already used for a completed request. Use a new key to retry.',
    );
  }
}

export function ensureMatchingUserId(auth: AuthContext, userId: string): void {
  if (auth.userId !== userId) throw internalError('AI request user mismatch.');
}

export function requireBodyMode(value: unknown): never {
  throw badRequest('Unsupported request.', value);
}

export function errorResponse(error: unknown, cors: Headers): Response {
  const appError = error instanceof AppError ? error : asAppError(error);
  if (appError.status === 499) return new Response(null, { status: 499, headers: cors });
  const extras: Record<string, string> = {};
  if (appError.retryAfter !== undefined) extras['Retry-After'] = String(appError.retryAfter);
  return jsonResponse(
    {
      error: appError.code,
      code: appError.code,
      message: appError.message,
      details: appError.details,
      resets_at: appError.resetsAt,
      retry_after: appError.retryAfter,
    },
    appError.status,
    cors,
    extras,
  );
}

export function zeroUsage() {
  return { input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 };
}

export function buildProviderRequest(input: {
  prompt: string;
  system?: string;
  model: string;
  feature: AIFeature;
  locale: string;
  signal?: AbortSignal;
  imageBytes?: Uint8Array;
  imageMimeType?: string;
}): ProviderRequest {
  return {
    prompt: input.prompt,
    system: input.system,
    model: input.model,
    maxOutputTokens: outputBudget(input.feature),
    temperature: input.feature === 'scan' ? 0.4 : 0.7,
    responseMimeType:
      input.feature === 'chat' || input.feature === 'stream' ? 'text/plain' : 'application/json',
    signal: input.signal,
    metadata: {
      feature: input.feature,
      locale: input.locale,
      imageBytes: input.imageBytes,
      imageMimeType: input.imageMimeType,
    },
  };
}

export function cacheHitOrNull(hit: CacheHit | null): CacheHit | null {
  return hit;
}
