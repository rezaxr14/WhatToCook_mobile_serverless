import { assertEquals } from 'jsr:@std/assert@1';
import { clientIp, clientIpHash } from '../_shared/client-ip.ts';

Deno.test('client ip: prefers the proxy-set single-value headers', () => {
  const request = new Request('https://example.test/ai', {
    headers: {
      'cf-connecting-ip': '203.0.113.9',
      'x-real-ip': '198.51.100.4',
      'x-forwarded-for': '192.0.2.1, 10.0.0.1',
    },
  });
  assertEquals(clientIp(request), '203.0.113.9');
});

Deno.test('client ip: falls back to the first forwarded hop', () => {
  const request = new Request('https://example.test/ai', {
    headers: { 'x-forwarded-for': ' 192.0.2.7 , 10.0.0.1 ' },
  });
  assertEquals(clientIp(request), '192.0.2.7');
});

Deno.test('client ip: no proxy headers means no IP bucket', async () => {
  const request = new Request('https://example.test/ai');
  assertEquals(clientIp(request), null);
  assertEquals(await clientIpHash(request), null);
});

Deno.test('client ip: hashes the address instead of storing it', async () => {
  const request = new Request('https://example.test/ai', {
    headers: { 'x-real-ip': '203.0.113.9' },
  });
  assertEquals(
    await clientIpHash(request),
    'd861b7e91033ebc1c1e8e7af3929010158b3241b54ca87ef73e79c32f26400ec',
  );
});
