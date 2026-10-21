export interface User {
  /** Supabase auth user id (UUID). */
  id: string;
  username: string;
  email: string;
  isAnonymous?: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
