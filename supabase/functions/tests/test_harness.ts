import type {
  CacheGateway,
  CacheHit,
  CacheSetInput,
  GatewayDeps,
  ModelPrice,
  QuotaGateway,
  RateLimits,
  ReserveInput,
  ReserveResult,
  SettleInput,
  UsageSnapshot,
  AuthContext,
  RuntimeConfig,
} from '../_shared/types.ts';
import { FakeProvider, type FakeProviderOptions } from '../_shared/providers/fake.ts';
import { budgetExhausted, quotaExceeded, unauthorized } from '../_shared/errors.ts';
import type { CatalogIngredient } from '../_shared/catalog.ts';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_TOKEN = 'test-token';

export interface QuotaOptions {
  dailyLimit?: number;
  monthlyBudget?: number;
  globalCap?: number;
  dailyUsed?: number;
  monthlyUsed?: number;
  globalUsed?: number;
  failUsageSnapshot?: boolean;
  rateLimitError?: Error;
}

export class MemoryQuota implements QuotaGateway {
  readonly events = new Map<
    string,
    {
      eventId: string;
      requestId: string;
      feature: string;
      status: string;
      reserved: number;
      cost: number;
    }
  >();
  readonly reservations: ReserveInput[] = [];
  readonly settled: SettleInput[] = [];
  readonly refunded: string[] = [];
  readonly rateLimitChecks: Array<RateLimits & { now: Date }> = [];
  cacheHitRecords = 0;
  dailyUsed: number;
  monthlyUsed: number;
  globalUsed: number;

  constructor(
    readonly features: Record<string, number>,
    readonly monthlyBudget: number,
    private readonly options: QuotaOptions = {},
  ) {
    this.dailyUsed = options.dailyUsed ?? 0;
    this.monthlyUsed = options.monthlyUsed ?? 0;
    this.globalUsed = options.globalUsed ?? 0;
  }

  async checkRateLimit(input: RateLimits & { now: Date }): Promise<void> {
    this.rateLimitChecks.push(input);
    if (this.options.rateLimitError) throw this.options.rateLimitError;
  }

  async reserve(input: ReserveInput): Promise<ReserveResult> {
    this.reservations.push(input);
    const existing = this.events.get(input.requestId);
    if (existing) {
      return {
        eventId: existing.eventId,
        status: existing.status,
        idempotent: true,
        reservedMicroUsd: existing.reserved,
      };
    }

    const dailyLimit = this.options.dailyLimit ?? this.features[input.feature] ?? 0;
    if (this.dailyUsed >= dailyLimit) {
      throw quotaExceeded('Your daily AI request limit has been reached.');
    }
    if (this.monthlyBudget >= 0 && this.monthlyUsed + input.reservedMicroUsd > this.monthlyBudget) {
      throw quotaExceeded('Your monthly AI budget has been reached.');
    }
    const cap = this.options.globalCap ?? 5_000_000;
    if (cap >= 0 && this.globalUsed + input.reservedMicroUsd >= cap) {
      throw budgetExhausted();
    }

    const eventId = crypto.randomUUID();
    this.events.set(input.requestId, {
      eventId,
      requestId: input.requestId,
      feature: input.feature,
      status: 'reserved',
      reserved: input.reservedMicroUsd,
      cost: 0,
    });
    this.dailyUsed += 1;
    this.monthlyUsed += input.reservedMicroUsd;
    this.globalUsed += input.reservedMicroUsd;
    return {
      eventId,
      status: 'reserved',
      idempotent: false,
      reservedMicroUsd: input.reservedMicroUsd,
    };
  }

  async settle(input: SettleInput): Promise<void> {
    this.settled.push(input);
    const event = [...this.events.values()].find((entry) => entry.eventId === input.eventId);
    if (event) {
      event.status = 'settled';
      event.cost = input.costMicroUsd;
      this.monthlyUsed = Math.max(0, this.monthlyUsed - event.reserved + input.costMicroUsd);
      this.globalUsed = Math.max(0, this.globalUsed - event.reserved + input.costMicroUsd);
    }
  }

