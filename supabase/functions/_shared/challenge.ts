import { challengeRequired, providerError } from './errors.ts';
import type { AuthContext, QuotaGateway, RuntimeConfig } from './types.ts';

export type ChallengeKind = 'turnstile' | 'play_integrity';
export type ClientPlatform = 'android' | 'web';

/**
 * Which challenge the caller can solve. Web always has Turnstile; Android uses
 * Play Integrity only when `challenge_mobile_enforce` is on (plan H2).
 */
export function challengeKinds(
  platform: ClientPlatform,
  config: RuntimeConfig,
): ChallengeKind[] {
  if (platform === 'android') return ['play_integrity'];
  return config.challenge.mobileEnforce ? ['turnstile', 'play_integrity'] : ['turnstile'];
}

/**
 * Adaptive challenge gate (plan 4.1). Call only for a request that would reach
 * a provider: cache hits and already-cached idempotent replays never get here,
 * so they cost nothing and never trigger a challenge.
 *
 * Service calls keep their own pool and are not challenged. Android is skipped
 * while `challenge_mobile_enforce` is false; its lower unattested daily cap is
 * applied by `reserveUsage` instead.
 */
export async function enforceChallenge(input: {
  auth: AuthContext;
  config: RuntimeConfig;
  platform: ClientPlatform;
  quota: QuotaGateway;
}): Promise<void> {
  if (input.auth.service) return;
  if (input.auth.challengeExempt) return;
  if (input.platform === 'android' && !input.config.challenge.mobileEnforce) return;

  const decision = await input.quota.consumeChallenge(
    input.auth.userId,
    input.config.challenge.everyNCalls,
  );
  if (!decision.allowed) {
    throw challengeRequired(challengeKinds(input.platform, input.config));
  }
}

export interface TurnstileResult {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export interface TurnstileOptions {
  secret: string;
  token: string;
  action: string;
  /** When non-empty, the token's hostname must be in this list. */
  allowedHostnames: string[];
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
  siteverifyUrl?: string;
}

const DEFAULT_SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Server-side Turnstile validation (plan 4.1). Tokens are single use, so this
 * must only be called from `verify-challenge`, never repeated for the same
 * token.
 */
export async function verifyTurnstile(options: TurnstileOptions): Promise<void> {
  if (!options.secret) {
    throw providerError('Turnstile is not configured on the server.');
  }
  if (!options.token) {
    throw challengeRequired(['turnstile'], 'A verification token is required.');
  }

  const form = new URLSearchParams({
    secret: options.secret,
    response: options.token,
  });
  if (options.remoteIp) form.set('remoteip', options.remoteIp);

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(options.siteverifyUrl ?? DEFAULT_SITEVERIFY, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw providerError('Turnstile verification is unavailable right now.');
  }
  if (!response.ok) {
    throw providerError('Turnstile verification is unavailable right now.');
  }

  const result = (await response.json().catch(() => null)) as TurnstileResult | null;
  if (!result || result.success !== true) {
    throw challengeRequired(['turnstile'], 'The verification did not pass. Please try again.');
  }
  if (options.action && result.action !== options.action) {
    throw challengeRequired(['turnstile'], 'The verification was for a different action.');
  }
  if (options.allowedHostnames.length > 0) {
    const hostname = (result.hostname ?? '').toLowerCase();
    if (!options.allowedHostnames.includes(hostname)) {
      throw challengeRequired(['turnstile'], 'The verification came from an unexpected origin.');
    }
  }
}
