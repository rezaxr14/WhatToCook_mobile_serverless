/**
 * Maintenance function: copy ingredient photos into Supabase Storage.
 *
 * The reference app resolved ingredient images from `images.unsplash.com`,
 * which some networks block. This job runs on the server, downloads each source
 * photo once, stores it in the public `ingredient-images` bucket and records the
 * object path in `ingredients.image_path`. Both clients then load the cached
 * copy instead of the external host.
 *
 * Invoke it with the service-role key:
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/cache-ingredient-images" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"force":true}'
 *
 * Cached rows are skipped unless `force` is true. Object names are content
 * hashed and uploaded with a one-year immutable cache, so a forced refresh that
 * returns different bytes produces a new URL and old objects are deleted.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ingredientImageUrl } from '../../../packages/shared/src/ingredient-images.ts';
import {
  bearerToken,
  INGREDIENT_IMAGE_BUCKET,
  INGREDIENT_IMAGE_CACHE_CONTROL,
  INGREDIENT_IMAGE_PREFIX,
  ingredientObjectPath,
  isManagedIngredientPath,
  MAX_INGREDIENT_IMAGE_BYTES,
  mediaType,
  secretMatches,
} from '../_shared/ingredient-cache.ts';

type Env = Record<string, string | undefined>;

interface IngredientRow {
  id: number;
  slug: string;
  name_en: string | null;
  image_path: string | null;
}

interface CacheOptions {
  force: boolean;
  slugs: string[] | null;
  concurrency: number;
}

interface Failure {
  slug: string;
  reason: string;
}

interface DownloadedImage {
  bytes: ArrayBuffer;
  contentType: string;
}

const DEFAULT_CONCURRENCY = 6;
const MAX_CONCURRENCY = 10;
const DOWNLOAD_ATTEMPTS = 3;

function json(body: unknown, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function parseOptions(value: unknown): CacheOptions {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawSlugs = Array.isArray(record.slugs)
    ? record.slugs.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
  const requested = Number(record.concurrency);
  const concurrency = Number.isFinite(requested)
    ? Math.min(MAX_CONCURRENCY, Math.max(1, Math.trunc(requested)))
    : DEFAULT_CONCURRENCY;
  return {
    force: record.force === true,
    slugs: rawSlugs.length ? [...new Set(rawSlugs)] : null,
    concurrency,
  };
}

async function readOptions(request: Request): Promise<CacheOptions> {
  const text = await request.text();
  if (!text.trim()) return parseOptions(null);
  try {
    return parseOptions(JSON.parse(text));
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already consumed or locked; nothing to clean up.
  }
}

async function downloadImage(sourceUrl: string): Promise<DownloadedImage> {
  let lastReason = 'download failed';

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: { Accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8' },
      });
    } catch (error) {
      lastReason = `network error: ${error instanceof Error ? error.message : String(error)}`;
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(400 * 2 ** (attempt - 1));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastReason = `source returned HTTP ${response.status}`;
      await discardBody(response);
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(600 * 2 ** (attempt - 1));
      continue;
    }
    if (!response.ok) {
      lastReason = `source returned HTTP ${response.status}`;
      await discardBody(response);
      break;
    }

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_INGREDIENT_IMAGE_BYTES) {
      lastReason = `image is ${declared} bytes (limit ${MAX_INGREDIENT_IMAGE_BYTES})`;
      await discardBody(response);
      break;
    }

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) {
      lastReason = 'source returned an empty body';
      break;
    }
    if (bytes.byteLength > MAX_INGREDIENT_IMAGE_BYTES) {
      lastReason = `image is ${bytes.byteLength} bytes (limit ${MAX_INGREDIENT_IMAGE_BYTES})`;
      break;
    }

    const contentType = mediaType(response.headers.get('content-type'));
    if (!contentType) {
      lastReason = `unsupported content type: ${response.headers.get('content-type') ?? 'none'}`;
      break;
    }

    return { bytes, contentType };
  }

  throw new Error(lastReason);
}

async function contentHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pool<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      await work(item);
    }
  });
  await Promise.all(workers);
}

export async function handleCacheIngredientImages(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST to run the cache job.' }, 405, { Allow: 'POST' });
  }

  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  // Projects can expose the legacy service-role JWT, the new secret key, or
  // both. Accept either so manual runs and CI do not depend on which one is in
  // the function environment.
  const acceptedKeys = [env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SECRET_KEY]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!url || !serviceRoleKey || !acceptedKeys.length) {
    return json({ error: 'Supabase function environment is incomplete.' }, 500);
  }

  const token = bearerToken(request);
  const authorized = (await Promise.all(acceptedKeys.map((key) => secretMatches(token, key)))).some(
    Boolean,
  );
  if (!authorized) {
    return json({ error: 'The service-role bearer token is required.' }, 401);
  }

  let options: CacheOptions;
  try {
    options = await readOptions(request);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'whattocook-ingredient-cache' } },
  });
  const storage = db.storage.from(INGREDIENT_IMAGE_BUCKET);

  let query = db.from('ingredients').select('id, slug, name_en, image_path').order('id');
  if (options.slugs) query = query.in('slug', options.slugs);
  const { data, error } = await query;
  if (error) {
    return json({ error: `Could not read ingredients: ${error.message}` }, 500);
  }

  const rows = (data ?? []) as IngredientRow[];
  if (!rows.length) {
    return json(
      { ok: true, bucket: INGREDIENT_IMAGE_BUCKET, total: 0, cached: 0, skipped: 0, failed: [] },
      200,
    );
  }

  // One folder listing is cheaper than a HEAD request per row and lets us skip
  // rows whose image_path still points at an object that exists.
  const objectNames = new Set<string>();
  const { data: listed, error: listError } = await storage.list(INGREDIENT_IMAGE_PREFIX, {
    limit: 1000,
  });
  if (!listError) {
    for (const entry of listed ?? []) objectNames.add(entry.name);
  }

  let cached = 0;
  let skipped = 0;
  const failed: Failure[] = [];

  await pool(rows, options.concurrency, async (row) => {
    const sourceName = row.name_en || row.slug;
    const sourceUrl = ingredientImageUrl(sourceName);
    const currentName = row.image_path?.split('/').pop() ?? null;

    if (
      !options.force &&
      isManagedIngredientPath(row.image_path) &&
      currentName &&
      (listError || objectNames.has(currentName))
    ) {
      skipped += 1;
      return;
    }

    try {
      const image = await downloadImage(sourceUrl);
      const hash = await contentHash(image.bytes);
      const objectPath = ingredientObjectPath(row.slug, hash, image.contentType);

      const { error: uploadError } = await storage.upload(objectPath, image.bytes, {
        contentType: image.contentType,
        cacheControl: INGREDIENT_IMAGE_CACHE_CONTROL,
        upsert: true,
      });
      if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

      const { error: updateError } = await db
        .from('ingredients')
        .update({ image_path: objectPath })
        .eq('id', row.id);
      if (updateError) throw new Error(`database update failed: ${updateError.message}`);

      if (
        row.image_path &&
        row.image_path !== objectPath &&
        isManagedIngredientPath(row.image_path)
      ) {
        // Best effort: the row already points at the new object, so a failed
        // cleanup only leaves an orphan behind.
        await storage.remove([row.image_path]).catch(() => undefined);
      }

      cached += 1;
    } catch (error) {
      failed.push({
        slug: row.slug,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const failedSlugs = new Set(failed.map((entry) => entry.slug));

  return json(
    {
      ok: failed.length === 0,
      bucket: INGREDIENT_IMAGE_BUCKET,
      force: options.force,
      total: rows.length,
      cached,
      skipped,
      failed,
      ...(listError ? { warning: `Could not list cached objects: ${listError.message}` } : {}),
      ...(failedSlugs.size ? { failed_slugs: [...failedSlugs] } : {}),
    },
    failed.length ? 500 : 200,
  );
}

Deno.serve((request) => handleCacheIngredientImages(request, Deno.env.toObject()));