  async refund(eventId: string, _errorCode: string): Promise<void> {
    this.refunded.push(eventId);
    const event = [...this.events.values()].find((entry) => entry.eventId === eventId);
    if (event && event.status === 'reserved') {
      event.status = 'refunded';
      this.monthlyUsed = Math.max(0, this.monthlyUsed - event.reserved);
      this.globalUsed = Math.max(0, this.globalUsed - event.reserved);
      this.dailyUsed = Math.max(0, this.dailyUsed - 1);
    }
  }

  async getUsage(_auth: AuthContext): Promise<UsageSnapshot> {
    if (this.options.failUsageSnapshot) {
      throw new Error('usage snapshot unavailable');
    }
    const daily: UsageSnapshot['daily'] = {};
    for (const [feature, limit] of Object.entries(this.features)) {
      const used = feature === 'suggestions' ? this.dailyUsed : 0;
      daily[feature] = {
        limit,
        used,
        remaining: limit < 0 ? null : Math.max(0, limit - used),
      };
    }
    return {
      plan_id: 'free',
      daily,
      monthly: {
        budget_micro_usd: this.monthlyBudget,
        used_micro_usd: this.monthlyUsed,
        remaining_micro_usd:
          this.monthlyBudget < 0 ? null : Math.max(0, this.monthlyBudget - this.monthlyUsed),
      },
      resets_at: '2026-10-23T00:00:00.000Z',
    };
  }

  async recordCacheHit(_input: {
    userId: string;
    requestId: string;
    feature: string;
    provider: string;
    model: string;
    latencyMs: number;
  }): Promise<void> {
    this.cacheHitRecords += 1;
  }
}

