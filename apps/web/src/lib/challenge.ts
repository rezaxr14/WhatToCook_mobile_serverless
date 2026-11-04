/**
 * Bridge between the fetch layer and the Turnstile modal.
 *
 * `aiApi` cannot use hooks, so a tiny module-level store lets the mounted
 * `ChallengeModal` subscribe to "a challenge is needed" and resolve or reject
 * the request that is waiting for it. Concurrent AI calls share one challenge
 * instead of stacking modals.
 */

type Listener = (open: boolean) => void;

const listeners = new Set<Listener>();

let open = false;
let pending: Promise<void> | null = null;
let resolvePending: (() => void) | null = null;
let rejectPending: ((reason: Error) => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener(open);
}

function setOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  emit();
}

export function subscribeChallenge(listener: Listener): () => void {
  listeners.add(listener);
  listener(open);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the user to solve a Turnstile challenge; resolves once the server accepts it. */
export function requestChallenge(): Promise<void> {
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
    setOpen(true);
  });
  return pending;
}

/** The widget produced a token and `verify-challenge` accepted it. */
export function completeChallenge(): void {
  const resolve = resolvePending;
  reset();
  resolve?.();
}

/** The user cancelled or verification failed. */
export function failChallenge(reason: Error): void {
  const reject = rejectPending;
  reset();
  reject?.(reason);
}

function reset(): void {
  pending = null;
  resolvePending = null;
  rejectPending = null;
  setOpen(false);
}
