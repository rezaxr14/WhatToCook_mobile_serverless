import { sha256Hex } from './http.ts';
import { unauthorized } from './errors.ts';
import type { AuthContext } from './types.ts';

/**
 * Service-to-service auth for main's Django adapter (plan 4.3).
 *
 * There is deliberately no `auth.users` row: the service principal is a
 * reserved name, `ai_usage_events.user_id` is nullable, and every service row
 * carries `service_principal`. That keeps the profile/plan tables free of a
 * synthetic account (see docs/DECISIONS.md).
 */
export const SERVICE_PRINCIPAL = 'main-app-service';

/** Shorter keys are refused so a misconfigured deployment fails closed. */
const MIN_SERVICE_KEY_LENGTH = 32;

export interface ServiceAuthOptions {
  /** Reject keys shorter than this unless a test overrides it. */
  minKeyLength?: number;
}

export async function authenticateService(
  request: Request,
  env: Record<string, string | undefined>,
  options: ServiceAuthOptions = {},
): Promise<AuthContext> {
  const expected = env.MAIN_SERVICE_KEY?.trim();
  const minLength = options.minKeyLength ?? MIN_SERVICE_KEY_LENGTH;
  if (!expected || expected.length < minLength) {
    throw unauthorized('Service authentication is not configured.');
  }

  const provided = request.headers.get('x-service-key')?.trim() ?? '';
  if (!provided || !(await constantTimeEquals(provided, expected))) {
    throw unauthorized('Invalid service credentials.');
  }

  return {
    // Not a UUID and never written to a user column: it only seeds the
    // idempotency hash. Service rows use `service_principal`.
    userId: `service:${SERVICE_PRINCIPAL}`,
    token: '',
    profile: {
      id: SERVICE_PRINCIPAL,
      username: SERVICE_PRINCIPAL,
      locale: 'en',
      plan_id: 'service',
    },
    plan: {
      id: 'service',
      features: {},
      monthly_budget_micro_usd: -1,
      max_image_bytes: 5 * 1024 * 1024,
    },
    service: {
      name: SERVICE_PRINCIPAL,
      principalClass: 'registered',
    },
  };
}

/**
 * Compares SHA-256 digests so the comparison time does not depend on where the
 * strings differ and the length cannot be inferred from an early return.
 */
async function constantTimeEquals(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    sha256Hex(left),
    sha256Hex(right),
  ]);
  if (leftDigest.length !== rightDigest.length) return false;
  let diff = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    diff |= leftDigest.charCodeAt(index) ^ rightDigest.charCodeAt(index);
  }
  return diff === 0;
}
