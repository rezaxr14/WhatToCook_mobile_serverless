/**
 * Capture the web demo screenshots used in README.md.
 *
 * Run against a deployed or locally served build:
 *   SITE_URL=http://localhost:4173 node scripts/capture-web-screenshots.mjs
 *
 * Playwright is not a project dependency; install it in a scratch directory and
 * point NODE_PATH at it (the README screenshots workflow does this):
 *   npm --prefix /tmp/pw install playwright && npx --prefix /tmp/pw playwright install chromium
 *   NODE_PATH=/tmp/pw/node_modules node scripts/capture-web-screenshots.mjs
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.SITE_URL ?? 'http://localhost:4173').replace(/\/+$/, '');
const outDir = process.env.OUT_DIR ?? 'docs/screenshots/web';

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-US',
});

// Force English: the screenshot captions are English and the gallery should not
// depend on the runner's locale.
await page.addInitScript(() => window.localStorage.setItem('language', 'en'));

async function shot(name, options = {}) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/${name}.png`, ...options });
  console.log(`captured ${name}`);
}

try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // let the landing scene settle
  await shot('landing');

  // Guest demo stocks the pantry and creates the anonymous session the AI
  // functions require. Use the form button (the navbar copy can be covered by
  // the install banner) and wait for the authenticated navbar.
  await page.goto(`${base}/auth`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /1-click guest demo/i }).click();
  await page.getByLabel('Logout').waitFor({ timeout: 30_000 });

  await page.goto(`${base}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('recipes');

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.getByText('Tomato').first().waitFor({ timeout: 30_000 });
  await shot('pantry');

  await page.goto(`${base}/can-cook`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot('can-cook');

  await page.goto(`${base}/ai-chef`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /generate chef recipes/i }).click();
  await page.getByText('Chef Creations').waitFor({ timeout: 60_000 });
  await shot('ai-chef');

  await page.getByText('Cook Full Recipe').first().click();
  await page.waitForURL(/\/ai-recipe\//, { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await shot('ai-recipe');

  console.log(`screenshots written to ${outDir}`);
} finally {
  await browser.close();
}
