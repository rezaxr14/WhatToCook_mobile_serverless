import { isLocale, type Locale } from '@whattocook/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const LOCALE_KEY = 'whattocook.locale';

const webStorage = {
  get(key: string): string | null {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  },
  set(key: string, value: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
};

export async function getStoredLocale(): Promise<Locale | null> {
  try {
    const value =
      Platform.OS === 'web' ? webStorage.get(LOCALE_KEY) : await SecureStore.getItemAsync(LOCALE_KEY);
    return value && isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export async function storeLocale(locale: Locale): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      webStorage.set(LOCALE_KEY, locale);
      return;
    }
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
  } catch {
    // Language persistence is best-effort; the in-memory choice still applies.
  }
}
