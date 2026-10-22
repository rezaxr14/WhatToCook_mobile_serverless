import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { OpenRouterProvider } from '../_shared/providers/openrouter.ts';
import {
  DEFAULT_OPENROUTER_INPUT_MICRO_USD_PER_MILLION,
  DEFAULT_OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION,
  openRouterPriceFromEnv,
} from '../_shared/prices.ts';

const request = {
  prompt: 'Return a short recipe.',
  system: 'You are a cooking assistant.',
  model: 'openai/gpt-4o-mini',
  maxOutputTokens: 256,
  temperature: 0.3,
  metadata: { feature: 'recipe' as const, locale: 'en' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.test('openrouter: structured calls send the key, model, messages, and JSON mode', async () => {
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new OpenRouterProvider({
    apiKey: 'test-key',
    appName: 'WhatToCook',
    siteUrl: 'https://app.example',
    fetchImpl: (async (url, init) => {
      captured.push({ url: String(url), init });
      return jsonResponse({
        choices: [{ message: { content: '{"name":"Pasta"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      });
    }) as typeof fetch,
  });

  const result = await provider.generateStructured(request);
  assertEquals(result.text, '{"name":"Pasta"}');
  assertEquals(result.provider, 'openrouter');
  assertEquals(result.model, 'openai/gpt-4o-mini');
  assertEquals(result.usage, { input_tokens: 12, output_tokens: 7 });

  const headers = new Headers(captured[0]?.init?.headers);
  assertEquals(headers.get('Authorization'), 'Bearer test-key');
  assertEquals(headers.get('X-Title'), 'WhatToCook');
  assertEquals(headers.get('HTTP-Referer'), 'https://app.example');
  const body = JSON.parse(String(captured[0]?.init?.body)) as {
    model: string;
    response_format?: { type: string };
    messages: Array<{ role: string; content: string }>;
  };
  assertEquals(body.model, 'openai/gpt-4o-mini');
  assertEquals(body.response_format, { type: 'json_object' });
  assertEquals(body.messages[0], { role: 'system', content: 'You are a cooking assistant.' });
  assertEquals(body.messages[1], { role: 'user', content: 'Return a short recipe.' });
});

Deno.test('openrouter: vision calls send an inline data URL', async () => {
  const bodies: Array<{ messages?: Array<{ content?: unknown }> }> = [];
  const provider = new OpenRouterProvider({
    apiKey: 'test-key',
    fetchImpl: (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as { messages?: Array<{ content?: unknown }> });
      return jsonResponse({ choices: [{ message: { content: '[]' } }] });
    }) as typeof fetch,
  });

  await provider.visionExtract({
    ...request,
    prompt: 'List the food.',
    metadata: {
      feature: 'scan',
      locale: 'en',
      imageBytes: new Uint8Array([1, 2, 3]),
      imageMimeType: 'image/png',
    },
  });

  const content = bodies[0]?.messages?.find((message) => Array.isArray(message.content))?.content;
  assert(Array.isArray(content));
  const serialized = JSON.stringify(content);
  assertStringIncludes(serialized, 'data:image/png;base64,');
  assertStringIncludes(serialized, 'List the food.');
});

Deno.test('openrouter: stream parses SSE deltas and usage', async () => {
  const provider = new OpenRouterProvider({
    apiKey: 'test-key',
    fetchImpl: (async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'),
          );
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"chef"}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
            ),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof fetch,
  });

  const iterator = provider.streamText(request);
  const chunks: string[] = [];
  let next = await iterator.next();
  while (!next.done) {
    chunks.push(next.value);
    next = await iterator.next();
  }

  assertEquals(chunks.join(''), 'Hello chef');
  assertEquals(next.value.text, 'Hello chef');
  assertEquals(next.value.usage, { input_tokens: 5, output_tokens: 2 });
  assertEquals(next.value.provider, 'openrouter');
});

Deno.test('openrouter: stream falls back after a model fails before any delta', async () => {
  let calls = 0;
  const provider = new OpenRouterProvider({
    apiKey: 'test-key',
    textFallbacks: ['fallback/model'],
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: { message: 'rate limit exceeded' } }, 429);
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"Fallback stream"}}]}\n\n'),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof fetch,
  });

  const iterator = provider.streamText(request);
  let chunks = '';
  let result = await iterator.next();
  while (!result.done) {
    chunks += result.value;
    result = await iterator.next();
  }

  assertEquals(chunks, 'Fallback stream');
  assertEquals(result.value.model, 'fallback/model');
  assertEquals(result.value.rate_limited_models, ['openai/gpt-4o-mini']);
});

