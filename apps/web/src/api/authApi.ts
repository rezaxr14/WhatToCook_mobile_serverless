import type { User as SupabaseUser } from '@supabase/supabase-js';
import i18n from '../i18n';
import { ApiError, toApiError } from './client';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { User } from '../types/auth';
import type { UserPantry } from '../types/pantry';

export interface AuthResponse {
  message?: string;
  user: User;
  pantry?: UserPantry;
}

export interface MeResponse {
  authenticated: boolean;
  user: User | null;
  pantry: UserPantry | null;
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new ApiError(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.local.',
      503,
      null,
      'supabase_not_configured',
    );
  }
}

async function mapUser(authUser: SupabaseUser): Promise<User> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, locale')
    .eq('id', authUser.id)
    .maybeSingle();

  const metadata = authUser.user_metadata ?? {};
  const email = authUser.email ?? '';
  const username =
    profile?.username ||
    (typeof metadata.username === 'string' ? metadata.username : '') ||
    (typeof metadata.name === 'string' ? metadata.name : '') ||
    email.split('@')[0] ||
    'Guest';

  return {
    id: authUser.id,
    username,
    email,
    isAnonymous: Boolean((authUser as SupabaseUser & { is_anonymous?: boolean }).is_anonymous),
  };
}

export const authApi = {
  login: async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
    assertConfigured();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (error) throw toApiError(error, 'Login failed. Please check your email and password.');
    if (!data.user) throw new ApiError('Login failed.', 401);
    return { user: await mapUser(data.user), message: 'Logged in' };
  },

  signup: async (payload: {
    username: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> => {
    assertConfigured();
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          username: payload.username,
          locale: i18n.resolvedLanguage || i18n.language || 'en',
        },
      },
    });
    if (error) throw toApiError(error, 'Sign up failed.');

    if (!data.session || !data.user) {
      throw new ApiError(
        'Account created. Check your email to confirm it, then sign in.',
        202,
        null,
        'email_confirmation_required',
      );
    }

    return { user: await mapUser(data.user), message: 'Account created' };
  },

  logout: async (): Promise<{ message: string }> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw toApiError(error, 'Logout failed.');
    return { message: 'Logged out' };
  },

  getMe: async (): Promise<MeResponse> => {
    if (!isSupabaseConfigured) {
      return { authenticated: false, user: null, pantry: null };
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { authenticated: false, user: null, pantry: null };
    }

    return {
      authenticated: true,
      user: await mapUser(data.user),
      pantry: null,
    };
  },

  demoLogin: async (): Promise<AuthResponse> => {
    assertConfigured();

    const { data: sessionData } = await supabase.auth.getSession();
    let authUser = sessionData.session?.user ?? null;

    if (!authUser) {
      const { data, error } = await supabase.auth.signInAnonymously({
        options: {
          data: { locale: i18n.resolvedLanguage || i18n.language || 'en' },
        },
      });
      if (error) throw toApiError(error, 'Guest demo is unavailable right now.');
      authUser = data.user;
    }

    if (!authUser) throw new ApiError('Guest demo could not create a session.', 500);

    const { error: seedError } = await supabase.rpc('seed_demo_data');
    if (seedError) throw toApiError(seedError, 'Could not stock the demo pantry.');

    return {
      user: await mapUser(authUser),
      message: 'Demo pantry ready',
    };
  },
};
