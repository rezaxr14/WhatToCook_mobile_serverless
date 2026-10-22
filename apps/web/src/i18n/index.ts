import { translations, type Locale } from '@whattocook/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷', dir: 'rtl' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', dir: 'ltr' },
] as const;

export const RTL_LANGUAGES = ['fa', 'ar'];
export const LANGUAGE_STORAGE_KEY = 'whattocook_language_selected';

export const getLanguageDir = (lng: string): 'ltr' | 'rtl' =>
  RTL_LANGUAGES.includes(lng.split('-')[0]) ? 'rtl' : 'ltr';

export const applyDocumentLanguage = (lng: string) => {
  const dir = getLanguageDir(lng);
  document.documentElement.lang = lng.split('-')[0];
  document.documentElement.dir = dir;
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: Object.fromEntries(
        Object.entries(translations).map(([code, translation]) => [code, { translation }]),
      ),
      fallbackLng: 'en',
      supportedLngs: ['en', 'tr', 'fa', 'ar', 'es'] satisfies Locale[],
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'language',
      },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
    });

  applyDocumentLanguage(i18n.language || 'en');
  i18n.on('languageChanged', applyDocumentLanguage);
}

export default i18n;
