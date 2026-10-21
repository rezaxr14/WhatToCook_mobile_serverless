import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, isLocale, isRtlLocale, LOCALES } from './index';

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
});
