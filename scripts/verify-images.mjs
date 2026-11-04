#!/usr/bin/env node
/**
 * Read-only image check against the deployed project.
 *
 * Fails when any catalog object, seed object, or `ingredients.image_path`
 * does not return 200 with an image content type and the ten-year cache header.
 * Runs after a staging deploy and can be run by hand:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/verify-images.mjs
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const BUCKET = process.env.IMAGE_BUCKET || 'recipe-images';
const EXPECTED_CACHE = process.env.EXPECTED_CACHE_CONTROL || 'max-age=315360000';
const CONCURRENCY = Number(process.env.CHECK_CONCURRENCY || 8);

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL is required.');
  process.exit(1);
}

const problems = [];
let checked = 0;

async function checkObject(bucket, path, label) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  try {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'image/*' } });
    checked += 1;
    if (response.status !== 200) {
      problems.push(`${label}: HTTP ${response.status} (${url})`);
      await response.body?.cancel();
      return;
    }
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) {
      problems.push(`${label}: content-type ${type || 'missing'} (${url})`);
    }
    const cache = (response.headers.get('cache-control') || '').toLowerCase();
    if (!cache.includes(EXPECTED_CACHE.toLowerCase())) {
      problems.push(
        `${label}: cache-control "${cache}" does not include "${EXPECTED_CACHE}" (${url})`,
      );
    }
    await response.body?.cancel();
  } catch (error) {
    problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function pool(items, work) {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
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

const jobs = [];
for (const folder of ['recipes', 'dishes', 'ingredients']) {
  const dir = join(ROOT, 'supabase', 'seed-images', folder);
  const names = await readdir(dir).catch(() => []);
  for (const name of names)
    jobs.push({ bucket: BUCKET, path: `${folder}/${name}`, label: `${folder}/${name}` });
}

if (KEY) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/ingredients?select=slug,image_path&image_path=not.is.null`,
    {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    },
  );
  if (response.ok) {
    for (const row of await response.json()) {
      if (row?.image_path)
        jobs.push({
          bucket: 'ingredient-images',
          path: row.image_path,
          label: `ingredient ${row.slug}`,
        });
    }
  } else {
    problems.push(`ingredients query: HTTP ${response.status}`);
  }
}

await pool(jobs, (job) => checkObject(job.bucket, job.path, job.label));

if (problems.length) {
  console.error(`Image check failed (${problems.length} of ${checked}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `Image check passed: ${checked} objects return an image with the expected cache header.`,
);
