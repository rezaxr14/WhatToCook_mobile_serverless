import type {
  AIFeature,
  AIProviderId,
  NDJSONEvent,
  RecipeDetail,
  SubstitutionResult,
  UsageSnapshot,
} from '../../../packages/shared/src/ai-contracts.ts';
import type { CatalogIngredient } from './catalog.ts';

export type {
  AIFeature,
  AIProviderId,
  NDJSONEvent,
  RecipeDetail,
  SubstitutionResult,
  UsageSnapshot,
};

export interface PlanInfo {
  id: string;
  features: Record<string, number>;
  monthly_budget_micro_usd: number;
  max_image_bytes: number;
}

export interface ProfileInfo {
  id: string;
  username: string;
  locale: string;
  plan_id: string;
}

export interface AuthContext {
  userId: string;
  token: string;
  profile: ProfileInfo;
  plan: PlanInfo;
  /** Set for main's service-principal calls; per-user quota/challenge do not apply. */
  service?: {
    name: string;
    principalClass: 'anonymous' | 'registered';
    endUserRefHash?: string;
  };
  /** Trusted server-side caller (Telegram bot): no captcha, but quotas apply. */
  internal?: boolean;
  /** Skips the adaptive challenge for an internal caller. */
  challengeExempt?: boolean;
}

export interface RateLimits {
  /** Global provider requests per rolling minute; null disables this guard. */
  rpm: number | null;
  /** Global provider requests per UTC day; null disables this guard. */
  rpd: number | null;
  /** Provider requests per fixed one-minute window for a signed-in user. */
  userRpm: number | null;
  /** Provider requests per fixed one-minute window for an anonymous account. */
  anonRpm: number | null;
  /** Provider requests per fixed one-minute window per hashed client IP. */
  ipRpm: number | null;
}

export interface RateLimitInput extends RateLimits {
  now: Date;
  /** null for service-principal calls (no per-user guard). */
  userId: string | null;
  planId: string;
  /** SHA-256 of the client IP, or null when the proxy did not expose one. */
  ipKey: string | null;
}

export interface RuntimeConfig {
  providerId: AIProviderId;
  /** Providers the client may pick. Always contains `providerId`. */
  allowedProviders: string[];
  killSwitch: boolean;
  featureFlags: Record<string, boolean>;
  globalDailyCapMicroUsd: number;
  rateLimits: RateLimits;
  models: Partial<Record<AIFeature, string>>;
  /** Client-selectable Gemini models (routed models plus fallbacks). */
  allowedModels: string[];
  /** Default OpenRouter model, used when the client picks the OpenRouter provider. */
  openRouterModel: string;
  fallbacks: {
    text: string[];
    vision: string[];
  };
  allowedOrigins: string[];
  /** Adaptive challenge gate (plan 4.1). */
  challenge: {
    everyNCalls: number;
    webEnforce: boolean;
    mobileEnforce: boolean;
    turnstileAction: string;
    unattestedDailyCap: number;
  };
  /** Daily request pools (plan 4.2). */
  pools: {
    anonymousPct: number;
    registeredPct: number;
  };
  /** 95 % of the provider's configured daily limit; null disables the guard. */
  providerDailyGuard: number | null;
}

export interface ModelPrice {
  provider: string;
  model: string;
  input_micro_usd_per_million: number;
  output_micro_usd_per_million: number;
}

export interface ProviderUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ProviderRequest {
  prompt: string;
  system?: string;
  model: string;
  temperature?: number;
  maxOutputTokens: number;
  responseMimeType?: 'application/json' | 'text/plain';
  signal?: AbortSignal;
  metadata?: {
    feature: AIFeature;
    locale?: string;
    imageBytes?: Uint8Array;
    imageMimeType?: string;
  };
}

export interface ProviderResult {
  text: string;
  usage: ProviderUsage;
  model: string;
  provider: string;
  latency_ms: number;
  rate_limited_models: string[];
}

