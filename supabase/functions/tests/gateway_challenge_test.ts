import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handleGenerateRecipe } from '../_shared/generate-handler.ts';
import { hashEndUserRef } from '../_shared/gateway.ts';
import { createHarness, jsonRequest, TEST_SERVICE_KEY } from './test_harness.ts';

const suggestionsBody = { mode: 'suggestions', ingredients: ['eggs', 'tomato'] };

function generate(
  harness: ReturnType<typeof createHarness>,
  options: Parameters<typeof jsonRequest>[1] = {},
  body: Record<string, unknown> = suggestionsBody,
) {
  return handleGenerateRecipe(
    jsonRequest(body, { idempotencyKey: crypto.randomUUID(), ...options }),
    harness.deps,
  );
}

Deno.test('gateway challenge: a web request without a fresh verification is rejected', async () => {
  const harness = createHarness({ quota: { challengeAllowed: false } });
  const response = await generate(harness);

  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.code, 'challenge_required');
  assertEquals(body.kinds, ['turnstile']);
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.quota.reservations.length, 0);
  assertEquals(harness.quota.refunded.length, 0);
});

Deno.test('gateway challenge: a cache hit does not consume the challenge counter', async () => {
  const harness = createHarness();
  const first = await generate(harness);
  const second = await generate(harness);

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals((await second.json()).cached, true);
  assertEquals(harness.quota.challengeCalls.length, 1);
  assertEquals(harness.quota.reservations.length, 1);
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('gateway challenge: Android bypasses the challenge while mobile enforcement is off', async () => {
  const harness = createHarness({
    challenge: { mobileEnforce: false },
    quota: { challengeAllowed: false },
  });
  const response = await generate(harness, { platform: 'android' });

  assertEquals(response.status, 200);
  assertEquals(harness.quota.challengeCalls.length, 0);
  assertEquals(harness.quota.reservations.length, 1);
});

Deno.test('gateway challenge: anonymous Android gets the lower unattested daily cap', async () => {
  const harness = createHarness({ challenge: { mobileEnforce: false } });
  harness.auth.plan.id = 'anonymous';

  const response = await generate(harness, { platform: 'android' });

  assertEquals(response.status, 200);
  const reservation = harness.quota.reservations[0];
  assert(reservation);
  assertEquals(reservation.pool, 'anonymous');
  assertEquals(reservation.dailyCap, 10);
});

Deno.test('gateway challenge: mobile enforcement asks Android for Play Integrity', async () => {
  const harness = createHarness({
    challenge: { mobileEnforce: true },
    quota: { challengeAllowed: false },
  });
  const response = await generate(harness, { platform: 'android' });

  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.code, 'challenge_required');
  assertEquals(body.kinds, ['play_integrity']);
  assertEquals(harness.quota.reservations.length, 0);
});

Deno.test('gateway pools: a registered user draws from the registered share', async () => {
  const harness = createHarness({ providerDailyGuard: 1000 });
  const response = await generate(harness);

  assertEquals(response.status, 200);
  const reservation = harness.quota.reservations[0];
  assert(reservation);
  assertEquals(reservation.pool, 'registered');
  assertEquals(reservation.poolLimit, 400);
  assertEquals(reservation.dailyCap, null);
});

Deno.test('gateway pools: an anonymous user draws from the anonymous share', async () => {
  const harness = createHarness({ providerDailyGuard: 1000 });
  harness.auth.plan.id = 'anonymous';
  const response = await generate(harness);

  assertEquals(response.status, 200);
  const reservation = harness.quota.reservations[0];
  assert(reservation);
  assertEquals(reservation.pool, 'anonymous');
  assertEquals(reservation.poolLimit, 600);
});

Deno.test('gateway pools: pool exhaustion maps to ai_pool_exhausted', async () => {
  const harness = createHarness({ quota: { exhaustedPool: 'anonymous' } });
  harness.auth.plan.id = 'anonymous';
  const response = await generate(harness);

  assertEquals(response.status, 429);
  const body = await response.json();
  assertEquals(body.code, 'ai_pool_exhausted');
  assertEquals(body.details.pool, 'anonymous');
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.quota.refunded.length, 0);
});

Deno.test('gateway service: an invalid service key is rejected before any work', async () => {
  const harness = createHarness();
  const response = await generate(harness, { serviceKey: 'wrong-service-key-0123456789abcdef' });

  assertEquals(response.status, 401);
  assertEquals((await response.json()).code, 'unauthorized');
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test('gateway service: anonymous principal class maps to the anonymous pool', async () => {
  const harness = createHarness({
    providerDailyGuard: 1000,
    quota: { challengeAllowed: false },
  });
  const response = await generate(
    harness,
    { serviceKey: TEST_SERVICE_KEY },
    {
      ...suggestionsBody,
      principal_class: 'anonymous',
      end_user_ref: 'demo-session-42',
    },
  );

  assertEquals(response.status, 200);
  assertEquals(harness.quota.challengeCalls.length, 0);
  const reservation = harness.quota.reservations[0];
  assert(reservation);
  assertEquals(reservation.service, 'main-app-service');
  assertEquals(reservation.pool, 'anonymous');
  assertEquals(reservation.poolLimit, 600);
});

Deno.test('gateway service: an unlabelled principal defaults to registered', async () => {
  const harness = createHarness({ providerDailyGuard: 1000 });
  const response = await generate(harness, { serviceKey: TEST_SERVICE_KEY });

  assertEquals(response.status, 200);
  const reservation = harness.quota.reservations[0];
  assert(reservation);
  assertEquals(reservation.service, 'main-app-service');
  assertEquals(reservation.pool, 'registered');
});

Deno.test('gateway service: end-user references are only stored as a short hash', () => {
  const first = hashEndUserRef('user-42');
  assertEquals(first, hashEndUserRef('user-42'));
  assertEquals(first.length, 8);
  assert(/^[0-9a-f]{8}$/.test(first));
  assert(first !== hashEndUserRef('user-43'));
});

Deno.test('gateway provider guard: a blocked provider attempt refunds the reservation', async () => {
  const harness = createHarness({
    providerDailyGuard: 400,
    quota: { attemptGuard: 0 },
  });
  const response = await generate(harness);

  assertEquals(response.status, 503);
  assertEquals((await response.json()).code, 'ai_budget_exhausted');
  assertEquals(harness.quota.providerAttempts.length, 1);
  assertEquals(harness.quota.refunded.length, 1);
  assertEquals(harness.quota.settled.length, 0);
});

Deno.test('gateway provider guard: every retry counts as a provider attempt', async () => {
  const harness = createHarness({
    provider: { invalidOutput: true },
    providerDailyGuard: 400,
  });
  const response = await generate(harness);

  assertEquals(response.status, 502);
  assertEquals((await response.json()).code, 'invalid_model_output');
  assertEquals(harness.quota.providerAttempts.length, 2);
  assertEquals(harness.quota.refunded.length, 1);
});
