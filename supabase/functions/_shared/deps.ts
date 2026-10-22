import { authenticate, userDbFor } from './auth.ts';
import { createCacheGateway } from './cache.ts';
import { loadCatalog } from './catalog.ts';
import { loadRuntimeConfig } from './config.ts';
import { parseAllowedOrigins } from './cors.ts';
import type { DbClient } from './db.ts';
import { getActivePrice } from './prices.ts';
import { createProvider } from './providers/index.ts';
import { createQuotaGateway } from './quota.ts';
import { createServiceClient, readSupabaseEnv, type SupabaseEnv } from './supabase.ts';
import type { GatewayDeps } from './types.ts';

export function createGatewayDeps(env: Record<string, string | undefined> = Deno.env.toObject()): GatewayDeps {
  const supabaseEnv: SupabaseEnv = readSupabaseEnv(env);
  const service = createServiceClient(supabaseEnv);
  const serviceDb = service as unknown as DbClient;
  const now = () => new Date();

  return {
    allowedOrigins: () => parseAllowedOrigins(env.ALLOWED_ORIGINS),
    auth: (request) => authenticate(request, supabaseEnv, serviceDb),
    loadConfig: () => loadRuntimeConfig(serviceDb, env),
    getPrice: (provider, model) => getActivePrice(serviceDb, provider, model, now()),
    quota: createQuotaGateway(serviceDb, (auth) => userDbFor(supabaseEnv, auth) as unknown as DbClient),
    cache: createCacheGateway(serviceDb, now),
    loadCatalog: () => loadCatalog(serviceDb),
    provider: (providerId, config) => createProvider(providerId, config, env),
    now,
  };
}
