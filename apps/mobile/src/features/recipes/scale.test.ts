import { describe, expect, it } from 'vitest';

import { scaleQuantity } from './scale';

describe('scaleQuantity', () => {
  it('returns the quantity unchanged for a 1x multiplier', () => {
    expect(scaleQuantity('2', 1)).toBe('2');
  });

  it('scales whole numbers and keeps the unit suffix', () => {
    expect(scaleQuantity('2 cups', 2)).toBe('4 cups');
  });

  it('scales fractions', () => {
    expect(scaleQuantity('1/2 tsp', 2)).toBe('1 tsp');
    expect(scaleQuantity('3/4 cup', 2)).toBe('1.5 cup');
  });

  it('scales decimals without floating point noise', () => {
    expect(scaleQuantity('2.5', 1.5)).toBe('3.75');
  });

  it('leaves non-numeric amounts alone', () => {
    expect(scaleQuantity('to taste', 2)).toBe('to taste');
    expect(scaleQuantity('', 2)).toBe('');
  });
});
