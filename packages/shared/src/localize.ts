import type { Json } from './database.types';

/**
 * Read a localized JSONB field (`{ "en": "...", "tr": "..." }`) and fall back to
 * English, then to the first available string.
 *
 * Also flattens the step-array shape used by recipe instructions.
 */
export function localizeJson(value: Json | null | undefined, locale = 'en'): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const step = (entry as Record<string, Json>).step;
          if (typeof step === 'string') return step;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, Json>;
    const preferred = record[locale];
    if (typeof preferred === 'string' && preferred.trim()) return preferred;
    // Localized step lists (`{"fa": ["1. ...", "2. ..."]}`) recurse into the
    // same flattener so callers get one newline-joined string.
    if (Array.isArray(preferred) && preferred.length > 0) return localizeJson(preferred, locale);
    const english = record.en;
    if (typeof english === 'string' && english.trim()) return english;
    if (Array.isArray(english) && english.length > 0) return localizeJson(english, locale);
    const first = Object.values(record).find(
      (entry) => typeof entry === 'string' || Array.isArray(entry),
    );
    return first == null ? '' : localizeJson(first, locale);
  }
  return '';
}

/**
 * Prefer the localized step list (`instructions_i18n`), then the canonical
 * English `instructions`. Installed clients that predate the column still send
 * only the second argument, so both shapes keep working.
 */
export function localizeInstructions(
  instructions: Json | null | undefined,
  instructionsI18n: Json | null | undefined,
  locale = 'en',
): string {
  if (
    instructionsI18n &&
    typeof instructionsI18n === 'object' &&
    !Array.isArray(instructionsI18n)
  ) {
    const record = instructionsI18n as Record<string, Json>;
    if (locale !== 'en' && (record[locale] != null || record.en != null)) {
      const localized = localizeJson(record, locale);
      if (localized.trim()) return localized;
    }
  }
  return localizeJson(instructions, locale);
}
