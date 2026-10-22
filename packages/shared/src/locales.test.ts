import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, isLocale, isRtlLocale, LOCALES, translations } from './index';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locales', () => {
  it('exposes the five supported locales', () => {
    expect(LOCALES).toEqual(['en', 'tr', 'fa', 'ar', 'es']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('marks Persian and Arabic as RTL', () => {
    expect(LOCALES.filter(isRtlLocale)).toEqual(['fa', 'ar']);
  });

  it('narrows known locale strings only', () => {
    expect(isLocale('tr')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });

  it('ships a translation resource for every locale', () => {
    expect(Object.keys(translations).sort()).toEqual([...LOCALES].sort());
  });

  it('keeps every locale at key parity for mobile strings', () => {
    const english = keyPaths(translations.en.mobile).sort();
    for (const locale of LOCALES) {
      expect(keyPaths(translations[locale].mobile).sort(), locale).toEqual(english);
    }
  });

  it('includes the mobile namespace in every locale', () => {
    for (const locale of LOCALES) {
      expect(translations[locale].mobile.tabs.pantry, locale).toBeTruthy();
      expect(translations[locale].mobile.auth.signIn, locale).toBeTruthy();
    }
  });
});
