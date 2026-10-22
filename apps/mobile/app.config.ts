import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Public Expo config.
 *
 * Only `EXPO_PUBLIC_*` values may be read here. The Supabase anon/publishable
 * key is public by design; provider API keys and the service-role key stay in
 * Supabase Edge Function secrets and are never bundled into the app.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'WhatToCook',
  slug: 'whattocook',
  scheme: 'whattocook',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.whattocook.app',
  },
  android: {
    package: 'com.whattocook.app',
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
