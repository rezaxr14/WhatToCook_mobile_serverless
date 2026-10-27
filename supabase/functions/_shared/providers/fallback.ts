import type { AIProvider, ProviderRequest, ProviderResult } from '../types.ts';

/**
 * Tries a primary provider first and falls back to a secondary provider when
 * the primary fails before producing any output. Used to keep the app working
 * on OpenRouter's free models during a Gemini outage or quota exhaustion.
 *
 * Pricing and quotas stay keyed to the primary provider for the reservation;
 * settlement uses the provider/model returned by whichever provider answered.
 * The fallback model must therefore be free (or have a price row/env price).
 */
export class FallbackProvider implements AIProvider {
  readonly id: string;

  constructor(
    private readonly primary: AIProvider,
    private readonly secondary: AIProvider,
    /** Model id to request from the secondary provider. */
    private readonly secondaryModel: string,
  ) {
    this.id = primary.id;
  }

  private fallbackRequest(request: ProviderRequest): ProviderRequest {
    return { ...request, model: this.secondaryModel };
  }

  async generateText(request: ProviderRequest): Promise<ProviderResult> {
    try {
      return await this.primary.generateText(request);
    } catch (error) {
      if (request.signal?.aborted) throw error;
      return this.secondary.generateText(this.fallbackRequest(request));
    }
  }

  async generateStructured(request: ProviderRequest): Promise<ProviderResult> {
    try {
      return await this.primary.generateStructured(request);
    } catch (error) {
      if (request.signal?.aborted) throw error;
      return this.secondary.generateStructured(this.fallbackRequest(request));
    }
  }

  async visionExtract(request: ProviderRequest): Promise<ProviderResult> {
    try {
      return await this.primary.visionExtract(request);
    } catch (error) {
      if (request.signal?.aborted) throw error;
      return this.secondary.visionExtract(this.fallbackRequest(request));
    }
  }

  async *streamText(request: ProviderRequest): AsyncGenerator<string, ProviderResult, void> {
    let yielded = false;
    const primary = this.primary.streamText(request);
    try {
      for (;;) {
        const next = await primary.next();
        if (next.done) return next.value;
        yielded = true;
        yield next.value;
      }
    } catch (error) {
      // Once the client has seen part of a response, switching providers would
      // splice two different answers together; surface the failure instead.
      if (yielded || request.signal?.aborted) throw error;
    }

    const secondary = this.secondary.streamText(this.fallbackRequest(request));
    for (;;) {
      const next = await secondary.next();
      if (next.done) return next.value;
      yield next.value;
    }
  }
}
