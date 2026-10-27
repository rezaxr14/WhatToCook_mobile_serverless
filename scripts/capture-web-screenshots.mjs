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
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.env.SITE_URL ?? 'http://localhost:4173').replace(/\/+$/, '');
const outDir = process.env.OUT_DIR ?? 'docs/screenshots/web';
const debugDir = process.env.DEBUG_DIR ?? '/tmp/capture-debug';

await mkdir(outDir, { recursive: true });
await mkdir(debugDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-US',
});

// Surface browser-side failures in the CI log: a screenshot step that times out
// is almost always caused by a failed request or a rendering error.
page.on('console', (message) => {
  if (message.type() === 'error') console.error(`[console] ${message.text()}`);
});
page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
page.on('response', (response) => {
  if (response.status() >= 400) {
    console.error(`[http ${response.status()}] ${response.url()}`);
  }
});

// Force English: the screenshot captions are English and the gallery should not
// depend on the runner's locale. The second key is the first-visit gate, which
// otherwise opens the language picker over every screen.
await page.addInitScript(() => {
  window.localStorage.setItem('language', 'en');
  window.localStorage.setItem('whattocook_language_selected', 'en');
});

async function shot(name, options = {}) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/${name}.png`, ...options });
  console.log(`captured ${name}`);
}

let step = 'start';
try {
  step = 'landing';
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // let the landing scene settle
  await shot('landing');

  // Guest demo stocks the pantry and creates the anonymous session the AI
  // functions require. Use the form button (the navbar copy can be covered by
  // the install banner) and wait for the authenticated navbar.
  step = 'guest demo';
  await page.goto(`${base}/auth`, { waitUntil: 'networkidle' });
  // dispatchEvent avoids the decorative cursor/banner overlays that can swallow
  // a real pointer click in headless Chromium.
  await page.getByRole('button', { name: /1-click guest demo/i }).dispatchEvent('click');
  await page.getByLabel('Logout').waitFor({ timeout: 30_000 });

  step = 'recipes';
  await page.goto(`${base}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('recipes');

  step = 'pantry';
  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.getByText('Tomato').first().waitFor({ timeout: 30_000 });
  await shot('pantry');

  step = 'can-cook';
  await page.goto(`${base}/can-cook`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot('can-cook');

  step = 'ai-chef';
  await page.goto(`${base}/ai-chef`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /generate chef recipes/i }).dispatchEvent('click');
  await page.getByText('Chef Creations').waitFor({ timeout: 90_000 });
  await shot('ai-chef');

  step = 'ai-recipe';
  await page.getByText('Cook Full Recipe').first().dispatchEvent('click');
  await page.waitForURL(/\/ai-recipe\//, { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await shot('ai-recipe');

  console.log(`screenshots written to ${outDir}`);
} catch (error) {
  console.error(`failed during "${step}": ${error}`);
  try {
    await page.screenshot({ path: `${debugDir}/failure.png`, fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    await writeFile(`${debugDir}/failure.txt`, `step: ${step}\nurl: ${page.url()}\n\n${text}`);
  } catch (captureError) {
    console.error(`could not capture failure diagnostics: ${captureError}`);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
