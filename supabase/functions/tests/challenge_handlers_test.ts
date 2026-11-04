import { assertEquals } from 'jsr:@std/assert@1';
import {
  handleChallengeNonce,
  handleVerifyChallenge,
} from '../_shared/challenge-handlers.ts';
import { createHarness, jsonRequest } from './test_harness.ts';

const TURNSTILE_ENV = {
  TURNSTILE_SECRET_KEY: 'test-secret',
  TURNSTILE_ALLOWED_HOSTNAMES: 'localhost, app.example',
};

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )) as typeof fetch;
}

Deno.test('challenge nonce: GET returns a single-use nonce and platform kinds', async () => {
  const harness = createHarness();
  const response = await handleChallengeNonce(
    jsonRequest({}, { method: 'GET' }),
    harness.deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(typeof body.nonce, 'string');
  assertNonce(body.nonce);
  assertEquals(harness.quota.createdNonces.includes(body.nonce), true);
  assertEquals(body.platforms, ['turnstile']);
  assertEquals(typeof body.expires_at, 'string');
});

Deno.test('challenge nonce: Android asks for Play Integrity even when enforcement is off', async () => {
  const harness = createHarness({ challenge: { mobileEnforce: false } });
  const response = await handleChallengeNonce(
    jsonRequest({}, { method: 'GET', platform: 'android' }),
    harness.deps,
  );

  assertEquals(response.status, 200);
  assertEquals((await response.json()).platforms, ['play_integrity']);
});

Deno.test('challenge nonce: POST is rejected', async () => {
  const harness = createHarness();
  const response = await handleChallengeNonce(
    jsonRequest({}, { method: 'POST' }),
    harness.deps,
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).code, 'bad_request');
});

Deno.test('verify-challenge: a valid Turnstile token resets the counter', async () => {
  const harness = createHarness();
  const response = await handleVerifyChallenge(
    jsonRequest({ kind: 'turnstile', token: 'valid-token' }),
    harness.deps,
    {
      env: TURNSTILE_ENV,
      fetchImpl: fakeFetch({ success: true, action: 'ai_gate', hostname: 'localhost' }),
    },
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.verified, true);
  assertEquals(body.kind, 'turnstile');
  assertEquals(harness.quota.challengeResets, [
    { userId: harness.auth.userId, kind: 'turnstile' },
  ]);
});

Deno.test('verify-challenge: a failed Turnstile token returns challenge_required', async () => {
  const harness = createHarness();
  const response = await handleVerifyChallenge(
    jsonRequest({ kind: 'turnstile', token: 'bad-token' }),
    harness.deps,
    {
      env: TURNSTILE_ENV,
      fetchImpl: fakeFetch({ success: false }),
    },
  );

  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.code, 'challenge_required');
  assertEquals(body.kinds, ['turnstile']);
  assertEquals(harness.quota.challengeResets.length, 0);
});

Deno.test('verify-challenge: Play Integrity is not configured yet in this deployment', async () => {
  const harness = createHarness();
  const response = await handleVerifyChallenge(
    jsonRequest({ kind: 'play_integrity', token: 'integrity-token', nonce: 'nonce-1' }),
    harness.deps,
    { env: {} },
  );

  assertEquals(response.status, 502);
  assertEquals((await response.json()).code, 'provider_error');
  assertEquals(harness.quota.challengeResets.length, 0);
});

Deno.test('verify-challenge: an unknown kind is a bad request', async () => {
  const harness = createHarness();
  const response = await handleVerifyChallenge(
    jsonRequest({ kind: 'recaptcha', token: 'token' }),
    harness.deps,
    { env: TURNSTILE_ENV },
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).code, 'bad_request');
});

Deno.test('verify-challenge: a missing token is a bad request', async () => {
  const harness = createHarness();
  const response = await handleVerifyChallenge(
    jsonRequest({ kind: 'turnstile' }),
    harness.deps,
    { env: TURNSTILE_ENV },
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).code, 'bad_request');
});

Deno.test('verify-challenge: GET is rejected', async () => {
  const harness = createHarness();
  const response = await handleVerifyChallenge(
    jsonRequest({}, { method: 'GET' }),
    harness.deps,
    { env: TURNSTILE_ENV },
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).code, 'bad_request');
});

function assertNonce(value: string): void {
  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new Error(`expected a 32-character nonce, got ${value}`);
  }
}