export class MemoryCache implements CacheGateway {
  readonly entries = new Map<string, { response: unknown; expiresAt: string; feature: string }>();
  touches = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get(key: string): Promise<CacheHit | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() <= this.now().getTime()) {
      this.entries.delete(key);
      return null;
    }
    return { response: entry.response, expiresAt: entry.expiresAt };
  }

  async set(input: CacheSetInput): Promise<void> {
    this.entries.set(input.key, {
      response: input.response,
      feature: input.feature,
      expiresAt: new Date(this.now().getTime() + input.ttlSeconds * 1_000).toISOString(),
    });
  }

  async touch(_key: string): Promise<void> {
    this.touches += 1;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

export const TEST_CATALOG: CatalogIngredient[] = [
  {
    id: 1,
    slug: 'eggs',
    name_en: 'Eggs',
    names: { en: 'Eggs', tr: 'Yumurta' },
    category: 'Dairy & Eggs',
  },
  {
    id: 2,
    slug: 'tomato',
    name_en: 'Tomato',
    names: { en: 'Tomato', tr: 'Domates' },
    category: 'Produce',
  },
  {
    id: 3,
    slug: 'milk',
    name_en: 'Milk',
    names: { en: 'Milk', tr: 'Süt' },
    category: 'Dairy & Eggs',
  },
  {
    id: 4,
    slug: 'garlic',
    name_en: 'Garlic',
    names: { en: 'Garlic', tr: 'Sarımsak' },
    category: 'Produce',
  },
];

export interface TestHarness {
  deps: GatewayDeps;
  provider: FakeProvider;
  quota: MemoryQuota;
  cache: MemoryCache;
  config: RuntimeConfig;
  auth: AuthContext;
}

export function createHarness(
  options: {
    provider?: FakeProviderOptions;
    quota?: QuotaOptions;
    monthlyBudget?: number;
    planFeatures?: Record<string, number>;
    maxImageBytes?: number;
    killSwitch?: boolean;
    providerId?: 'fake' | 'gemini' | 'openrouter' | 'lmstudio';
    rateLimits?: RateLimits;
    price?: ModelPrice | null;
  } = {},
): TestHarness {
  const features = options.planFeatures ?? {
    suggestions: 30,
    recipe: 30,
    chat: 50,
    stream: 20,
    scan: 10,
    substitution: 30,
  };
  const monthlyBudget = options.monthlyBudget ?? 2_000_000;
  const config: RuntimeConfig = {
    providerId: options.providerId ?? 'fake',
    killSwitch: options.killSwitch ?? false,
    featureFlags: {
      suggestions: true,
      recipe: true,
      chat: true,
      stream: true,
      scan: true,
      substitution: true,
    },
    globalDailyCapMicroUsd: 5_000_000,
    rateLimits: options.rateLimits ?? { rpm: null, rpd: null },
    models: {
      suggestions: 'fake-lite',
      recipe: 'fake-flash',
      chat: 'fake-flash',
      stream: 'fake-flash',
      scan: 'fake-flash',
      substitution: 'fake-lite',
    },
    allowedModels: [],
    fallbacks: { text: [], vision: [] },
    allowedOrigins: ['http://localhost:5173'],
  };
  const auth: AuthContext = {
    userId: TEST_USER_ID,
    token: TEST_TOKEN,
    profile: {
      id: TEST_USER_ID,
      username: 'Tester',
      locale: 'en',
      plan_id: 'free',
    },
    plan: {
      id: 'free',
      features,
      monthly_budget_micro_usd: monthlyBudget,
      max_image_bytes: options.maxImageBytes ?? 5 * 1024 * 1024,
    },
  };
  const provider = new FakeProvider(options.provider);
  const quota = new MemoryQuota(features, monthlyBudget, options.quota);
  const now = () => new Date('2026-10-22T12:00:00.000Z');
  const cache = new MemoryCache(now);
  const price =
    options.price === undefined
      ? {
          provider: 'fake',
          model: 'fake-flash',
          input_micro_usd_per_million: 0,
          output_micro_usd_per_million: 0,
        }
      : options.price;

  const deps: GatewayDeps = {
    allowedOrigins: () => ['http://localhost:5173'],
    auth: async (request) => {
      if (request.headers.get('authorization') !== `Bearer ${TEST_TOKEN}`) {
        throw unauthorized();
      }
      return auth;
    },
    loadConfig: async () => config,
    getPrice: async () => price,
    quota,
    cache,
    loadCatalog: async () => TEST_CATALOG,
    provider: () => provider,
    now,
  };

  return { deps, provider, quota, cache, config, auth };
}

export function jsonRequest(
  body: unknown,
  options: {
    auth?: boolean;
    origin?: string | null;
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {},
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.auth !== false) headers.set('authorization', `Bearer ${TEST_TOKEN}`);
  if (options.origin !== null) headers.set('origin', options.origin ?? 'http://localhost:5173');
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey);
  return new Request('http://localhost/function', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function makeJpegWithExif(extraBytes = 0): Uint8Array {
  const payload = new TextEncoder().encode(
    `Exif\u0000\u0000secret-metadata${'x'.repeat(extraBytes)}`,
  );
  const app1 = new Uint8Array(2 + 2 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1[2] = ((payload.length + 2) >> 8) & 0xff;
  app1[3] = (payload.length + 2) & 0xff;
  app1.set(payload, 4);
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

export function makePngWithText(): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const textData = new TextEncoder().encode('secret-metadata');
  const text = pngChunk('tEXt', textData);
  const iend = pngChunk('IEND', new Uint8Array(0));
  return new Uint8Array([...signature, ...text, ...iend]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out[0] = (data.length >> 24) & 0xff;
  out[1] = (data.length >> 16) & 0xff;
  out[2] = (data.length >> 8) & 0xff;
  out[3] = data.length & 0xff;
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  // The gateway does not verify CRCs; zeros are sufficient for parser tests.
  return out;
}

export async function readNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
