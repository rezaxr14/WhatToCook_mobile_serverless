/**
 * Public runtime configuration.
 *
 * The Supabase anon/publishable key is safe to ship in the app bundle. AI
 * provider keys never leave the Edge Functions.
 */
const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const rawAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseUrl = rawUrl.replace(/\/+$/, '') || 'https://not-configured.supabase.co';
export const supabaseAnonKey = rawAnonKey || 'not-configured';
export const isSupabaseConfigured = Boolean(rawUrl && rawAnonKey);
