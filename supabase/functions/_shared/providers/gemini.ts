import type { AIProvider, ProviderRequest, ProviderResult, ProviderUsage } from '../types.ts';
import { providerError } from '../errors.ts';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
}

export interface GeminiProviderOptions {
  apiKey: string;
  textFallbacks?: string[];
  visionFallbacks?: string[];
  timeoutMs?: number;
  streamTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  private readonly apiKey: string;
  private readonly textFallbacks: string[];
  private readonly visionFallbacks: string[];
  private readonly timeoutMs: number;
  private readonly streamTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey) throw providerError('Gemini is not configured.');
    this.apiKey = options.apiKey;
    this.textFallbacks = options.textFallbacks ?? [];
    this.visionFallbacks = options.visionFallbacks ?? [];
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.streamTimeoutMs = options.streamTimeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateText(request: ProviderRequest): Promise<ProviderResult> {
    return this.generate(request, false);
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    return this.generate(request, true);
  }

  async visionExtract(request: ProviderRequest): Promise<ProviderResult> {
    return this.generate(request, true, true);
  }

  private candidates(request: ProviderRequest, vision: boolean): string[] {
    const extra = vision ? this.visionFallbacks : this.textFallbacks;
    return [...new Set([request.model, ...extra].map((model) => model.trim()).filter(Boolean))];
  }

  private async generate(
    request: ProviderRequest,
    structured: boolean,
    vision = false,
  ): Promise<ProviderResult> {
    const started = performance.now();
    const candidates = this.candidates(request, vision);
    const rateLimited: string[] = [];
    let lastError: unknown = null;

    for (const model of candidates) {
      try {
        const response = await this.fetchImpl(
          `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(this.payload(request, structured, vision)),
            signal: combineSignals(request.signal, this.timeoutMs),
          },
        );
        const bodyText = await response.text();
        if (!response.ok) {
          if (isRateLimit(response.status, bodyText)) rateLimited.push(model);
          lastError = new Error(`Gemini ${model} returned ${response.status}`);
          continue;
        }
        const parsed = safeJson(bodyText);
        const text = extractText(parsed);
        if (!text) {
          lastError = new Error(`Gemini ${model} returned no text`);
          continue;
        }
        return {
          text,
          usage: usageFrom(parsed, request.prompt, text),
          model,
          provider: this.id,
          latency_ms: Math.round(performance.now() - started),
          rate_limited_models: rateLimited,
        };
      } catch (error) {
        if (request.signal?.aborted) throw error;
        lastError = error;
      }
    }

    throw providerError('All Gemini models failed. Please try again.', lastError);
  }

  async *streamText(request: ProviderRequest): AsyncGenerator<string, ProviderResult, void> {
    const started = performance.now();
    const candidates = this.candidates(request, false);
    const rateLimited: string[] = [];
    let lastError: unknown = null;

    for (const model of candidates) {
      let yielded = false;
      try {
        const response = await this.fetchImpl(
          `${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
          {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(this.payload(request, false, false)),
            signal: combineSignals(request.signal, this.streamTimeoutMs),
          },
        );
        if (!response.ok || !response.body) {
          const body = await response.text().catch(() => '');
          if (isRateLimit(response.status, body)) rateLimited.push(model);
          lastError = new Error(`Gemini stream ${model} returned ${response.status}`);
          continue;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let text = '';
        let usage: ProviderUsage | undefined;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            const parsed = safeJson(data);
            usage = usageFrom(parsed, request.prompt, text, usage);
            const chunk = extractText(parsed);
            if (chunk) {
              yielded = true;
              text += chunk;
              yield chunk;
            }
          }
        }

        if (buffer.trim().startsWith('data:')) {
          const parsed = safeJson(buffer.trim().slice(5).trim());
          usage = usageFrom(parsed, request.prompt, text, usage);
          const chunk = extractText(parsed);
          if (chunk) {
            yielded = true;
            text += chunk;
            yield chunk;
          }
        }

        if (!text) {
          lastError = new Error(`Gemini stream ${model} returned no text`);
          continue;
        }

        return {
          text,
          usage: usage ?? usageFrom(undefined, request.prompt, text),
          model,
          provider: this.id,
          latency_ms: Math.round(performance.now() - started),
          rate_limited_models: rateLimited,
        };
      } catch (error) {
        if (request.signal?.aborted) throw error;
        lastError = error;
        if (yielded) throw providerError('The AI stream failed mid-response.', error);
      }
    }

    throw providerError('All Gemini models failed. Please try again.', lastError);
  }

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
  }

  private payload(request: ProviderRequest, structured: boolean, vision: boolean): unknown {
    const parts: GeminiPart[] = [{ text: request.prompt }];
    if (vision && request.metadata?.imageBytes) {
      parts.push({
        inline_data: {
          mime_type: request.metadata.imageMimeType ?? 'image/jpeg',
          data: bytesToBase64(request.metadata.imageBytes),
        },
      });
    }

    const generationConfig: Record<string, unknown> = {
      temperature: request.temperature ?? (vision ? 0.4 : 0.7),
      maxOutputTokens: request.maxOutputTokens,
    };
    if (structured) generationConfig.responseMimeType = 'application/json';
    else if (request.responseMimeType === 'application/json') {
      generationConfig.responseMimeType = 'application/json';
    }

    return {
      contents: [{ role: 'user', parts }],
      ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      generationConfig,
    };
  }
}

function extractText(response: GeminiResponse): string {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? ''
  );
}

function usageFrom(
  response: GeminiResponse | undefined,
  prompt: string,
  text: string,
  existing?: ProviderUsage,
): ProviderUsage {
  if (response?.usageMetadata) {
    return {
      input_tokens: response.usageMetadata.promptTokenCount ?? existing?.input_tokens ?? estimate(prompt),
      output_tokens:
        response.usageMetadata.candidatesTokenCount ?? existing?.output_tokens ?? estimate(text),
    };
  }
  return existing ?? {
    input_tokens: estimate(prompt),
    output_tokens: estimate(text),
  };
}

function estimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function isRateLimit(status: number, body: string): boolean {
  const lower = body.toLowerCase();
  return (
    status === 429 ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  );
}

function safeJson(value: string): GeminiResponse {
  try {
    return JSON.parse(value) as GeminiResponse;
  } catch {
    return {};
  }
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
