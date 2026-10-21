import { createClient } from '@supabase/supabase-js';
import type { Database } from '@whattocook/shared';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/**
 * The web client only ever uses the public anon/publishable key. AI provider
 * keys and the service-role key live in Supabase Edge Function secrets.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url || 'https://not-configured.supabase.co',
  anonKey || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'whattocook-web' },
    },
  },
);

export function requireSupabaseConfig(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Copy apps/web/.env.example to apps/web/.env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
}
