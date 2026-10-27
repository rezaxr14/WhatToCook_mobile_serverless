import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { FallbackProvider } from '../_shared/providers/fallback.ts';
import type { AIProvider, ProviderRequest, ProviderResult } from '../_shared/types.ts';

const request: ProviderRequest = {
  prompt: 'Suggest a pasta dish.',
  model: 'gemini-3.5-flash-lite',
  maxOutputTokens: 256,
  metadata: { feature: 'suggestions', locale: 'en' },
};

function result(provider: string, model: string, text = 'ok'): ProviderResult {
  return {
    text,
    usage: { input_tokens: 10, output_tokens: 5 },
    model,
    provider,
    latency_ms: 1,
    rate_limited_models: [],
  };
}

class StubProvider implements AIProvider {
  readonly calls: ProviderRequest[] = [];

  constructor(
    readonly id: string,
    private readonly options: {
      error?: Error;
      chunks?: string[];
      failAfter?: number;
    } = {},
  ) {}

  async generateText(request: ProviderRequest): Promise<ProviderResult> {
    this.calls.push(request);
    if (this.options.error) throw this.options.error;
    return result(this.id, request.model);
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    return this.generateText(request);
  }

  async visionExtract(request: ProviderRequest): Promise<ProviderResult> {
    return this.generateText(request);
  }

  async *streamText(request: ProviderRequest): AsyncGenerator<string, ProviderResult, void> {
    this.calls.push(request);
    let sent = 0;
    for (const chunk of this.options.chunks ?? []) {
      if (this.options.failAfter !== undefined && sent === this.options.failAfter) {
        throw this.options.error ?? new Error('stream failed');
      }
      sent += 1;
      yield chunk;
    }
    if (this.options.error) throw this.options.error;
    return result(this.id, request.model, (this.options.chunks ?? []).join(''));
  }
}

Deno.test('fallback: uses the primary when it succeeds', async () => {
  const primary = new StubProvider('gemini');
  const secondary = new StubProvider('openrouter');
  const provider = new FallbackProvider(primary, secondary, 'openrouter/free');

  const generated = await provider.generateText(request);

  assertEquals(generated.provider, 'gemini');
  assertEquals(secondary.calls.length, 0);
});

Deno.test('fallback: tries the secondary with its own model when the primary fails', async () => {
  const primary = new StubProvider('gemini', { error: new Error('quota') });
  const secondary = new StubProvider('openrouter');
  const provider = new FallbackProvider(primary, secondary, 'openrouter/free');

  const generated = await provider.generateText(request);

  assertEquals(generated.provider, 'openrouter');
  assertEquals(secondary.calls[0]?.model, 'openrouter/free');
  assertEquals(primary.calls.length, 1);
});

Deno.test('fallback: streams from the secondary when the primary fails before output', async () => {
  const primary = new StubProvider('gemini', { error: new Error('unavailable') });
  const secondary = new StubProvider('openrouter', { chunks: ['Hello', ' world'] });
  const provider = new FallbackProvider(primary, secondary, 'openrouter/free');

  const chunks: string[] = [];
  for await (const chunk of provider.streamText(request)) chunks.push(chunk);

  assertEquals(chunks, ['Hello', ' world']);
  assertEquals(secondary.calls[0]?.model, 'openrouter/free');
});

Deno.test('fallback: does not splice providers after a partial stream', async () => {
  const primary = new StubProvider('gemini', {
    chunks: ['Half'],
    failAfter: 1,
    error: new Error('stream failed'),
  });
  const secondary = new StubProvider('openrouter', { chunks: ['Second'] });
  const provider = new FallbackProvider(primary, secondary, 'openrouter/free');

  const chunks: string[] = [];
  await assertRejects(async () => {
    for await (const chunk of provider.streamText(request)) chunks.push(chunk);
  });
  assertEquals(chunks, ['Half']);
  assertEquals(secondary.calls.length, 0);
});
