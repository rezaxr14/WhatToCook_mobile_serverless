import { providerError } from '../errors.ts';
import { FakeProvider } from './fake.ts';
import { GeminiProvider } from './gemini.ts';
import type { AIProvider, RuntimeConfig } from '../types.ts';

export function createProvider(
  providerId: string,
  config: RuntimeConfig,
  env: Record<string, string | undefined>,
): AIProvider {
  if (providerId === 'fake') {
    return new FakeProvider({
      delayMs: numberFromEnv(env.FAKE_PROVIDER_DELAY_MS, 0),
      invalidOutput: booleanFromEnv(env.FAKE_PROVIDER_INVALID_OUTPUT),
      emptyOutput: booleanFromEnv(env.FAKE_PROVIDER_EMPTY_OUTPUT),
      failFeatures: commaList(env.FAKE_PROVIDER_FAIL_FEATURES),
    });
  }

  if (providerId === 'gemini') {
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw providerError('Gemini is not configured on the server.');
    }
    const textFallbacks = unique([
      ...config.fallbacks.text,
      config.models.suggestions,
      config.models.recipe,
      config.models.chat,
      config.models.stream,
      config.models.substitution,
    ]);
    const visionFallbacks = unique([
      ...config.fallbacks.vision,
      config.models.scan,
      config.models.recipe,
    ]);
    return new GeminiProvider({ apiKey, textFallbacks, visionFallbacks });
  }

  throw providerError('The configured AI provider is not supported.');
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanFromEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function commaList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
