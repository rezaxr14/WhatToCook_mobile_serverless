import { challengeRequired, providerError } from './errors.ts';

/**
 * Play Integrity verification (plan 4.1), server-side only.
 *
 * The Android app requests a token bound to a server nonce and posts it to
 * `verify-challenge`. We decode it through Google's API with a service account,
 * then check the nonce, the package name, device integrity and app integrity.
 * A sideloaded build reports `UNRECOGNIZED_VERSION`, which is acceptable; Play
 * licensing is deliberately not required.
 */

export interface PlayServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface PlayIntegrityPayload {
  requestDetails?: {
    requestPackageName?: string;
    nonce?: string;
    timestampMillis?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
  };
  accountDetails?: {
    appLicensingVerdict?: string;
  };
}

export interface DecodeOptions {
  token: string;
  packageName: string;
  serviceAccount: PlayServiceAccount;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  tokenUrl?: string;
  decodeUrl?: string;
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const ACCEPTED_DEVICE_VERDICTS = new Set([
  'MEETS_DEVICE_INTEGRITY',
  'MEETS_BASIC_INTEGRITY',
]);
const ACCEPTED_APP_VERDICTS = new Set(['PLAY_RECOGNIZED', 'UNRECOGNIZED_VERSION']);

export function parseServiceAccount(raw: string | undefined): PlayServiceAccount | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      token_uri: typeof parsed.token_uri === 'string' ? parsed.token_uri : undefined,
    };
  } catch {
    return null;
  }
}

export async function decodePlayIntegrityToken(
  options: DecodeOptions,
): Promise<PlayIntegrityPayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const accessToken = await serviceAccountAccessToken(options.serviceAccount, {
    fetchImpl,
    now,
    tokenUrl: options.tokenUrl,
  });

  const url =
    options.decodeUrl ??
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(options.packageName)}:decodeIntegrityToken`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrity_token: options.token }),
    });
  } catch {
    throw providerError('Play Integrity is unavailable right now.');
  }
  if (!response.ok) {
    throw providerError('Play Integrity could not decode the token.');
  }

  const body = (await response.json().catch(() => null)) as
    | { tokenPayloadExternal?: PlayIntegrityPayload }
    | null;
  if (!body?.tokenPayloadExternal) {
    throw providerError('Play Integrity returned an unexpected payload.');
  }
  return body.tokenPayloadExternal;
}

export async function verifyPlayIntegrity(
  options: DecodeOptions & { nonce: string },
): Promise<PlayIntegrityPayload> {
  const payload = await decodePlayIntegrityToken(options);
  const details = payload.requestDetails ?? {};

  if (!details.nonce || details.nonce !== options.nonce) {
    throw challengeRequired(['play_integrity'], 'The integrity token is not bound to this request.');
  }
  if (details.requestPackageName && details.requestPackageName !== options.packageName) {
    throw challengeRequired(['play_integrity'], 'The integrity token came from another app.');
  }

  const verdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  if (!verdicts.some((verdict) => ACCEPTED_DEVICE_VERDICTS.has(verdict))) {
    throw challengeRequired(['play_integrity'], 'This device does not meet the integrity bar.');
  }

  const appVerdict = payload.appIntegrity?.appRecognitionVerdict ?? '';
  if (!ACCEPTED_APP_VERDICTS.has(appVerdict)) {
    throw challengeRequired(['play_integrity'], 'This app build is not recognised.');
  }

  return payload;
}

async function serviceAccountAccessToken(
  account: PlayServiceAccount,
  options: { fetchImpl: typeof fetch; now: () => Date; tokenUrl?: string },
): Promise<string> {
  const tokenUrl = options.tokenUrl ?? account.token_uri ?? OAUTH_TOKEN_URL;
  const issuedAt = Math.floor(options.now().getTime() / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: PLAY_SCOPE,
      aud: tokenUrl,
      iat: issuedAt,
      exp: issuedAt + 3600,
    },
    account.private_key,
  );

  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  let response: Response;
  try {
    response = await options.fetchImpl(tokenUrl, { method: 'POST', body: form });
  } catch {
    throw providerError('Play Integrity authentication is unavailable.');
  }
  if (!response.ok) {
    throw providerError('Play Integrity authentication failed.');
  }
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!body?.access_token) {
    throw providerError('Play Integrity authentication returned no token.');
  }
  return body.access_token;
}

async function signJwt(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  privateKeyPem: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const signingInput = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(privateKeyPem) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
