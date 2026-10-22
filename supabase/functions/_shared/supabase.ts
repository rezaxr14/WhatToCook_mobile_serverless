import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { internalError } from './errors.ts';

export type { SupabaseClient };

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function readSupabaseEnv(env: Record<string, string | undefined>): SupabaseEnv {
  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim() || env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw internalError('Supabase Edge Function environment is incomplete.');
  }
  return { url, anonKey, serviceRoleKey };
}

export function createServiceClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'whattocook-edge-gateway' } },
  });
}

export function createUserClient(env: SupabaseEnv, accessToken: string): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Client-Info': 'whattocook-edge-gateway',
      },
    },
  });
}
