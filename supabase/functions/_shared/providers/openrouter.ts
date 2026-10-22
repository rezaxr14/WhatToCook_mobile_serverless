import type { AIProvider, ProviderRequest, ProviderResult, ProviderUsage } from '../types.ts';
import { providerError } from '../errors.ts';

interface OpenRouterTextPart {
  type: 'text';
  text: string;
}

interface OpenRouterImagePart {
  type: 'image_url';
  image_url: { url: string };
}

type OpenRouterContent = string | Array<OpenRouterTextPart | OpenRouterImagePart>;

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: OpenRouterContent;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: number | string;
    type?: string;
  };
}

export interface OpenRouterProviderOptions {
  /** Optional for local OpenAI-compatible servers such as LM Studio. */
  apiKey?: string;
  /** Defaults to `openrouter`. LM Studio uses `lmstudio`. */
  providerId?: string;
  displayName?: string;
  /** Base URL without `/chat/completions`. */
  baseUrl?: string;
  textFallbacks?: string[];
  visionFallbacks?: string[];
  siteUrl?: string;
  appName?: string;
  /** Some models reject OpenAI's `response_format`; disable it if needed. */
  jsonMode?: boolean;
  timeoutMs?: number;
  streamTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * OpenRouter and LM Studio both expose an OpenAI-compatible chat-completions
 * API, so one adapter covers text, structured JSON, streaming, and vision.
 */
export class OpenRouterProvider implements AIProvider {
  readonly id: string;
  private readonly endpoint: string;
  private readonly label: string;
  private readonly apiKey?: string;
  private readonly textFallbacks: string[];
  private readonly visionFallbacks: string[];
  private readonly siteUrl?: string;
  private readonly appName?: string;
  private readonly jsonMode: boolean;
  private readonly timeoutMs: number;
  private readonly streamTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterProviderOptions) {
    const providerId = options.providerId ?? 'openrouter';
    if (providerId === 'openrouter' && !options.apiKey) {
      throw providerError('OpenRouter is not configured.');
    }
    this.id = providerId;
    this.label = options.displayName ?? (providerId === 'lmstudio' ? 'LM Studio' : 'OpenRouter');
    this.apiKey = options.apiKey?.trim() || undefined;
    this.endpoint = `${(options.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`;
    this.textFallbacks = options.textFallbacks ?? [];
    this.visionFallbacks = options.visionFallbacks ?? [];
    this.siteUrl = options.siteUrl;
    this.appName = options.appName;
    this.jsonMode = options.jsonMode ?? true;
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
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(this.payload(request, model, structured, vision, false)),
          signal: combineSignals(request.signal, this.timeoutMs),
        });
        const bodyText = await response.text();
        if (!response.ok) {
          if (isRateLimit(response.status, bodyText)) rateLimited.push(model);
          lastError = new Error(errorMessage(`${this.label} ${model}`, response.status, bodyText));
          if (response.status === 401 || response.status === 403) break;
          continue;
        }

        const parsed = safeJson(bodyText);
        if (parsed.error) {
          lastError = new Error(parsed.error.message || `${this.label} ${model} returned an error`);
          continue;
        }
        const text = extractText(parsed.choices?.[0]?.message?.content).trim();
        if (!text) {
          lastError = new Error(`${this.label} ${model} returned no text`);
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

    throw providerError(`All ${this.label} models failed. Please try again.`, lastError);
  }

  async *streamText(request: ProviderRequest): AsyncGenerator<string, ProviderResult, void> {
    const started = performance.now();
    const candidates = this.candidates(request, false);
    const rateLimited: string[] = [];
    let lastError: unknown = null;

    for (const model of candidates) {
      let yielded = false;
      let streamError: unknown = null;
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(this.payload(request, model, false, false, true)),
          signal: combineSignals(request.signal, this.streamTimeoutMs),
        });
        if (!response.ok || !response.body) {
          const body = await response.text().catch(() => '');
          if (isRateLimit(response.status, body)) rateLimited.push(model);
          lastError = new Error(errorMessage(`${this.label} stream ${model}`, response.status, body));
          if (response.status === 401 || response.status === 403) break;
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
            if (parsed.error) {
              streamError = new Error(
                parsed.error.message || `${this.label} stream ${model} returned an error`,
              );
              if (isRateLimit(429, JSON.stringify(parsed.error))) rateLimited.push(model);
              break;
            }
            usage = usageFrom(parsed, request.prompt, text, usage);
            const chunk = extractText(
              parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content,
            );
            if (chunk) {
              yielded = true;
              text += chunk;
              yield chunk;
            }
          }
          if (streamError) break;
        }

        if (streamError) {
          if (yielded) throw providerError('The AI stream failed mid-response.', streamError);
          lastError = streamError;
          continue;
        }

        if (buffer.trim().startsWith('data:')) {
          const parsed = safeJson(buffer.trim().slice(5).trim());
          if (parsed.error) {
            streamError = new Error(
              parsed.error.message || `${this.label} stream ${model} returned an error`,
            );
            if (yielded) throw providerError('The AI stream failed mid-response.', streamError);
            lastError = streamError;
            continue;
          }
          usage = usageFrom(parsed, request.prompt, text, usage);
          const chunk = extractText(
            parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content,
          );
          if (chunk) {
            yielded = true;
            text += chunk;
            yield chunk;
          }
        }

        if (!text) {
          lastError = new Error(`${this.label} stream ${model} returned no text`);
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

    throw providerError(`All ${this.label} models failed. Please try again.`, lastError);
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
    if (this.appName) headers['X-Title'] = this.appName;
    return headers;
  }

  private payload(
    request: ProviderRequest,
    model: string,
    structured: boolean,
    vision: boolean,
    stream: boolean,
  ): unknown {
    const messages: OpenRouterMessage[] = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    if (vision && request.metadata?.imageBytes) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: request.prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${request.metadata.imageMimeType ?? 'image/jpeg'};base64,${bytesToBase64(request.metadata.imageBytes)}`,
            },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: request.prompt });
    }

    return {
      model,
      messages,
      temperature: request.temperature ?? (vision ? 0.4 : 0.7),
      max_tokens: request.maxOutputTokens,
      ...(this.jsonMode && structured ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        const text = (part as { text?: unknown }).text;
        if (typeof text === 'string') return text;
      }
      return '';
    })
    .join('');
}

function usageFrom(
  response: OpenRouterResponse | undefined,
  prompt: string,
  text: string,
  existing?: ProviderUsage,
): ProviderUsage {
  if (response?.usage) {
    return {
      input_tokens: response.usage.prompt_tokens ?? existing?.input_tokens ?? estimate(prompt),
      output_tokens: response.usage.completion_tokens ?? existing?.output_tokens ?? estimate(text),
    };
  }
  return (
    existing ?? {
      input_tokens: estimate(prompt),
      output_tokens: estimate(text),
    }
  );
}

function estimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function errorMessage(prefix: string, status: number, body: string): string {
  const parsed = safeJson(body);
  const detail = parsed.error?.message?.trim();
  return detail ? `${prefix} returned ${status}: ${detail}` : `${prefix} returned ${status}`;
}

function isRateLimit(status: number, body: string): boolean {
  const lower = body.toLowerCase();
  return (
    status === 429 ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('rate_limit_exceeded')
  );
}

function safeJson(value: string): OpenRouterResponse {
  try {
    return JSON.parse(value) as OpenRouterResponse;
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
