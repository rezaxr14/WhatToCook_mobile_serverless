import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  isRtlLocale,
  translations,
  type Locale,
} from '@whattocook/shared';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
] as const satisfies ReadonlyArray<{
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}>;

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
  return isLocale(code) ? code : DEFAULT_LOCALE;
}

/**
 * Native layout direction is read once per launch, so forcing a change only
 * shows up after the app restarts (Settings shows a restart hint). Remember
 * what we last asked for because `I18nManager.isRTL` keeps reporting the
 * value from launch time and would otherwise flip the preference back.
 */
let forcedRtl: boolean | null = null;

export function applyDirection(locale: Locale): void {
  const rtl = isRtlLocale(locale);
  const current = forcedRtl ?? I18nManager.isRTL;
  if (current !== rtl) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(rtl);
  }
  forcedRtl = rtl;
}

const initialLocale = deviceLocale();

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: Object.fromEntries(
      Object.entries(translations).map(([code, translation]) => [code, { translation }]),
    ),
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    initAsync: false,
  });
}

export default i18n;
