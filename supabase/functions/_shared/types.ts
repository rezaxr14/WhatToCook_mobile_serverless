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
  userId: string;
  planId: string;
  /** SHA-256 of the client IP, or null when the proxy did not expose one. */
  ipKey: string | null;
}

export interface RuntimeConfig {
  providerId: AIProviderId;
  killSwitch: boolean;
  featureFlags: Record<string, boolean>;
  globalDailyCapMicroUsd: number;
  rateLimits: RateLimits;
  models: Partial<Record<AIFeature, string>>;
  /** Client-selectable models. Empty means client model choices are ignored. */
  allowedModels: string[];
  fallbacks: {
    text: string[];
    vision: string[];
  };
  allowedOrigins: string[];
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

export interface ReserveInput {
  userId: string;
  requestId: string;
  feature: AIFeature;
  reservedMicroUsd: number;
  provider: string;
  model: string;
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
  recordCacheHit(input: {
    userId: string;
    requestId: string;
    feature: AIFeature;
    provider: string;
    model: string;
    latencyMs: number;
  }): Promise<void>;
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
  loadConfig(): Promise<RuntimeConfig>;
  getPrice(provider: string, model: string): Promise<ModelPrice | null>;
  quota: QuotaGateway;
  cache: CacheGateway;
  loadCatalog(): Promise<CatalogIngredient[]>;
  provider(providerId: string, config: RuntimeConfig): AIProvider;
  now(): Date;
}
