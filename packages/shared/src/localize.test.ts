import { describe, expect, it } from 'vitest';

import { localizeJson } from './localize';

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
});
