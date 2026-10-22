import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { applyDirection, default as i18n } from '@/i18n';
import { getStoredLocale, storeLocale } from '@/lib/locale-store';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@whattocook/shared';

interface LocaleContextValue {
  ready: boolean;
  locale: Locale;
  hasChosenLanguage: boolean;
  setLocale: (locale: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function currentLocale(): Locale {
  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE).split('-')[0] ?? '';
  return isLocale(resolved) ? resolved : DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(currentLocale);
  const [hasChosenLanguage, setHasChosenLanguage] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await getStoredLocale();
      if (!active) return;
      if (stored) {
        await i18n.changeLanguage(stored);
        applyDirection(stored);
        if (!active) return;
        setLocaleState(stored);
        setHasChosenLanguage(true);
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    await i18n.changeLanguage(next);
    applyDirection(next);
    await storeLocale(next);
    setLocaleState(next);
    setHasChosenLanguage(true);
  }, []);

  const value = useMemo(
    () => ({ ready, locale, hasChosenLanguage, setLocale }),
    [ready, locale, hasChosenLanguage, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider');
  return context;
}
