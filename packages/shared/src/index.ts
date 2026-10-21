export const APP_NAME = 'WhatToCook' as const;

/**
 * Locales supported by both clients. The order is the order used in the
 * language picker: English, Turkish, Persian, Arabic, Spanish.
 */
export const LOCALES = ['en', 'tr', 'fa', 'ar', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Right-to-left locales; used to set `dir` on web and `I18nManager` on mobile. */
export const RTL_LOCALES = ['fa', 'ar'] as const satisfies readonly Locale[];

export function isRtlLocale(locale: Locale): boolean {
  return (RTL_LOCALES as readonly Locale[]).includes(locale);
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
