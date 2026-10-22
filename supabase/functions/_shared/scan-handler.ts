import {
  AI_LIMITS,
  pantryScanItemsSchema,
  scanPantryRequestSchema,
  type UsageSnapshot,
} from '../../../packages/shared/src/ai-contracts.ts';
import { checkCors } from './cors.ts';
import { mapDetectedIngredients, type CatalogIngredient, type MappedIngredient } from './catalog.ts';
import { badRequest, payloadTooLarge } from './errors.ts';
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
import {
  decodeBase64,
  estimateInputTokens,
  jsonResponse,
  readJsonBody,
  sha256Hex,
} from './http.ts';
import { detectImageMime, stripImageMetadata } from './image.ts';
import { estimateReserveMicroUsd, usageWithTokenFallback } from './prices.ts';
import { visionPrompt, visionSystem } from './prompts.ts';
import type { GatewayDeps } from './types.ts';
import { generateValidated, normalizeScan } from './validation.ts';

interface ScanData {
  items: MappedIngredient[];
  detected_count: number;
}

export async function handleScanPantry(
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

    const body = await readJsonBody(request, AI_LIMITS.maxScanBodyBytes);
    const parsed = scanPantryRequestSchema.safeParse(body);
    if (!parsed.success) throw badRequest('Invalid scan-pantry request.', parsed.error.issues);
    const input = parsed.data;
    const encoded = input.image ?? input.image_base64;
    if (!encoded) throw badRequest('An image is required.');
    assertFeature(config, 'scan');

    const locale = resolveLocale(auth, input);
    const provider = providerFor(deps, config);
    const model = modelFor(config, 'scan');
    const bytes = decodeBase64(encoded);
    if (bytes.byteLength > auth.plan.max_image_bytes) {
      throw payloadTooLarge(
        `Image is larger than the ${Math.round(auth.plan.max_image_bytes / (1024 * 1024))} MB plan limit.`,
      );
    }
    const mime = detectImageMime(bytes);
    if (!mime) throw badRequest('Only JPEG, PNG, or WebP images are supported.');
    const stripped = stripImageMetadata(bytes, mime);
    if (stripped.byteLength > auth.plan.max_image_bytes) {
      throw payloadTooLarge('Image is larger than the plan limit after metadata stripping.');
    }
    const imageHash = await sha256Hex(stripped);

    const idempotency = await idempotencyKeyFor(
      auth.userId,
      request.headers.get('idempotency-key'),
    );
    const idempotentHit = await readGenerationCache(deps, idempotency.key);
    if (idempotentHit) {
      const started = performance.now();
      await recordCacheHit(deps, auth, {
        requestId: idempotency.requestId,
        feature: 'scan',
        provider: idempotentHit.provider || provider.id,
        model: idempotentHit.model || model,
        latencyMs: Math.round(performance.now() - started),
      });
      const remaining = await usageSnapshot(deps, auth);
      return jsonResponse(
        buildScanResponse(idempotentHit, {
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
      image_sha256: imageHash,
      locale,
      min_confidence: input.min_confidence,
      max_items: input.max_items,
    };
    const key = await cacheKeyFor({
      feature: 'scan',
      provider: provider.id,
      model,
      locale,
      payload,
    });

    const hit = await readGenerationCache(deps, key);
    if (hit) {
      const started = performance.now();
      await deps.cache.touch(key).catch(() => undefined);
      await recordCacheHit(deps, auth, {
        requestId: idempotency.requestId,
        feature: 'scan',
        provider: hit.provider || provider.id,
        model: hit.model || model,
        latencyMs: Math.round(performance.now() - started),
      });
      const remaining = await usageSnapshot(deps, auth);
      return jsonResponse(
        buildScanResponse(hit, {
          cached: true,
          duplicate: false,
          usage: zeroUsage(),
          remaining,
        }),
        200,
        cors,
      );
    }

    const catalog = await deps.loadCatalog();
    const prompt = visionPrompt({
      locale,
      nonEnglishDisplayName: locale !== 'en',
    });
    const system = visionSystem(locale);
    const price = await priceFor(deps, provider.id, model);
    const reserveEstimate = estimateReserveMicroUsd({
      price,
      inputTokens: estimateInputTokens(`${system}\n${prompt}`) + 1_024,
      maxOutputTokens: outputBudget('scan'),
    });

    const reserve = await reserveUsage(deps, auth, {
      requestId: idempotency.requestId,
      feature: 'scan',
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

    let settled = false;
    try {
      const providerRequest = buildProviderRequest({
        prompt,
        system,
        model,
        feature: 'scan',
        locale,
        imageBytes: stripped,
        imageMimeType: mime,
      });
      const validated = await generateValidated({
        provider,
        request: providerRequest,
        schema: pantryScanItemsSchema,
        normalize: normalizeScan,
        mode: 'vision',
      });
      const items = mapDetectedIngredients({
        detections: validated.data,
        catalog: catalog as CatalogIngredient[],
        locale,
        minConfidence: input.min_confidence,
        maxItems: input.max_items,
      });
      const data: ScanData = {
        items,
        detected_count: validated.data.length,
      };
      const cached: CachedGeneration = {
        data,
        model: validated.providerResult.model,
        provider: validated.providerResult.provider,
        rate_limited_models: validated.providerResult.rate_limited_models,
      };
      await writeIdempotencyCache(deps, idempotency.key, 'scan', cached);
      const usage = usageWithTokenFallback(validated.providerResult.usage, {
        input_tokens: estimateInputTokens(`${system}\n${prompt}`) + 1_024,
        output_tokens: Math.ceil(JSON.stringify(validated.data).length / 4),
      });
      const cost = await settleUsage(deps, {
        eventId: reserve.eventId,
        provider: validated.providerResult.provider,
        model: validated.providerResult.model,
        usage,
      });
      settled = true;
      await writeGenerationCache(deps, key, 'scan', cached);
      const remaining = await usageSnapshot(deps, auth).catch(() => initialRemaining);
      return jsonResponse(
        buildScanResponse(cached, {
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

function buildScanResponse(
  cached: CachedGeneration,
  meta: {
    cached: boolean;
    duplicate: boolean;
    usage: { input_tokens: number; output_tokens: number; cost_micro_usd: number };
    remaining: UsageSnapshot;
  },
): unknown {
  const data = cached.data as ScanData;
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    status: 'done',
    items,
    detected_count: Number(data?.detected_count ?? items.length),
    matched_count: items.filter((item) => item.matched).length,
    cached: meta.cached,
    duplicate: meta.duplicate,
    provider: cached.provider,
    model_used: cached.model,
    rate_limited_models: cached.rate_limited_models,
    usage: meta.usage,
    remaining: meta.remaining,
  };
}
