import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Public Expo config.
 *
 * Only `EXPO_PUBLIC_*` values may be read here. The Supabase anon/publishable
 * key is public by design; provider API keys and the service-role key stay in
 * Supabase Edge Function secrets and are never bundled into the app.
 *
 * `APP_VARIANT=staging` builds a second installable app (different package id
 * and display name) that can point at the staging Supabase project without
 * replacing the production app on the same device. Production is the default.
 */
const variant = (process.env.APP_VARIANT ?? 'production').trim().toLowerCase();
const isStaging = variant === 'staging';
const versionCode = Number.parseInt(process.env.APP_VERSION_CODE ?? '1', 10);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isStaging ? 'WhatToCook Staging' : 'WhatToCook',
  slug: 'whattocook',
  scheme: 'whattocook',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: isStaging ? 'com.whattocook.app.staging' : 'com.whattocook.app',
    buildNumber: String(Number.isFinite(versionCode) && versionCode > 0 ? versionCode : 1),
  },
  android: {
    package: isStaging ? 'com.whattocook.app.staging' : 'com.whattocook.app',
    versionCode: Number.isFinite(versionCode) && versionCode > 0 ? versionCode : 1,
    adaptiveIcon: {
      backgroundColor: '#fff7ed',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: true,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-localization',
    './plugins/with-release-signing',
    ['expo-secure-store', { configureAndroidBackup: true }],
    [
      'expo-image-picker',
      {
        photosPermission: 'WhatToCook uses your photos to detect ingredients in your pantry.',
        cameraPermission: 'WhatToCook uses your camera to scan ingredients in your pantry.',
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#f97316',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
