import { describe, expect, it } from 'vitest';

import { formatDuration, remainingSeconds } from './timer';

describe('formatDuration', () => {
  it('formats zero and short durations', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(65)).toBe('01:05');
  });

  it('keeps minutes above 59 rather than switching to hours', () => {
    expect(formatDuration(3600)).toBe('60:00');
    expect(formatDuration(3675)).toBe('61:15');
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatDuration(12.9)).toBe('00:12');
    expect(formatDuration(-3)).toBe('00:00');
  });
});

describe('remainingSeconds', () => {
  it('rounds up partial seconds', () => {
    expect(remainingSeconds(10_200, 10_000)).toBe(1);
    expect(remainingSeconds(10_500, 10_000)).toBe(1);
    expect(remainingSeconds(11_000, 10_000)).toBe(1);
  });

  it('returns zero after the deadline', () => {
    expect(remainingSeconds(9_000, 10_000)).toBe(0);
  });
});
