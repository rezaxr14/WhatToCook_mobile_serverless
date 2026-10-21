import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { User, AuthState } from '../types/auth';
import { authApi } from '../api/authApi';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastContext';

interface AuthContextValue extends AuthState {
  login: (credentials: { email: string; password: string }) => Promise<void>;
  signup: (payload: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  demoLogin: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { success, error, info } = useToast();

  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void refreshUser();
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshUser]);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      setIsLoading(true);
      try {
        const res = await authApi.login(credentials);
        setUser(res.user);
        setIsAuthenticated(true);
        success(`Welcome back, ${res.user.username}!`, 'Login Successful');
      } catch (err: any) {
        error(err.message || 'Login failed. Please check credentials.', 'Authentication Error');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [success, error],
  );

  const signup = useCallback(
    async (payload: { username: string; email: string; password: string }) => {
      setIsLoading(true);
      try {
        const res = await authApi.signup(payload);
        setUser(res.user);
        setIsAuthenticated(true);
        success(`Account created for ${res.user.username}!`, 'Welcome to WhatToCook');
      } catch (err: any) {
        error(err.message || 'Sign up failed.', 'Registration Error');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [success, error],
  );

  const demoLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authApi.demoLogin();
      setUser(res.user);
      setIsAuthenticated(true);
      success('Logged in with the pre-stocked demo pantry!', 'Demo Ready 🍳');
      return true;
    } catch (err: any) {
      error(err.message || 'Demo login failed.', 'Error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [success, error]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      setUser(null);
      setIsAuthenticated(false);
      info('You have been logged out.', 'Goodbye');
    } catch {
      error('Logout failed.', 'Error');
    }
  }, [info, error]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      signup,
      logout,
      demoLogin,
      refreshUser,
    }),
    [user, isAuthenticated, isLoading, login, signup, logout, demoLogin, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
