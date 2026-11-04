/**
 * Maintenance function: (re)build the Storage cache from `image_sources`.
 *
 * The table is the durable record; Storage is a cache. Every row carries the
 * original source URL, so losing a bucket never loses a photo. This job is
 * add-only: it never deletes an object, and a content-hashed name means a
 * changed source produces a new URL instead of replacing bytes in place.
 *
 * Invoke it with the service-role key:
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/recache-images" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"force":true,"limit":50}'
 *
 * A `rows` array upserts new catalog entries before fetching, which is how a
 * fresh catalog is bootstrapped.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { bearerToken, secretMatches } from '../_shared/ingredient-cache.ts';
import {
  IMAGE_BUCKET,
  IMAGE_CACHE_CONTROL,
  MAX_IMAGE_BYTES,
  imageMediaType,
  isPublicHttpUrl,
  parseRecacheOptions,
  storedImagePath,
  type ImageKind,
} from '../_shared/image-recache.ts';

type Env = Record<string, string | undefined>;

interface ImageSourceRow {
  id: number;
  kind: ImageKind;
  key: string;
  source_url: string;
  storage_path: string | null;
}

interface Failure {
  key: string;
  kind: ImageKind;
  reason: string;
}

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already consumed.
  }
}

async function download(sourceUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!isPublicHttpUrl(sourceUrl)) throw new Error('Source URL is not a public http(s) URL.');
  let lastReason = 'download failed';

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: { Accept: 'image/webp,image/jpeg,image/png,image/avif,image/*;q=0.8' },
      });
    } catch (error) {
      lastReason = `network error: ${error instanceof Error ? error.message : String(error)}`;
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(400 * 2 ** (attempt - 1));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastReason = `source returned HTTP ${response.status}`;
      await discard(response);
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(600 * 2 ** (attempt - 1));
      continue;
    }
    if (!response.ok) {
      lastReason = `source returned HTTP ${response.status}`;
      await discard(response);
      break;
    }

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      lastReason = `image is ${declared} bytes (limit ${MAX_IMAGE_BYTES})`;
      await discard(response);
      break;
    }

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) {
      lastReason = 'source returned an empty body';
      break;
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      lastReason = `image is ${bytes.byteLength} bytes (limit ${MAX_IMAGE_BYTES})`;
      break;
    }

    const contentType = imageMediaType(response.headers.get('content-type'));
    if (!contentType) {
      lastReason = `unsupported content type: ${response.headers.get('content-type') ?? 'none'}`;
      break;
    }
    return { bytes, contentType };
  }

  throw new Error(lastReason);
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
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

export async function handleRecacheImages(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST to run the recache job.' }, 405, { Allow: 'POST' });
  }

  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
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

  let options: ReturnType<typeof parseRecacheOptions>;
  try {
    const text = await request.text();
    options = parseRecacheOptions(text.trim() ? JSON.parse(text) : null);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'whattocook-image-recache' } },
  });

  let upserted = 0;
  if (options.rows.length) {
    const { error } = await db.from('image_sources').upsert(
      options.rows.map((row) => ({
        kind: row.kind,
        key: row.key,
        source_url: row.sourceUrl,
        source_page: row.sourcePage,
        license: row.license,
        attribution: row.attribution,
        verified: row.verified,
      })),
      { onConflict: 'kind,key,source_url', ignoreDuplicates: false },
    );
    if (error) return json({ error: `Could not upsert image sources: ${error.message}` }, 500);
    upserted = options.rows.length;
  }

  let query = db
    .from('image_sources')
    .select('id, kind, key, source_url, storage_path')
    .order('id')
    .limit(options.limit);
  if (options.keys) query = query.in('key', options.keys);
  if (options.kinds) query = query.in('kind', options.kinds);
  const { data, error } = await query;
  if (error) return json({ error: `Could not read image sources: ${error.message}` }, 500);

  const rows = (data ?? []) as ImageSourceRow[];
  if (!rows.length) {
    return json({ ok: true, total: 0, cached: 0, skipped: 0, failed: [], upserted }, 200);
  }

  const storage = db.storage.from(IMAGE_BUCKET);
  let cached = 0;
  let skipped = 0;
  let refreshed = 0;
  const failed: Failure[] = [];

  await pool(rows, 6, async (row) => {
    if (!options.force && row.storage_path) {
      skipped += 1;
      return;
    }

    try {
      const image = await download(row.source_url);
      const hash = await sha256(image.bytes);
      const objectPath = storedImagePath(row.kind, row.key, hash, image.contentType);

      if (options.dryRun) {
        refreshed += 1;
        return;
      }

      const { error: uploadError } = await storage.upload(objectPath, image.bytes, {
        contentType: image.contentType,
        cacheControl: IMAGE_CACHE_CONTROL,
        upsert: true,
      });
      if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

      const { error: updateError } = await db
        .from('image_sources')
        .update({
          sha256: hash,
          storage_bucket: IMAGE_BUCKET,
          storage_path: objectPath,
        })
        .eq('id', row.id);
      if (updateError) throw new Error(`database update failed: ${updateError.message}`);

      cached += 1;
    } catch (error) {
      failed.push({
        key: row.key,
        kind: row.kind,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return json(
    {
      ok: failed.length === 0,
      bucket: IMAGE_BUCKET,
      total: rows.length,
      upserted,
      cached,
      skipped,
      dry_run: options.dryRun,
      refreshed,
      failed,
    },
    failed.length ? 500 : 200,
  );
}

Deno.serve((request) => handleRecacheImages(request, Deno.env.toObject()));
