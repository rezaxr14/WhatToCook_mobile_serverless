import { assertEquals, assertFalse, assert } from 'jsr:@std/assert@1';
import { checkCors, parseAllowedOrigins, preflightResponse } from '../_shared/cors.ts';

const ALLOWED = parseAllowedOrigins('https://app.example.com, http://localhost:5173');

Deno.test('cors: echoes an allowed browser origin', () => {
  const request = new Request('https://example.supabase.co/functions/v1/ai-models', {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173' },
  });
  const response = preflightResponse(request, ALLOWED);
  assert(response);
  assertEquals(response.status, 204);
  assertEquals(
    response.headers.get('access-control-allow-origin'),
    'http://localhost:5173',
  );
});

Deno.test('cors: allows the supabase-js client headers in preflight', () => {
  const request = new Request('https://example.supabase.co/functions/v1/ai-models', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-headers': 'authorization, x-client-info, x-application-name',
    },
  });
  const response = preflightResponse(request, ALLOWED);
  assert(response);

  const allowedHeaders = (response.headers.get('access-control-allow-headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase());

  // Browsers reject the whole preflight when a single requested header is not
  // listed, so every header the clients send must be present.
  for (const header of ['authorization', 'x-client-info', 'x-application-name', 'x-client-type']) {
    assert(allowedHeaders.includes(header), `missing ${header}`);
  }
});

Deno.test('cors: rejects an origin that is not allow-listed', () => {
  const request = new Request('https://example.supabase.co/functions/v1/ai-models', {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example.com' },
  });
  const response = preflightResponse(request, ALLOWED);
  assert(response);
  assertEquals(response.status, 403);
  assertFalse(response.headers.has('access-control-allow-origin'));

  const result = checkCors(request, ALLOWED);
  assertFalse(result.allowed);
});