export interface AIProvider {
  readonly id: string;
  generateText(request: ProviderRequest): Promise<ProviderResult>;
  generateStructured(request: ProviderRequest): Promise<ProviderResult>;
  streamText(request: ProviderRequest): AsyncGenerator<string, ProviderResult, void>;
  visionExtract(request: ProviderRequest): Promise<ProviderResult>;
}

/** Hooks the gateway injects so every provider HTTP attempt is counted. */
export interface ProviderHooks {
  onAttempt?: (providerId: string) => Promise<void>;
}

export interface ReserveInput {
  userId: string;
  requestId: string;
  feature: AIFeature;
  reservedMicroUsd: number;
  provider: string;
  model: string;
  /** Pool the request belongs to (plan 4.2). */
  pool?: 'anonymous' | 'registered' | 'service';
  /** Precomputed share of the guarded daily limit; null disables the check. */
  poolLimit?: number | null;
  /** Service principal name; when set, no auth.users row is used. */
  service?: string;
  /** Lower per-user daily cap (unattested mobile devices), when applicable. */
  dailyCap?: number | null;
}

export interface ChallengeDecision {
  allowed: boolean;
  callsSinceVerified: number;
}

export interface ChallengeNonce {
  nonce: string;
  expiresAt: string;
}

export interface ReserveResult {
  eventId: string;
  status: string;
  idempotent: boolean;
  reservedMicroUsd: number;
}

export interface SettleInput {
  eventId: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

export interface CacheHit {
  response: unknown;
  expiresAt: string;
}

export interface CacheSetInput {
  key: string;
  feature: AIFeature;
  response: unknown;
  ttlSeconds: number;
}

export interface QuotaGateway {
  checkRateLimit(input: RateLimitInput): Promise<void>;
  reserve(input: ReserveInput): Promise<ReserveResult>;
  settle(input: SettleInput): Promise<void>;
  refund(eventId: string, errorCode: string): Promise<void>;
  getUsage(auth: AuthContext): Promise<UsageSnapshot>;
  /** Usage for a linked profile without a user JWT (Telegram bot). */
  getUsageForUser(userId: string): Promise<UsageSnapshot>;
  recordCacheHit(input: {
    userId: string;
    requestId: string;
    feature: AIFeature;
    provider: string;
    model: string;
    latencyMs: number;
    /** Service principal, so a cache hit is stored without a user row. */
    service?: string;
  }): Promise<void>;
  /** Adaptive challenge gate; call only on a request that will reach a provider. */
  consumeChallenge(userId: string, everyNCalls: number): Promise<ChallengeDecision>;
  resetChallenge(userId: string, kind: 'turnstile' | 'play_integrity'): Promise<void>;
  createChallengeNonce(userId: string, ttlSeconds: number): Promise<ChallengeNonce>;
  consumeChallengeNonce(userId: string, nonce: string): Promise<boolean>;
  /** Counts one provider HTTP attempt (including fallbacks/retries). */
  recordProviderAttempt(provider: string, guardLimit: number | null): Promise<void>;
}

export interface CacheGateway {
  get(key: string): Promise<CacheHit | null>;
  set(input: CacheSetInput): Promise<void>;
  touch(key: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface GatewayDeps {
  allowedOrigins(): string[];
  auth(request: Request): Promise<AuthContext>;
  /** `X-Service-Key` auth for main's server-to-server adapter (plan 4.3). */
  serviceAuth(request: Request): Promise<AuthContext>;
  loadConfig(): Promise<RuntimeConfig>;
  getPrice(provider: string, model: string): Promise<ModelPrice | null>;
  quota: QuotaGateway;
  cache: CacheGateway;
  loadCatalog(): Promise<CatalogIngredient[]>;
  provider(providerId: string, config: RuntimeConfig, hooks?: ProviderHooks): AIProvider;
  /** Public URL for a file in the `recipe-images` Storage bucket. */
  imageUrl(file: string): string;
  now(): Date;
}
