import { AI_LIMITS } from '../../../packages/shared/src/ai-contracts.ts';
import { challengeKinds, verifyTurnstile } from './challenge.ts';
import { checkCors } from './cors.ts';
import { badRequest, challengeRequired, providerError } from './errors.ts';
import {
  errorResponse as gatewayErrorResponse,
  loadRequestContext,
  platformOf,
  preflight,
} from './gateway.ts';
import { jsonResponse, readJsonBody } from './http.ts';
import { parseServiceAccount, verifyPlayIntegrity } from './play-integrity.ts';
import type { GatewayDeps } from './types.ts';

const NONCE_TTL_SECONDS = 300;
const MAX_CHALLENGE_TOKEN_LENGTH = 16_384;

export interface ChallengeHandlerOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * `GET challenge-nonce`: a short-lived, single-use nonce for Play Integrity.
 * The nonce is stored server-side; the client never gets to choose it.
 */
export async function handleChallengeNonce(
  request: Request,
  deps: GatewayDeps,
): Promise<Response> {
  const pre = await preflight(request, deps);
  if (pre) return pre;

  let cors = checkCors(request, deps.allowedOrigins()).headers;
  try {
    const context = await loadRequestContext(request, deps);
    if (context instanceof Response) return context;
    const { auth, config, cors: contextCors } = context;
    cors = contextCors;

    if (request.method !== 'GET') throw badRequest('Use GET for a challenge nonce.');

    const nonce = await deps.quota.createChallengeNonce(auth.userId, NONCE_TTL_SECONDS);
    return jsonResponse(
      {
        nonce: nonce.nonce,
        expires_at: nonce.expiresAt,
        platforms: challengeKinds(platformOf(request), config),
      },
      200,
      cors,
    );
  } catch (error) {
    return gatewayErrorResponse(error, cors);
  }
}

/**
 * `verify-challenge`: validates a Turnstile token (web) or a Play Integrity
 * token (Android) and resets the adaptive counter. Tokens are single use.
 */
export async function handleVerifyChallenge(
  request: Request,
  deps: GatewayDeps,
  options: ChallengeHandlerOptions = {},
): Promise<Response> {
  const pre = await preflight(request, deps);
  if (pre) return pre;

  let cors = checkCors(request, deps.allowedOrigins()).headers;
  try {
    const context = await loadRequestContext(request, deps);
    if (context instanceof Response) return context;
    const { auth, config, cors: contextCors } = context;
    cors = contextCors;

    if (request.method !== 'POST') throw badRequest('Use POST to verify a challenge.');

    const body = await readJsonBody(request, AI_LIMITS.maxJsonBodyBytes);
    const kind = body.kind;
    if (kind !== 'turnstile' && kind !== 'play_integrity') {
      throw badRequest('kind must be "turnstile" or "play_integrity".');
    }
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) throw badRequest('A verification token is required.');
    if (token.length > MAX_CHALLENGE_TOKEN_LENGTH) throw badRequest('The token is too long.');

    const env = options.env ?? Deno.env.toObject();

    if (kind === 'turnstile') {
      await verifyTurnstile({
        secret: env.TURNSTILE_SECRET_KEY?.trim() ?? '',
        token,
        action: config.challenge.turnstileAction,
        allowedHostnames: commaList(env.TURNSTILE_ALLOWED_HOSTNAMES),
        remoteIp: request.headers.get('cf-connecting-ip'),
        fetchImpl: options.fetchImpl,
        siteverifyUrl: env.TURNSTILE_SITEVERIFY_URL?.trim() || undefined,
      });
    } else {
      const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
      if (!nonce) throw badRequest('A nonce is required for Play Integrity.');

      const serviceAccount = parseServiceAccount(env.PLAY_INTEGRITY_SERVICE_ACCOUNT);
      if (!serviceAccount) {
        // Plan prerequisite H2 is missing. Turnstile remains the enforced path
        // and mobile enforcement is off until the service account exists.
        throw providerError('Play Integrity is not configured on the server.');
      }
      const consumed = await deps.quota.consumeChallengeNonce(auth.userId, nonce);
      if (!consumed) {
        throw challengeRequired(['play_integrity'], 'The nonce expired or was already used.');
      }
      await verifyPlayIntegrity({
        token,
        nonce,
        packageName: env.PLAY_INTEGRITY_PACKAGE_NAME?.trim() || 'com.whattocook.app',
        serviceAccount,
        fetchImpl: options.fetchImpl,
        now: options.now,
        tokenUrl: env.GOOGLE_OAUTH_TOKEN_URL?.trim() || undefined,
        decodeUrl: env.PLAY_INTEGRITY_DECODE_URL?.trim() || undefined,
      });
    }

    await deps.quota.resetChallenge(auth.userId, kind);
    return jsonResponse(
      { verified: true, kind, verified_at: (options.now?.() ?? new Date()).toISOString() },
      200,
      cors,
    );
  } catch (error) {
    return gatewayErrorResponse(error, cors);
  }
}

function commaList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
