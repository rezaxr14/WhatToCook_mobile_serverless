import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  completeChallenge,
  failChallenge,
  requestChallenge,
  subscribeChallenge,
} from './challenge';

afterEach(() => {
  // Leave the store closed even if an assertion failed mid-challenge.
  completeChallenge();
});

describe('challenge store', () => {
  it('opens once and shares the pending promise across concurrent calls', async () => {
    const states: boolean[] = [];
    const unsubscribe = subscribeChallenge((open) => states.push(open));

    const first = requestChallenge();
    const second = requestChallenge();
    expect(second).toBe(first);
    expect(states).toEqual([false, true]);

    completeChallenge();
    await expect(first).resolves.toBeUndefined();
    expect(states).toEqual([false, true, false]);

    unsubscribe();
  });

  it('starts a fresh challenge after one completes', async () => {
    const first = requestChallenge();
    completeChallenge();
    await first;

    const second = requestChallenge();
    expect(second).not.toBe(first);
    completeChallenge();
    await second;
  });

  it('rejects the waiting request when the user cancels', async () => {
    const pending = requestChallenge();
    failChallenge(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
  });

  it('does not throw when nothing is waiting', () => {
    const spy = vi.fn();
    const unsubscribe = subscribeChallenge(spy);
    completeChallenge();
    failChallenge(new Error('nothing pending'));
    expect(spy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
