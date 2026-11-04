import { describe, expect, it } from 'vitest';

import { localizeInstructions, localizeJson } from './localize';

describe('localizeJson', () => {
  it('prefers the requested locale', () => {
    expect(localizeJson({ en: 'Tomato', tr: 'Domates' }, 'tr')).toBe('Domates');
  });

  it('falls back to English when the locale is missing', () => {
    expect(localizeJson({ en: 'Tomato', tr: 'Domates' }, 'fa')).toBe('Tomato');
  });

  it('returns plain strings unchanged', () => {
    expect(localizeJson('Step one')).toBe('Step one');
  });

  it('joins step arrays', () => {
    expect(localizeJson([{ step: 'Chop' }, { step: 'Fry' }])).toBe('Chop\nFry');
  });

  it('handles empty and null values', () => {
    expect(localizeJson(null)).toBe('');
    expect(localizeJson({})).toBe('');
  });

  it('joins a localized step array', () => {
    expect(localizeJson({ en: ['Chop', 'Fry'], fa: ['خرد کن', 'سرخ کن'] }, 'fa')).toBe(
      'خرد کن\nسرخ کن',
    );
  });
});

describe('localizeInstructions', () => {
  it('prefers the localized step list', () => {
    expect(localizeInstructions(['Cook.'], { fa: ['بپزید.'], tr: ['Pişirin.'] }, 'fa')).toBe(
      'بپزید.',
    );
  });

  it('falls back to the canonical English steps', () => {
    expect(localizeInstructions(['Cook.'], { fa: ['بپزید.'] }, 'es')).toBe('Cook.');
    expect(localizeInstructions(['Cook.'], {}, 'fa')).toBe('Cook.');
    expect(localizeInstructions(['Cook.'], null, 'fa')).toBe('Cook.');
  });
});
