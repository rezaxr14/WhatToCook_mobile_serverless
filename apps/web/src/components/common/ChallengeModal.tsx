import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { completeChallenge, failChallenge, subscribeChallenge } from '../../lib/challenge';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: 'auto' | 'light' | 'dark';
      callback?: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile_load_failed'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Turnstile step-up for the AI gateway (plan 4.1). `aiApi` retries a rejected
 * request once after `verify-challenge` resets the adaptive counter.
 */
export const ChallengeModal: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? '';

  useEffect(() => subscribeChallenge(setOpen), []);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setVerifying(false);

    if (!isSupabaseConfigured || !siteKey) {
      const message = t('challenge.unavailable');
      setError(message);
      return;
    }

    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: 'ai_gate',
          theme: 'auto',
          callback: async (token) => {
            setVerifying(true);
            setError(null);
            const { error: verifyError } = await supabase.functions.invoke('verify-challenge', {
              body: { kind: 'turnstile', token },
            });
            if (verifyError) {
              setVerifying(false);
              setError(t('challenge.error'));
              if (widgetId.current) window.turnstile?.reset(widgetId.current);
              return;
            }
            completeChallenge();
          },
          'error-callback': () => setError(t('challenge.error')),
          'expired-callback': () => setError(t('challenge.error')),
        });
      })
      .catch(() => {
        if (!cancelled) setError(t('challenge.unavailable'));
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [open, siteKey, t]);

  if (!open) return null;

  const cancel = () => failChallenge(new Error(t('challenge.cancel')));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="challenge-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
      className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md"
    >
      <div className="relative w-full max-w-sm bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-5 pb-4">
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 id="challenge-title" className="font-extrabold text-sm text-stone-900">
              {t('challenge.title')}
            </h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed">{t('challenge.body')}</p>
          </div>
          <button
            type="button"
            onClick={cancel}
            aria-label={t('challenge.cancel')}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <div ref={containerRef} className="flex justify-center min-h-16" />
          {verifying && !error && (
            <p className="text-center text-xs font-semibold text-stone-500" role="status">
              {t('challenge.verifying')}
            </p>
          )}
          {error && (
            <p className="text-center text-xs font-semibold text-rose-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
