/**
 * Ambient types for the public Expo environment variables.
 *
 * Expo inlines `EXPO_PUBLIC_*` values at build time. Only public values belong
 * here; never add provider keys or the Supabase service-role key.
 */
declare const process: {
  env: {
    NODE_ENV?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  };
};