Deno.test('openrouter: a rate-limited model falls back to the next candidate', async () => {
  const models: string[] = [];
  const provider = new OpenRouterProvider({
    apiKey: 'test-key',
    textFallbacks: ['fallback/model'],
    fetchImpl: (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      models.push(body.model);
      if (body.model === 'openai/gpt-4o-mini') {
        return jsonResponse({ error: { message: 'rate limit exceeded' } }, 429);
      }
      return jsonResponse({ choices: [{ message: { content: 'Fallback answer' } }] });
    }) as typeof fetch,
  });

  const result = await provider.generateText(request);
  assertEquals(models, ['openai/gpt-4o-mini', 'fallback/model']);
  assertEquals(result.text, 'Fallback answer');
  assertEquals(result.rate_limited_models, ['openai/gpt-4o-mini']);
});

Deno.test('openrouter: pricing falls back to conservative defaults and accepts overrides', () => {
  assertEquals(openRouterPriceFromEnv('openrouter', 'openai/gpt-4o-mini', {}), {
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    input_micro_usd_per_million: DEFAULT_OPENROUTER_INPUT_MICRO_USD_PER_MILLION,
    output_micro_usd_per_million: DEFAULT_OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION,
  });
  assertEquals(
    openRouterPriceFromEnv('openrouter', 'free/model', {
      OPENROUTER_INPUT_MICRO_USD_PER_MILLION: '0',
      OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION: '0',
    }),
    {
      provider: 'openrouter',
      model: 'free/model',
      input_micro_usd_per_million: 0,
      output_micro_usd_per_million: 0,
    },
  );
  assertEquals(openRouterPriceFromEnv('gemini', 'gemini-2.5-flash', {}), null);
});

Deno.test('lmstudio: uses the local base URL, no auth, and its own provider id', async () => {
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new OpenRouterProvider({
    providerId: 'lmstudio',
    displayName: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1/',
    jsonMode: false,
    fetchImpl: (async (url, init) => {
      captured.push({ url: String(url), init });
      return jsonResponse({
        choices: [{ message: { content: '{"name":"Local Stew"}' } }],
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      });
    }) as typeof fetch,
  });

  const result = await provider.generateStructured({ ...request, model: 'gemma-local' });

  assertEquals(captured[0]?.url, 'http://127.0.0.1:1234/v1/chat/completions');
  const headers = new Headers(captured[0]?.init?.headers);
  assertEquals(headers.get('Authorization'), null);
  const body = JSON.parse(String(captured[0]?.init?.body)) as {
    model: string;
    response_format?: unknown;
  };
  assertEquals(body.model, 'gemma-local');
  assertEquals(body.response_format, undefined);
  assertEquals(result.provider, 'lmstudio');
  assertEquals(result.model, 'gemma-local');
});

Deno.test('openrouter: free model ids are priced at zero', () => {
  for (const model of ['openrouter/free', 'google/gemma-4-31b-it:free']) {
    assertEquals(openRouterPriceFromEnv('openrouter', model, {}), {
      provider: 'openrouter',
      model,
      input_micro_usd_per_million: 0,
      output_micro_usd_per_million: 0,
    });
  }
});
