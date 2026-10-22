import ar from './locales/ar.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fa from './locales/fa.json';
import tr from './locales/tr.json';
import type { Locale } from './index';

/**
 * Shared translation resources. Web and mobile both consume this map so copy
 * changes land in one place. Locale metadata (order, RTL flags) lives in
 * `index.ts`.
 */
export const translations = { en, tr, fa, ar, es } as const satisfies Record<Locale, unknown>;

export type TranslationResource = typeof en;
