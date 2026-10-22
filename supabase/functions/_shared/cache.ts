import { stableStringify, type AIFeature } from '../../../packages/shared/src/ai-contracts.ts';
import type { CacheGateway, CacheHit, CacheSetInput } from './types.ts';
import type { DbClient } from './db.ts';
import { sha256Hex } from './http.ts';
import { mapDatabaseError } from './errors.ts';

export interface CacheKeyInput {
  feature: AIFeature;
  provider: string;
  model: string;
  locale: string;
  promptVersion: string;
  payload: unknown;
}

export async function buildCacheKey(input: CacheKeyInput): Promise<string> {
  return sha256Hex(`ai-cache:v1:${stableStringify(input)}`);
}

export async function buildIdempotencyCacheKey(
  userId: string,
  requestId: string,
): Promise<string> {
  return `idem:${await sha256Hex(`${userId}:${requestId}`)}`;
}

interface CacheRow {
  response: unknown;
  expires_at: string;
  hit_count?: number;
}

export function createCacheGateway(db: DbClient, now: () => Date = () => new Date()): CacheGateway {
  return {
    async get(key): Promise<CacheHit | null> {
      const { data, error } = await db
        .from('ai_response_cache')
        .select('response, expires_at, hit_count')
        .eq('key', key)
        .maybeSingle();
      if (error) throw mapDatabaseError(error.message, error);
      const row = data as CacheRow | null;
      if (!row) return null;
      if (new Date(row.expires_at).getTime() <= now().getTime()) {
        const { error: deleteError } = await db.from('ai_response_cache').delete().eq('key', key);
        if (deleteError) throw mapDatabaseError(deleteError.message, deleteError);
        return null;
      }
      return { response: row.response, expiresAt: row.expires_at };
    },

    async set(input: CacheSetInput): Promise<void> {
      const expiresAt = new Date(now().getTime() + input.ttlSeconds * 1_000).toISOString();
      const { error } = await db.from('ai_response_cache').upsert(
        {
          key: input.key,
          feature: input.feature,
          response: input.response,
          expires_at: expiresAt,
        },
        { onConflict: 'key' },
      );
      if (error) throw mapDatabaseError(error.message, error);
    },

    async touch(key): Promise<void> {
      const { error } = await db.rpc('record_ai_cache_hit', { p_key: key });
      if (error) throw mapDatabaseError(error.message, error);
    },

    async delete(key): Promise<void> {
      const { error } = await db.from('ai_response_cache').delete().eq('key', key);
      if (error) throw mapDatabaseError(error.message, error);
    },
  };
}
