import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handleSuggestSubstitution } from '../_shared/substitution-handler.ts';
import { createHarness, jsonRequest } from './test_harness.ts';

const substitutionBody = {
  recipe_name: 'Lemon Pasta',
  missing_ingredient: 'Butter',
  available_ingredients: ['Olive oil', 'Greek yogurt'],
  dietary: ['vegetarian'],
  locale: 'en',
};

Deno.test('suggest-substitution: happy path returns validated substitutes', async () => {
  const harness = createHarness();
  const response = await handleSuggestSubstitution(
    jsonRequest(substitutionBody, { idempotencyKey: 'substitution-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.status, 'done');
  assertEquals(body.missing_ingredient, 'Butter');
  assertEquals(body.substitutes.length, 2);
  assertEquals(body.cached, false);
  assertEquals(body.provider, 'fake');
  assertEquals(body.model_used, 'fake-lite');
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'substitution').length, 1);
  assertEquals(harness.quota.settled.length, 1);
  assertEquals(harness.quota.refunded.length, 0);
});

Deno.test('suggest-substitution: cache hit avoids the provider and charge', async () => {
  const harness = createHarness();
  const first = await handleSuggestSubstitution(
    jsonRequest(substitutionBody, { idempotencyKey: 'substitution-cache-key-1' }),
    harness.deps,
  );
  const second = await handleSuggestSubstitution(
    jsonRequest(substitutionBody, { idempotencyKey: 'substitution-cache-key-2' }),
    harness.deps,
  );

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  const body = await second.json();
  assertEquals(body.cached, true);
  assertEquals(body.usage.cost_micro_usd, 0);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'substitution').length, 1);
  assertEquals(harness.quota.settled.length, 1);
  assertEquals(harness.quota.cacheHitRecords, 1);
  assertEquals(harness.cache.touches, 1);
});

Deno.test('suggest-substitution: idempotent retry does not double charge', async () => {
  const harness = createHarness();
  const request = () =>
    jsonRequest(substitutionBody, { idempotencyKey: 'substitution-idem-key-1' });
  await handleSuggestSubstitution(request(), harness.deps);
  const second = await handleSuggestSubstitution(request(), harness.deps);

  assertEquals(second.status, 200);
  const body = await second.json();
  assertEquals(body.duplicate, true);
  assertEquals(body.cached, true);
  assertEquals(body.usage.cost_micro_usd, 0);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'substitution').length, 1);
  assertEquals(harness.quota.reservations.length, 1);
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('suggest-substitution: force_refresh bypasses a warm cache', async () => {
  const harness = createHarness();
  await handleSuggestSubstitution(
    jsonRequest(substitutionBody, { idempotencyKey: 'substitution-refresh-key-1' }),
    harness.deps,
  );
  const second = await handleSuggestSubstitution(
    jsonRequest(
      { ...substitutionBody, force_refresh: true },
      { idempotencyKey: 'substitution-refresh-key-2' },
    ),
    harness.deps,
  );

  assertEquals(second.status, 200);
  const body = await second.json();
  assertEquals(body.cached, false);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'substitution').length, 2);
  assertEquals(harness.quota.settled.length, 2);
});

Deno.test('suggest-substitution: provider failure refunds the reservation', async () => {
  const harness = createHarness({ provider: { failFeatures: ['substitution'] } });
  const response = await handleSuggestSubstitution(
    jsonRequest(substitutionBody, { idempotencyKey: 'substitution-fail-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 502);
  const body = await response.json();
  assertEquals(body.code, 'provider_error');
  assertEquals(harness.quota.refunded.length, 1);
  assertEquals(harness.quota.settled.length, 0);
});

Deno.test('suggest-substitution: malformed request returns 400', async () => {
  const harness = createHarness();
  const response = await handleSuggestSubstitution(
    jsonRequest(
      { recipe_name: 'Lemon Pasta' },
      { idempotencyKey: 'substitution-bad-key-1' },
    ),
    harness.deps,
  );

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.code, 'bad_request');
  assertEquals(harness.provider.calls.length, 0);
  assert(harness.quota.reservations.length === 0);
});
