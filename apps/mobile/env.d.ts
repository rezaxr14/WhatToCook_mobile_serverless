/**
 * Ambient types for the environment variables read by the mobile app.
 *
 * Expo inlines `EXPO_PUBLIC_*` values at build time. `APP_VARIANT` and
 * `APP_VERSION_CODE` are build-time knobs for `app.config.ts` only. Only public
 * values belong here; never add provider keys or the Supabase service-role key.
 */
declare const process: {
  env: {
    NODE_ENV?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    APP_VARIANT?: string;
    APP_VERSION_CODE?: string;
  };
};
