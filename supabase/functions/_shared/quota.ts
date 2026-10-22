import {
  usageSnapshotSchema,
  type AIFeature,
  type UsageSnapshot,
} from '../../../packages/shared/src/ai-contracts.ts';
import type {
  AuthContext,
  QuotaGateway,
  ReserveInput,
  ReserveResult,
  SettleInput,
} from './types.ts';
import type { DbClient } from './db.ts';
import { mapDatabaseError } from './errors.ts';

interface ReserveRow {
  event_id?: string;
  status?: string;
  idempotent?: boolean;
  reserved_micro_usd?: number;
}

function parseReserve(data: unknown): ReserveResult {
  const row = (data ?? {}) as ReserveRow;
  if (!row.event_id || !row.status) {
    throw new Error('reserve_ai_quota returned an unexpected payload');
  }
  return {
    eventId: row.event_id,
    status: row.status,
    idempotent: row.idempotent === true,
    reservedMicroUsd: Number(row.reserved_micro_usd ?? 0),
  };
}

export function createQuotaGateway(
  serviceDb: DbClient,
  userClientFor: (auth: AuthContext) => DbClient,
): QuotaGateway {
  return {
    async reserve(input: ReserveInput): Promise<ReserveResult> {
      const { data, error } = await serviceDb.rpc('reserve_ai_quota', {
        p_user_id: input.userId,
        p_request_id: input.requestId,
        p_feature: input.feature,
        p_reserved_micro_usd: input.reservedMicroUsd,
        p_provider: input.provider,
        p_model: input.model,
      });
      if (error) throw mapDatabaseError(error.message, error);
      return parseReserve(data);
    },

    async settle(input: SettleInput): Promise<void> {
      const { error } = await serviceDb.rpc('settle_ai_usage', {
        p_event_id: input.eventId,
        p_input_tokens: input.inputTokens,
        p_output_tokens: input.outputTokens,
        p_cost_micro_usd: input.costMicroUsd,
      });
      if (error) throw mapDatabaseError(error.message, error);
    },

    async refund(eventId: string, errorCode: string): Promise<void> {
      const { error } = await serviceDb.rpc('refund_ai_usage', {
        p_event_id: eventId,
        p_error_code: errorCode.slice(0, 80),
      });
      if (error) throw mapDatabaseError(error.message, error);
    },

    async getUsage(auth: AuthContext): Promise<UsageSnapshot> {
      const userDb = userClientFor(auth);
      const { data, error } = await userDb.rpc('get_my_usage');
      if (error) throw mapDatabaseError(error.message, error);
      const parsed = usageSnapshotSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error('get_my_usage returned an unexpected payload');
      }
      return parsed.data;
    },

    async recordCacheHit(input: {
      userId: string;
      requestId: string;
      feature: AIFeature;
      provider: string;
      model: string;
      latencyMs: number;
    }): Promise<void> {
      const { error } = await serviceDb.from('ai_usage_events').insert({
        user_id: input.userId,
        request_id: input.requestId,
        feature: input.feature,
        provider: input.provider,
        model: input.model,
        status: 'settled',
        reserved_micro_usd: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_micro_usd: 0,
        cache_hit: true,
        latency_ms: Math.max(0, Math.round(input.latencyMs)),
        settled_at: new Date().toISOString(),
      });
      if (error && !isDuplicate(error.message, error.code)) {
        throw mapDatabaseError(error.message, error);
      }
    },
  };
}

function isDuplicate(message: string, code?: string): boolean {
  return code === '23505' || message.includes('duplicate key value');
}
