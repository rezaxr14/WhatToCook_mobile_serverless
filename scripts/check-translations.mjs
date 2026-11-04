#!/usr/bin/env node
/**
 * Fail CI when a user-facing string is missing a locale.
 *
 * Checks, in order:
 *  1. `packages/shared/src/locales/*.json` — identical flattened key sets.
 *  2. `supabase/seed/translations/recipes.json` — every recipe has tr/fa/ar/es
 *     for its title and description, and the same step count in each language.
 *  3. `dish-catalog.json` — five names, at least one keyword, a cuisine/group.
 *
 * There is no review step by design: this is the gate that makes "translated"
 * mean "present in all five languages".
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'tr', 'fa', 'ar', 'es'];
const EXTRA_LOCALES = ['tr', 'fa', 'ar', 'es'];
const problems = [];

function flatten(value, prefix = '') {
  const out = [];
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      out.push(...flatten(entry, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

async function checkLocales() {
  const dir = join(ROOT, 'packages', 'shared', 'src', 'locales');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  const sets = new Map();
  for (const file of files) {
    const locale = file.replace(/\.json$/, '');
    const json = JSON.parse(await readFile(join(dir, file), 'utf8'));
    sets.set(locale, new Set(flatten(json)));
  }
  for (const locale of LOCALES) {
    if (!sets.has(locale)) {
      problems.push(`locales: missing ${locale}.json`);
      continue;
    }
    const base = sets.get('en');
    for (const key of base) {
      if (!sets.get(locale).has(key)) problems.push(`locales/${locale}.json: missing "${key}"`);
    }
  }
}

async function checkRecipes() {
  const file = join(ROOT, 'supabase', 'seed', 'translations', 'recipes.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  const recipes = Array.isArray(data.recipes) ? data.recipes : [];
  if (!recipes.length) problems.push('translations/recipes.json: no recipes');
  const ids = new Set();
  for (const recipe of recipes) {
    const id = recipe.id ?? '?';
    if (ids.has(id)) problems.push(`translations/recipes.json: duplicate id ${id}`);
    ids.add(id);
    for (const locale of EXTRA_LOCALES) {
      if (!recipe.title?.[locale]?.trim()) problems.push(`recipe ${id}: title.${locale}`);
      if (!recipe.description?.[locale]?.trim())
        problems.push(`recipe ${id}: description.${locale}`);
      const steps = recipe.instructions?.[locale];
      if (!Array.isArray(steps) || steps.length === 0) {
        problems.push(`recipe ${id}: instructions.${locale}`);
        continue;
      }
      const expected = recipe.instructions.tr?.length ?? steps.length;
      if (steps.length !== expected) {
        problems.push(
          `recipe ${id}: instructions.${locale} has ${steps.length} steps, tr has ${expected}`,
        );
      }
    }
  }
}

async function checkCatalog() {
  const data = JSON.parse(await readFile(join(ROOT, 'dish-catalog.json'), 'utf8'));
  const dishes = Array.isArray(data.dishes) ? data.dishes : [];
  if (dishes.length < 380) problems.push(`dish-catalog.json: only ${dishes.length} dishes`);
  const keys = new Set();
  for (const dish of dishes) {
    if (!dish.key) problems.push('dish-catalog.json: dish without key');
    if (keys.has(dish.key)) problems.push(`dish-catalog.json: duplicate key ${dish.key}`);
    keys.add(dish.key);
    for (const locale of LOCALES) {
      if (!dish.names?.[locale]?.trim()) problems.push(`${dish.key}: names.${locale}`);
    }
    if (!Array.isArray(dish.keywords) || dish.keywords.length === 0) {
      problems.push(`${dish.key}: no keywords`);
    }
    if (!dish.cuisine) problems.push(`${dish.key}: no cuisine`);
    if (!dish.group) problems.push(`${dish.key}: no group`);
  }
}

await checkLocales();
await checkRecipes();
await checkCatalog();

if (problems.length) {
  console.error(`Missing translations (${problems.length}):`);
  for (const problem of problems.slice(0, 200)) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Translations are complete: locales, recipes and dish catalog cover en/tr/fa/ar/es.');
