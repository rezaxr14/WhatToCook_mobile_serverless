import { normalizeIngredientName } from '../../../packages/shared/src/ai-contracts.ts';
import type { DbClient } from './db.ts';
import { mapDatabaseError } from './errors.ts';

export interface CatalogIngredient {
  id: number;
  slug: string;
  name_en: string;
  names: Record<string, string>;
  category: string;
}

export interface DetectedIngredient {
  name: string;
  display_name?: string;
  category: string;
  confidence: number;
  estimated_quantity?: string | null;
}

export interface MappedIngredient extends DetectedIngredient {
  ingredient_id: number | null;
  slug: string | null;
  matched: boolean;
}

export async function loadCatalog(db: DbClient): Promise<CatalogIngredient[]> {
  const { data, error } = await db
    .from('ingredients')
    .select('id, slug, name_en, names, category')
    .order('id', { ascending: true });
  if (error) throw mapDatabaseError(error.message, error);
  return (data ?? []) as CatalogIngredient[];
}

export function buildCatalogIndex(catalog: CatalogIngredient[]): Map<string, CatalogIngredient> {
  const index = new Map<string, CatalogIngredient>();
  const add = (key: string, ingredient: CatalogIngredient) => {
    const normalized = normalizeIngredientName(key);
    if (normalized && !index.has(normalized)) index.set(normalized, ingredient);
  };

  for (const ingredient of catalog) {
    add(ingredient.name_en, ingredient);
    add(ingredient.slug.replaceAll('-', ' '), ingredient);
    for (const localized of Object.values(ingredient.names ?? {})) {
      if (typeof localized === 'string') add(localized, ingredient);
    }
    for (const variant of pluralVariants(ingredient.name_en)) add(variant, ingredient);
  }
  return index;
}

export function mapDetectedIngredients(input: {
  detections: DetectedIngredient[];
  catalog: CatalogIngredient[];
  locale: string;
  minConfidence: number;
  maxItems: number;
}): MappedIngredient[] {
  const index = buildCatalogIndex(input.catalog);
  const byKey = new Map<string, MappedIngredient>();

  for (const detection of input.detections) {
    if (detection.confidence < input.minConfidence) continue;
    const key = normalizeIngredientName(detection.name);
    const match = index.get(key) ?? index.get(singularize(key));
    const mapped: MappedIngredient = {
      ...detection,
      ingredient_id: match?.id ?? null,
      slug: match?.slug ?? null,
      matched: Boolean(match),
      display_name:
        detection.display_name?.trim() ||
        (match && localizedName(match, input.locale)) ||
        detection.name,
    };
    const dedupeKey = match ? `id:${match.id}` : `name:${key}`;
    const existing = byKey.get(dedupeKey);
    if (!existing || existing.confidence < mapped.confidence) byKey.set(dedupeKey, mapped);
  }

  return [...byKey.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, input.maxItems);
}

function localizedName(ingredient: CatalogIngredient, locale: string): string | undefined {
  const value = ingredient.names?.[locale];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function singularize(value: string): string {
  if (value.endsWith('ies') && value.length > 3) return `${value.slice(0, -3)}y`;
  if (value.endsWith('es') && value.length > 2) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 1) return value.slice(0, -1);
  return value;
}

function pluralVariants(name: string): string[] {
  const normalized = normalizeIngredientName(name);
  const variants = new Set<string>();
  if (normalized.endsWith('y')) variants.add(`${normalized.slice(0, -1)}ies`);
  if (normalized.endsWith('s')) {
    variants.add(normalized.slice(0, -1));
    variants.add(singularize(normalized));
  } else {
    variants.add(`${normalized}s`);
    if (normalized.endsWith('o') || normalized.endsWith('ch') || normalized.endsWith('sh')) {
      variants.add(`${normalized}es`);
    }
  }
  return [...variants];
}
