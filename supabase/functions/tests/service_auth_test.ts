import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { AppError } from '../_shared/errors.ts';
import { authenticateService } from '../_shared/service-auth.ts';
import { TEST_SERVICE_KEY } from './test_harness.ts';

function serviceRequest(key: string): Request {
  return new Request('http://localhost/function', {
    method: 'POST',
    headers: { 'x-service-key': key },
  });
}

Deno.test('service auth: a matching key maps to the service principal', async () => {
  const auth = await authenticateService(serviceRequest(TEST_SERVICE_KEY), {
    MAIN_SERVICE_KEY: TEST_SERVICE_KEY,
  });
  assertEquals(auth.service?.name, 'main-app-service');
  assertEquals(auth.service?.principalClass, 'registered');
  assertEquals(auth.userId, 'service:main-app-service');
  assertEquals(auth.plan.id, 'service');
});

Deno.test('service auth: a wrong key is rejected', async () => {
  const error = await assertRejects(
    () =>
      authenticateService(serviceRequest(`${TEST_SERVICE_KEY}x`), {
        MAIN_SERVICE_KEY: TEST_SERVICE_KEY,
      }),
    AppError,
  );
  assertEquals(error.code, 'unauthorized');
  assertEquals(error.status, 401);
});

Deno.test('service auth: a missing header is rejected', async () => {
  const error = await assertRejects(
    () =>
      authenticateService(new Request('http://localhost/function', { method: 'POST' }), {
        MAIN_SERVICE_KEY: TEST_SERVICE_KEY,
      }),
    AppError,
  );
  assertEquals(error.code, 'unauthorized');
});

Deno.test('service auth: a short or missing configured key fails closed', async () => {
  for (const env of [{}, { MAIN_SERVICE_KEY: 'too-short' }]) {
    const error = await assertRejects(
      () => authenticateService(serviceRequest(TEST_SERVICE_KEY), env),
      AppError,
    );
    assertEquals(error.code, 'unauthorized');
    assertEquals(error.message, 'Service authentication is not configured.');
  }
});

Deno.test('service auth: equal-length wrong keys are still rejected', async () => {
  const wrong = `${'a'.repeat(TEST_SERVICE_KEY.length - 1)}b`;
  const error = await assertRejects(
    () => authenticateService(serviceRequest(wrong), { MAIN_SERVICE_KEY: TEST_SERVICE_KEY }),
    AppError,
  );
  assertEquals(error.code, 'unauthorized');
});
