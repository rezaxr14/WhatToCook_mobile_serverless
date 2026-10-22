import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { handleGenerateRecipe } from '../_shared/generate-handler.ts';
import {
  createHarness,
  delay,
  jsonRequest,
  readNdjson,
} from './test_harness.ts';

const suggestionsBody = {
  mode: 'suggestions',
  ingredients: ['eggs', 'tomato'],
};

Deno.test('generate-recipe: suggestions happy path', async () => {
  const harness = createHarness();
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'suggestions-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.status, 'done');
  assertEquals(body.recipes.length, 5);
  assertEquals(body.cached, false);
  assertEquals(body.provider, 'fake');
  assert(body.usage.cost_micro_usd >= 0);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'suggestions').length, 1);
  assertEquals(harness.quota.settled.length, 1);
  assertEquals(harness.quota.refunded.length, 0);
});

Deno.test('generate-recipe: detail happy path uses the routed model', async () => {
  const harness = createHarness();
  const response = await handleGenerateRecipe(
    jsonRequest(
      { mode: 'detail', recipe_name: 'Lemon Pasta' },
      { idempotencyKey: 'detail-key-1' },
    ),
    harness.deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertStringIncludes(body.name, 'Lemon Pasta');
  assertEquals(body.ingredients.length, 3);
  assertEquals(body.model_used, 'fake-flash');
  assertEquals(harness.provider.calls[0]?.model, 'fake-flash');
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('generate-recipe: chat happy path', async () => {
  const harness = createHarness();
  const response = await handleGenerateRecipe(
    jsonRequest(
      {
        mode: 'chat',
        recipe_name: 'Lemon Pasta',
        message: 'Can I use olive oil instead of butter?',
        ingredients: [{ name: 'Pasta', amount: '200', unit: 'g' }],
        instructions: ['Boil the pasta.'],
      },
      { idempotencyKey: 'chat-key-1' },
    ),
    harness.deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assert(body.reply.length > 0);
  assertEquals(body.recipe_name, 'Lemon Pasta');
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('generate-recipe: NDJSON stream emits meta, deltas, and a validated final payload', async () => {
  const harness = createHarness();
  const response = await handleGenerateRecipe(
    jsonRequest(
      {
        mode: 'chat',
        recipe_name: 'Lemon Pasta',
        message: 'Tell me a serving tip.',
        stream: true,
      },
      { idempotencyKey: 'stream-key-1' },
    ),
    harness.deps,
  );

  assertEquals(response.status, 200);
  assertStringIncludes(response.headers.get('content-type') ?? '', 'application/x-ndjson');
  const events = await readNdjson(response);
  assertEquals(events[0]?.type, 'meta');
  assert(events.some((event) => event.type === 'delta'));
  const final = events.find((event) => event.type === 'final');
  assert(final);
  assert(((final.data as { reply?: string }).reply?.length ?? 0) > 0);
  assertEquals((final.usage as { cost_micro_usd: number }).cost_micro_usd, 0);
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('generate-recipe: normal cache hit does not call the provider or charge again', async () => {
  const harness = createHarness();
  const first = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'cache-key-1' }),
    harness.deps,
  );
  const second = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'cache-key-2' }),
    harness.deps,
  );

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  const body = await second.json();
  assertEquals(body.cached, true);
  assertEquals(body.usage.cost_micro_usd, 0);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'suggestions').length, 1);
  assertEquals(harness.quota.settled.length, 1);
  assertEquals(harness.quota.cacheHitRecords, 1);
  assertEquals(harness.cache.touches, 1);
});

Deno.test('generate-recipe: idempotent retry returns the same response without double charging', async () => {
  const harness = createHarness();
  const request = () =>
    jsonRequest(suggestionsBody, { idempotencyKey: 'same-key-1' });
  const first = await handleGenerateRecipe(request(), harness.deps);
  const second = await handleGenerateRecipe(request(), harness.deps);

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  const body = await second.json();
  assertEquals(body.duplicate, true);
  assertEquals(body.cached, true);
  assertEquals(body.usage.cost_micro_usd, 0);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'suggestions').length, 1);
  assertEquals(harness.quota.reservations.length, 1);
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('generate-recipe: expired idempotency cache returns 409 instead of recharging', async () => {
  const harness = createHarness();
  const request = () =>
    jsonRequest(suggestionsBody, { idempotencyKey: 'expired-key-12345' });
  const first = await handleGenerateRecipe(request(), harness.deps);
  assertEquals(first.status, 200);

  harness.cache.entries.clear();
  const second = await handleGenerateRecipe(request(), harness.deps);

  assertEquals(second.status, 409);
  const body = await second.json();
  assertEquals(body.code, 'duplicate_request');
  assertEquals(harness.quota.settled.length, 1);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'suggestions').length, 1);
});

