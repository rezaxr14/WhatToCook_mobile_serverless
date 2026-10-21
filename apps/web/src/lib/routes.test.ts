import { describe, expect, it } from 'vitest';

import { localePath } from './routes';

describe('localePath', () => {
  it('prefixes the root path', () => {
    expect(localePath('en')).toBe('/en');
    expect(localePath('ar', '/')).toBe('/ar');
  });

  it('keeps nested paths', () => {
    expect(localePath('tr', '/pantry')).toBe('/tr/pantry');
    expect(localePath('fa', 'cook')).toBe('/fa/cook');
  });
});
