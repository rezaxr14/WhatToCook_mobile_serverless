#!/usr/bin/env node
/**
 * Writes `robots.txt` and (when the site origin is known) `sitemap.xml` into
 * `dist/`. Set `VITE_SITE_URL` (e.g. https://whattocook.app) in the deploy
 * environment; without it the build still succeeds but no sitemap is emitted
 * and robots.txt stays permissive without a Sitemap line.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Keep in sync with INDEXABLE_ROUTES in src/lib/seo.ts.
const ROUTES = ['/', '/recipes', '/can-cook'];
const DISALLOW = ['/pantry', '/ai-chef', '/ai', '/aichef', '/auth', '/ai-recipe/'];

const siteUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
const today = new Date().toISOString().slice(0, 10);

const robots = ['User-agent: *', 'Allow: /', ...DISALLOW.map((path) => `Disallow: ${path}`)];
if (siteUrl) robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`);

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'robots.txt'), `${robots.join('\n')}\n`);

if (!siteUrl) {
  console.warn('[sitemap] VITE_SITE_URL is not set - skipping sitemap.xml');
  process.exit(0);
}

const urls = ROUTES.map(
  (route) =>
    `  <url>\n    <loc>${siteUrl}${route}</loc>\n    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>${route === '/' ? 'weekly' : 'daily'}</changefreq>\n` +
    `    <priority>${route === '/' ? '1.0' : '0.8'}</priority>\n  </url>`,
).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

writeFileSync(join(DIST, 'sitemap.xml'), sitemap);
console.log(`[sitemap] wrote ${ROUTES.length} URLs for ${siteUrl}`);
