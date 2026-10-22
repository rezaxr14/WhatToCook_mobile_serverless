import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { LocaleProvider, useLocale } from '@/features/i18n/locale-provider';
import { queryClient } from '@/lib/query-client';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  const { ready, hasChosenLanguage } = useLocale();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready || status === 'loading') return;

    const top = segments[0];
    if (!hasChosenLanguage) {
      if (top !== 'language') router.replace('/language');
      return;
    }

    const inAuth = top === 'auth';
    if (status === 'unauthenticated' && !inAuth) {
      router.replace('/auth');
    } else if (status === 'authenticated' && inAuth) {
      router.replace('/');
    }
  }, [ready, status, hasChosenLanguage, segments, router]);

  useEffect(() => {
    if (ready && status !== 'loading') {
      void SplashScreen.hideAsync();
    }
  }, [ready, status]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth" />
      <Stack.Screen
        name="language"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="ai-recipe/[name]" />
      <Stack.Screen name="recipes/index" />
      <Stack.Screen name="recipe/[id]" />
      <Stack.Screen
        name="scan-pantry"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <AuthProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </AuthProvider>
          </LocaleProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
