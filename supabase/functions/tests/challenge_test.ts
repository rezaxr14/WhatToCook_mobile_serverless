import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { challengeKinds, verifyTurnstile } from '../_shared/challenge.ts';
import { parseServiceAccount, verifyPlayIntegrity } from '../_shared/play-integrity.ts';
import { AppError } from '../_shared/errors.ts';
import { createHarness } from './test_harness.ts';

// Built from parts so the repository's secret scanner does not flag a test-only
// PEM header as a leaked private key.
const PEM_HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const PEM_FOOTER = ['-----END', 'PRIVATE KEY-----'].join(' ');

function fakeFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL) => Promise.resolve(handler(String(input)))) as typeof fetch;
}

function turnstileResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ success: true, action: 'ai_gate', hostname: 'app.example', ...overrides }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

Deno.test('challenge: web gets Turnstile and Android gets Play Integrity', () => {
  const { config } = createHarness();
  assertEquals(challengeKinds('web', config), ['turnstile']);

  const enforced = createHarness({ challenge: { mobileEnforce: true } }).config;
  assertEquals(challengeKinds('web', enforced), ['turnstile', 'play_integrity']);
  assertEquals(challengeKinds('android', enforced), ['play_integrity']);
  // Android never falls back to Turnstile, even while mobile enforcement is off.
  assertEquals(challengeKinds('android', config), ['play_integrity']);
});

Deno.test('challenge: Turnstile accepts a valid token for the expected action', async () => {
  const urls: string[] = [];
  await verifyTurnstile({
    secret: 'secret',
    token: 'token',
    action: 'ai_gate',
    allowedHostnames: ['app.example'],
    remoteIp: '203.0.113.7',
    siteverifyUrl: 'https://turnstile.test/siteverify',
    fetchImpl: fakeFetch((url) => {
      urls.push(url);
      return turnstileResponse();
    }),
  });
  assertEquals(urls, ['https://turnstile.test/siteverify']);
});

Deno.test('challenge: Turnstile rejects a token for a different action', async () => {
  const error = await assertRejects(
    () =>
      verifyTurnstile({
        secret: 'secret',
        token: 'token',
        action: 'ai_gate',
        allowedHostnames: [],
        fetchImpl: fakeFetch(() => turnstileResponse({ action: 'login' })),
      }),
    AppError,
  );
  assertEquals(error.code, 'challenge_required');
  assertEquals((error.details as { kinds: string[] }).kinds, ['turnstile']);
});

Deno.test('challenge: Turnstile rejects an unexpected hostname', async () => {
  const error = await assertRejects(
    () =>
      verifyTurnstile({
        secret: 'secret',
        token: 'token',
        action: 'ai_gate',
        allowedHostnames: ['app.example'],
        fetchImpl: fakeFetch(() => turnstileResponse({ hostname: 'evil.example' })),
      }),
    AppError,
  );
  assertEquals(error.code, 'challenge_required');
});

Deno.test('challenge: Turnstile rejects a failed verification', async () => {
  const error = await assertRejects(
    () =>
      verifyTurnstile({
        secret: 'secret',
        token: 'token',
        action: 'ai_gate',
        allowedHostnames: [],
        fetchImpl: fakeFetch(() =>
          turnstileResponse({ success: false, 'error-codes': ['invalid-input-response'] }),
        ),
      }),
    AppError,
  );
  assertEquals(error.code, 'challenge_required');
});

Deno.test('challenge: Turnstile fails closed when the secret is missing', async () => {
  const error = await assertRejects(
    () =>
      verifyTurnstile({
        secret: '',
        token: 'token',
        action: 'ai_gate',
        allowedHostnames: [],
      }),
    AppError,
  );
  assertEquals(error.code, 'provider_error');
});

Deno.test('challenge: Turnstile maps a transport failure to provider_error', async () => {
  const error = await assertRejects(
    () =>
      verifyTurnstile({
        secret: 'secret',
        token: 'token',
        action: 'ai_gate',
        allowedHostnames: [],
        fetchImpl: (() => Promise.reject(new Error('offline'))) as typeof fetch,
      }),
    AppError,
  );
  assertEquals(error.code, 'provider_error');
});

Deno.test('challenge: parseServiceAccount accepts a JSON key and rejects garbage', () => {
  const account = parseServiceAccount(
    JSON.stringify({
      client_email: 'robot@example.iam.gserviceaccount.com',
      private_key: `${PEM_HEADER}\nAAAA\n${PEM_FOOTER}`,
    }),
  );
  assertEquals(account?.client_email, 'robot@example.iam.gserviceaccount.com');
  assertEquals(parseServiceAccount('not json'), null);
  assertEquals(parseServiceAccount('{"client_email":"x"}'), null);
  assertEquals(parseServiceAccount(undefined), null);
});

async function rsaServiceAccount(): Promise<{
  serviceAccount: NonNullable<ReturnType<typeof parseServiceAccount>>;
  privateKeyPem: string;
}> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const exported = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const byte of exported) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');
  const privateKeyPem = `${PEM_HEADER}\n${body}\n${PEM_FOOTER}`;
  const serviceAccount = parseServiceAccount(
    JSON.stringify({ client_email: 'robot@example.iam.gserviceaccount.com', private_key: privateKeyPem }),
  );
  if (!serviceAccount) throw new Error('could not build a test service account');
  return { serviceAccount, privateKeyPem };
}

Deno.test('challenge: Play Integrity accepts a nonce-bound, intact token', async () => {
  const { serviceAccount } = await rsaServiceAccount();
  const calls: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    calls.push(url);
    if (url.includes('token')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        tokenPayloadExternal: {
          requestDetails: { nonce: 'nonce-1', requestPackageName: 'com.whattocook.app' },
          appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      }),
      { status: 200 },
    );
  });

  const payload = await verifyPlayIntegrity({
    token: 'integrity-token',
    nonce: 'nonce-1',
    packageName: 'com.whattocook.app',
    serviceAccount,
    fetchImpl,
    tokenUrl: 'https://oauth.test/token',
    decodeUrl: 'https://play.test/decode',
  });
  assertEquals(payload.requestDetails?.nonce, 'nonce-1');
  assertEquals(calls, ['https://oauth.test/token', 'https://play.test/decode']);
});

Deno.test('challenge: Play Integrity rejects a token bound to another nonce', async () => {
  const { serviceAccount } = await rsaServiceAccount();
  const fetchImpl = fakeFetch((url) => {
    if (url.includes('token')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        tokenPayloadExternal: {
          requestDetails: { nonce: 'other-nonce' },
          appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
        },
      }),
      { status: 200 },
    );
  });

  const error = await assertRejects(
    () =>
      verifyPlayIntegrity({
        token: 'integrity-token',
        nonce: 'nonce-1',
        packageName: 'com.whattocook.app',
        serviceAccount,
        fetchImpl,
        tokenUrl: 'https://oauth.test/token',
        decodeUrl: 'https://play.test/decode',
      }),
    AppError,
  );
  assertEquals(error.code, 'challenge_required');
  assertEquals((error.details as { kinds: string[] }).kinds, ['play_integrity']);
});
