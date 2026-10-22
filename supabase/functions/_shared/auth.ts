import { AI_LOCALES } from '../../../packages/shared/src/ai-contracts.ts';
import { AppError, mapDatabaseError, unauthorized } from './errors.ts';
import type { DbClient } from './db.ts';
import type { AuthContext, PlanInfo, ProfileInfo } from './types.ts';
import { createUserClient, type SupabaseEnv, type SupabaseClient } from './supabase.ts';

export async function authenticate(
  request: Request,
  env: SupabaseEnv,
  serviceDb: DbClient,
): Promise<AuthContext> {
  const header = request.headers.get('authorization');
  if (!header) throw unauthorized();
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token || token.length > 8_192) throw unauthorized();

  const userClient = createUserClient(env, token);
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw unauthorized();

  const { data: profileRow, error: profileError } = await serviceDb
    .from('profiles')
    .select('id, username, locale, plan_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) throw mapDatabaseError(profileError.message, profileError);
  if (!profileRow) {
    throw new AppError('unauthorized', 'Your profile is not available. Sign in again.', 403);
  }

  const profile = profileRow as ProfileInfo;
  const { data: planRow, error: planError } = await serviceDb
    .from('plans')
    .select('id, features, monthly_budget_micro_usd, max_image_bytes')
    .eq('id', profile.plan_id)
    .maybeSingle();
  if (planError) throw mapDatabaseError(planError.message, planError);
  if (!planRow) {
    throw new AppError('unauthorized', 'Your plan is not available. Contact support.', 403);
  }

  return {
    userId: data.user.id,
    token,
    profile: {
      ...profile,
      locale: isLocale(profile.locale) ? profile.locale : 'en',
    },
    plan: parsePlan(planRow),
  };
}

export function userDbFor(env: SupabaseEnv, auth: AuthContext): SupabaseClient {
  return createUserClient(env, auth.token);
}

function parsePlan(value: unknown): PlanInfo {
  const record = (value ?? {}) as Record<string, unknown>;
  const features: Record<string, number> = {};
  if (record.features && typeof record.features === 'object' && !Array.isArray(record.features)) {
    for (const [key, entry] of Object.entries(record.features as Record<string, unknown>)) {
      if (typeof entry === 'number' && Number.isFinite(entry)) features[key] = entry;
    }
  }
  return {
    id: typeof record.id === 'string' ? record.id : 'free',
    features,
    monthly_budget_micro_usd:
      typeof record.monthly_budget_micro_usd === 'number'
        ? record.monthly_budget_micro_usd
        : 0,
    max_image_bytes:
      typeof record.max_image_bytes === 'number' ? record.max_image_bytes : 5 * 1024 * 1024,
  };
}

function isLocale(value: string): boolean {
  return (AI_LOCALES as readonly string[]).includes(value);
}
