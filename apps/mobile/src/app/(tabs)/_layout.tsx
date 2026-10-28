import { Ionicons } from '@expo/vector-icons';
import { Tabs, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Android's hardware back on the tab root used to close the app instantly.
  // Ask first so an accidental press never loses the user's session.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert(t('mobile.exit.title'), t('mobile.exit.body'), [
          { text: t('mobile.common.cancel'), style: 'cancel' },
          {
            text: t('mobile.exit.confirm'),
            style: 'destructive',
            onPress: () => BackHandler.exitApp(),
          },
        ]);
        return true;
      });
      return () => subscription.remove();
    }, [t]),
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brandDark,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('mobile.tabs.pantry'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="basket-outline"
              color={focused ? theme.brandDark : theme.textMuted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cook"
        options={{
          title: t('mobile.tabs.cook'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="restaurant-outline"
              color={focused ? theme.brandDark : theme.textMuted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-chef"
        options={{
          title: t('mobile.tabs.aiChef'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="sparkles-outline"
              color={focused ? theme.brandDark : theme.textMuted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: t('mobile.tabs.grocery'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="cart-outline"
              color={focused ? theme.brandDark : theme.textMuted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('mobile.tabs.settings'),
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="settings-outline"
              color={focused ? theme.brandDark : theme.textMuted}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
