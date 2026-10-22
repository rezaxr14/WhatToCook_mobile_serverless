import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import i18n from '@/i18n';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAnonymous: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SignUpResult {
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: AuthUser | null;
  isConfigured: boolean;
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapUser(user: SupabaseUser): AuthUser {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? '';
  const username =
    (typeof metadata.username === 'string' && metadata.username) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    email.split('@')[0] ||
    'Guest';

  return {
    id: user.id,
    email,
    username,
    isAnonymous:
      Boolean((user as SupabaseUser & { is_anonymous?: boolean }).is_anonymous) || !email,
  };
}

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoGuestAttempted = useRef(false);

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        applySession(data.session);
        return;
      }

      // First launch: create an anonymous session so the app is usable
      // immediately. If anonymous auth is disabled, fall back to the auth screen.
      if (autoGuestAttempted.current) {
        applySession(null);
        return;
      }
      autoGuestAttempted.current = true;

      const { data: guest, error: guestError } = await supabase.auth.signInAnonymously({
        options: { data: { locale: i18n.resolvedLanguage ?? i18n.language ?? 'en' } },
      });
      if (!active) return;
      if (guestError || !guest.session) {
        setError(guestError ? friendlyError(guestError, '') : null);
        applySession(null);
        return;
      }
      applySession(guest.session);
    };

    void boot();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      // The initial null session is handled by `boot()`, which may create the
      // first-launch anonymous session.
      if (event === 'INITIAL_SESSION' && !next) return;
      applySession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      const message = friendlyError(signInError, 'Sign in failed.');
      setError(message);
      throw new Error(message);
    }
    applySession(data.session);
  }, [applySession]);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { locale: i18n.resolvedLanguage ?? i18n.language ?? 'en' },
      },
    });
    if (signUpError) {
      const message = friendlyError(signUpError, 'Sign up failed.');
      setError(message);
      throw new Error(message);
    }
    if (!data.session) return { needsEmailConfirmation: true };
    applySession(data.session);
    return { needsEmailConfirmation: false };
  }, [applySession]);

  const continueAsGuest = useCallback(async () => {
    setError(null);
    const { data, error: guestError } = await supabase.auth.signInAnonymously({
      options: { data: { locale: i18n.resolvedLanguage ?? i18n.language ?? 'en' } },
    });
    if (guestError || !data.session) {
      const message = friendlyError(guestError, 'Guest mode is unavailable right now.');
      setError(message);
      throw new Error(message);
    }
    applySession(data.session);
    // Stock the demo pantry. A failure here should not block guest sign-in.
    await supabase.rpc('seed_demo_data');
  }, [applySession]);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase.auth.signOut();
    applySession(null);
  }, [applySession]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ? mapUser(session.user) : null,
      isConfigured: isSupabaseConfigured,
      error,
      clearError,
      signIn,
      signUp,
      continueAsGuest,
      signOut,
    }),
    [status, session, error, clearError, signIn, signUp, continueAsGuest, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
