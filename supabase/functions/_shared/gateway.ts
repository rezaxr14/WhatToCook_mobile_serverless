import {
  AI_LIMITS,
  type AIFeature,
  type UsageSnapshot,
} from '../../../packages/shared/src/ai-contracts.ts';
import { isFreeOpenRouterModel } from '../../../packages/shared/src/ai-models.ts';
import { assertAllowedOrigin, preflightResponse } from './cors.ts';
import { buildCacheKey, buildIdempotencyCacheKey } from './cache.ts';
import { enforceChallenge, type ClientPlatform } from './challenge.ts';
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
  const serviceKey = request.headers.get('x-service-key');
  const auth = serviceKey ? await deps.serviceAuth(request) : await deps.auth(request);
  return { auth, config, cors };
}

/**
 * Service calls carry `principal_class` in the body (plan 4.3). The key is
 * validated before the body is read, so this only refines an already-trusted
 * service context; it never grants service mode on its own.
 */
export function applyServicePrincipal(auth: AuthContext, body: unknown): void {
  if (!auth.service) return;
  const value = (body ?? {}) as { principal_class?: unknown; end_user_ref?: unknown };
  auth.service.principalClass =
    value.principal_class === 'anonymous' ? 'anonymous' : 'registered';
  if (typeof value.end_user_ref === 'string' && value.end_user_ref.trim()) {
    auth.service.endUserRefHash = hashEndUserRef(value.end_user_ref.trim());
  }
}

/** Opaque end-user reference: only a short hash is ever logged or stored. */
export function hashEndUserRef(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function platformOf(request: Request): 'android' | 'web' {
  return request.headers.get('x-client-platform')?.toLowerCase() === 'android'
    ? 'android'
    : 'web';
}

export function assertFeature(config: RuntimeConfig, feature: AIFeature): void {
  if (config.killSwitch) throw aiDisabled();
  if (config.featureFlags[feature] === false) throw aiDisabled();
}

export interface ResolvedProvider {
  id: string;
  provider: AIProvider;
}

export function providerFor(
  deps: GatewayDeps,
  config: RuntimeConfig,
  requested?: { provider?: string; model?: string; feature?: AIFeature },
): ResolvedProvider {
  if (
    config.providerId !== 'gemini' &&
    config.providerId !== 'openrouter' &&
    config.providerId !== 'lmstudio' &&
    config.providerId !== 'fake'
  ) {
    throw providerError('The configured AI provider is not supported.');
  }

  // Every provider instance counts its own HTTP attempts (including model
  // fallbacks and schema retries) against the 95 % daily guard.
  const hooks = {
    onAttempt: (providerId: string) =>
      deps.quota.recordProviderAttempt(providerId, config.providerDailyGuard),
  };

  // A photo scan always uses the deployment's primary provider. The free
  // OpenRouter router does not reliably satisfy the scan schema, so choosing an
  // OpenRouter text model must not silently break the fridge scanner.
  if (requested?.feature === 'scan') {
    const providerId = config.providerId;
    return { id: providerId, provider: deps.provider(providerId, config, hooks) };
  }

  const requestedProvider = requested?.provider?.trim().toLowerCase();
  const model = requested?.model?.trim();
  let providerId: string = config.providerId;

  if (
    requestedProvider &&
    requestedProvider !== config.providerId &&
    config.allowedProviders.includes(requestedProvider)
  ) {
    providerId = requestedProvider;
  } else if (
    model &&
    config.allowedProviders.includes('openrouter') &&
    isFreeOpenRouterModel(model)
  ) {
    // Namespaced free model ids are unambiguous even when the client does not
    // send a separate provider field (the mobile app only sends `model`).
    providerId = 'openrouter';
  }

  if (providerId !== config.providerId && !config.allowedProviders.includes(providerId)) {
    throw providerError('The selected AI provider is not enabled on the server.');
  }
  return { id: providerId, provider: deps.provider(providerId, config, hooks) };
}

export function modelFor(
  config: RuntimeConfig,
  feature: AIFeature,
  requestedModel?: string,
  providerId: string = config.providerId,
): string {
  if (providerId === 'fake') return config.models[feature] ?? 'fake-1';

  if (providerId === 'openrouter') {
    const requested = requestedModel?.trim();
    if (
      requested &&
      (config.allowedModels.includes(requested) || isFreeOpenRouterModel(requested))
    ) {
      return requested;
    }
    return config.openRouterModel || config.models[feature] || 'openrouter/free';
  }

  const model = config.models[feature];
  if (!model) throw providerError('AI model routing is not configured for this feature.');

  // The client may choose a model only when the server allows it. The catalog
  // exposes the routed model plus its fallbacks, so the picker changes the
  // model instead of silently using the default. Unknown choices fall back to
  // the deploy-time routed model instead of failing an otherwise valid request.
  const requested = requestedModel?.trim();
  if (requested && config.allowedModels.includes(requested)) {
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
    config: RuntimeConfig;
  },
): Promise<ReserveResult> {
  const platform: ClientPlatform = platformOf(input.request);

  // The adaptive gate runs before any counter so a challenged request costs
  // nothing. Cache hits never reach this function.
  await enforceChallenge({ auth, config: input.config, platform, quota: deps.quota });

  // Service traffic is metered against the end user's pool so a service call
  // consumes the same anonymous/registered share as the equivalent first-party
  // request. `principal_class` defaults to `registered` in
  // `applyServicePrincipal`, so an unlabelled service call still draws from the
  // registered pool rather than an uncapped bucket.
  const pool: 'anonymous' | 'registered' = auth.service
    ? auth.service.principalClass === 'anonymous'
      ? 'anonymous'
      : 'registered'
    : auth.plan.id === 'anonymous'
      ? 'anonymous'
      : 'registered';

  // Service traffic shares the registered share; the provider-attempt guard is
  // still the hard 95 % ceiling for everything.
  const pct =
    pool === 'anonymous'
      ? input.config.pools.anonymousPct
      : input.config.pools.registeredPct;
  const guard = input.config.providerDailyGuard;
  const poolLimit = guard === null ? null : Math.max(1, Math.floor((guard * pct) / 100));

  // Unattested Android (Play Integrity not enforced yet) gets the lower
  // anonymous cap instead of the plan's larger number.
  const dailyCap =
    pool === 'anonymous' &&
    platform === 'android' &&
    !input.config.challenge.mobileEnforce
      ? input.config.challenge.unattestedDailyCap
      : null;

  await deps.quota.checkRateLimit({
    ...input.rateLimits,
    now: deps.now(),
    userId: auth.service ? null : auth.userId,
    planId: auth.plan.id,
    ipKey: auth.service ? null : await clientIpHash(input.request),
  });

  return deps.quota.reserve({
    userId: auth.userId,
    service: auth.service?.name,
    requestId: input.requestId,
    feature: input.feature,
    reservedMicroUsd: input.estimateMicroUsd,
    provider: input.provider,
    model: input.model,
    pool,
    poolLimit,
    dailyCap,
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
      service: auth.service?.name,
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
  const kinds =
    appError.code === 'challenge_required'
      ? (appError.details as { kinds?: string[] } | undefined)?.kinds
      : undefined;
  return jsonResponse(
    {
      error: appError.code,
      code: appError.code,
      message: appError.message,
      details: appError.details,
      // The plan's challenge response puts `kinds` at the top level so clients
      // do not have to know about `details`.
      ...(kinds ? { kinds } : {}),
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