Deno.test('generate-recipe: usage snapshot failure after reserve refunds the event', async () => {
  const harness = createHarness({ quota: { failUsageSnapshot: true } });
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'usage-fail-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 500);
  assertEquals(harness.quota.reservations.length, 1);
  assertEquals(harness.quota.refunded.length, 1);
  assertEquals(harness.quota.settled.length, 0);
});

Deno.test('generate-recipe: daily quota exhaustion returns 429', async () => {
  const harness = createHarness({ quota: { dailyLimit: 1, dailyUsed: 1 } });
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'quota-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 429);
  const body = await response.json();
  assertEquals(body.code, 'quota_exceeded');
  assertEquals(harness.provider.calls.length, 0);
  assertEquals(harness.quota.refunded.length, 0);
});

Deno.test('generate-recipe: global daily cap returns ai_budget_exhausted', async () => {
  const harness = createHarness({ quota: { globalCap: 0 } });
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'global-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 503);
  const body = await response.json();
  assertEquals(body.code, 'ai_budget_exhausted');
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test('generate-recipe: kill switch returns ai_disabled', async () => {
  const harness = createHarness({ killSwitch: true });
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'kill-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 503);
  const body = await response.json();
  assertEquals(body.code, 'ai_disabled');
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test('generate-recipe: provider failure refunds the reservation', async () => {
  const harness = createHarness({ provider: { failFeatures: ['suggestions'] } });
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'failure-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 502);
  const body = await response.json();
  assertEquals(body.code, 'provider_error');
  assertEquals(harness.provider.calls.length, 1);
  assertEquals(harness.quota.refunded.length, 1);
  assertEquals(harness.quota.settled.length, 0);
});

Deno.test('generate-recipe: invalid output retries once then fails and refunds', async () => {
  const harness = createHarness({ provider: { invalidOutput: true } });
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { idempotencyKey: 'invalid-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 502);
  const body = await response.json();
  assertEquals(body.code, 'invalid_model_output');
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'suggestions').length, 2);
  assertEquals(harness.quota.refunded.length, 1);
  assertEquals(harness.quota.settled.length, 0);
});

Deno.test('generate-recipe: missing bearer token returns 401', async () => {
  const harness = createHarness();
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, { auth: false, idempotencyKey: 'auth-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.code, 'unauthorized');
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test('generate-recipe: disallowed browser origin returns 403', async () => {
  const harness = createHarness();
  const response = await handleGenerateRecipe(
    jsonRequest(suggestionsBody, {
      origin: 'https://evil.example',
      idempotencyKey: 'origin-key-1',
    }),
    harness.deps,
  );

  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.code, 'origin_not_allowed');
});

Deno.test('generate-recipe: CORS preflight succeeds without a bearer token', async () => {
  const harness = createHarness();
  const request = new Request('http://localhost/function', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type, idempotency-key',
    },
  });
  const response = await handleGenerateRecipe(request, harness.deps);
  assertEquals(response.status, 204);
  assertEquals(
    response.headers.get('access-control-allow-origin'),
    'http://localhost:5173',
  );
});

Deno.test('generate-recipe: client cancellation settles partial stream usage', async () => {
  const harness = createHarness({ provider: { delayMs: 10 } });
  const response = await handleGenerateRecipe(
    jsonRequest(
      {
        mode: 'chat',
        recipe_name: 'Lemon Pasta',
        message: 'Give me a long answer.',
        stream: true,
      },
      { idempotencyKey: 'cancel-key-1' },
    ),
    harness.deps,
  );
  assert(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = '';
  while (!received.includes('"type":"delta"')) {
    const { done, value } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }
  assertStringIncludes(received, '"type":"delta"');
  await reader.cancel();
  await delay(80);

  assertEquals(harness.quota.refunded.length, 0);
  assert(harness.quota.settled.length >= 1);
  assert(harness.quota.settled[0]!.outputTokens >= 0);
});
