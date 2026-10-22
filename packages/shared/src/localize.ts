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
    const english = record.en;
    if (typeof english === 'string' && english.trim()) return english;
    const first = Object.values(record).find((entry) => typeof entry === 'string');
    return typeof first === 'string' ? first : '';
  }
  return '';
}
