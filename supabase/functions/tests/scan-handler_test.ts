import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handleScanPantry } from '../_shared/scan-handler.ts';
import {
  bytesToBase64,
  createHarness,
  jsonRequest,
  makeJpegWithExif,
} from './test_harness.ts';

function scanBody(bytes: Uint8Array): Record<string, unknown> {
  return {
    image: bytesToBase64(bytes),
    mime_type: 'image/jpeg',
    locale: 'en',
    min_confidence: 0.5,
    max_items: 25,
  };
}

Deno.test('scan-pantry: happy path maps detections to catalog IDs and filters low confidence', async () => {
  const harness = createHarness();
  const response = await handleScanPantry(
    jsonRequest(scanBody(makeJpegWithExif()), { idempotencyKey: 'scan-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.status, 'done');
  assertEquals(body.detected_count, 5);
  assertEquals(body.items.length, 4);
  assertEquals(body.matched_count, 4);
  assertEquals(body.items[0].name, 'Eggs');
  assertEquals(body.items[0].ingredient_id, 1);
  assertEquals(body.items[0].matched, true);
  assertEquals(body.cached, false);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'scan').length, 1);
  assertEquals(harness.provider.calls[0]?.method, 'visionExtract');
  assertEquals(harness.quota.settled.length, 1);
});

Deno.test('scan-pantry: cache hit does not call vision or charge again', async () => {
  const harness = createHarness();
  const image = makeJpegWithExif();
  const first = await handleScanPantry(
    jsonRequest(scanBody(image), { idempotencyKey: 'scan-cache-key-1' }),
    harness.deps,
  );
  const second = await handleScanPantry(
    jsonRequest(scanBody(image), { idempotencyKey: 'scan-cache-key-2' }),
    harness.deps,
  );

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  const body = await second.json();
  assertEquals(body.cached, true);
  assertEquals(body.usage.cost_micro_usd, 0);
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'scan').length, 1);
  assertEquals(harness.quota.settled.length, 1);
  assertEquals(harness.quota.cacheHitRecords, 1);
});

Deno.test('scan-pantry: image over the plan limit returns 413 before the provider', async () => {
  const harness = createHarness({ maxImageBytes: 32 });
  const response = await handleScanPantry(
    jsonRequest(scanBody(makeJpegWithExif(128)), { idempotencyKey: 'scan-large-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 413);
  const body = await response.json();
  assertEquals(body.code, 'payload_too_large');
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test('scan-pantry: non-image bytes are rejected', async () => {
  const harness = createHarness();
  const response = await handleScanPantry(
    jsonRequest(
      {
        image: bytesToBase64(new TextEncoder().encode('this is not an image at all')),
        mime_type: 'image/png',
      },
      { idempotencyKey: 'scan-invalid-image-key-1' },
    ),
    harness.deps,
  );

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.code, 'bad_request');
  assertEquals(harness.provider.calls.length, 0);
});

Deno.test('scan-pantry: provider failure refunds the reservation', async () => {
  const harness = createHarness({ provider: { failFeatures: ['scan'] } });
  const response = await handleScanPantry(
    jsonRequest(scanBody(makeJpegWithExif()), { idempotencyKey: 'scan-fail-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 502);
  const body = await response.json();
  assertEquals(body.code, 'provider_error');
  assertEquals(harness.quota.refunded.length, 1);
  assertEquals(harness.quota.settled.length, 0);
});

Deno.test('scan-pantry: invalid model output retries once then refunds', async () => {
  const harness = createHarness({ provider: { invalidOutput: true } });
  const response = await handleScanPantry(
    jsonRequest(scanBody(makeJpegWithExif()), { idempotencyKey: 'scan-invalid-key-1' }),
    harness.deps,
  );

  assertEquals(response.status, 502);
  const body = await response.json();
  assertEquals(body.code, 'invalid_model_output');
  assertEquals(harness.provider.calls.filter((call) => call.feature === 'scan').length, 2);
  assertEquals(harness.quota.refunded.length, 1);
});

Deno.test('scan-pantry: image bytes are not retained in the cache response', async () => {
  const harness = createHarness();
  const image = makeJpegWithExif();
  await handleScanPantry(
    jsonRequest(scanBody(image), { idempotencyKey: 'scan-storage-key-1' }),
    harness.deps,
  );
  const serialized = JSON.stringify([...harness.cache.entries.values()]);
  assert(!serialized.includes(bytesToBase64(image)));
  assert(!serialized.includes('secret-metadata'));
});
