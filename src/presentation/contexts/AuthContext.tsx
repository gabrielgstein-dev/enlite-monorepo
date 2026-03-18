import { createContext, ReactNode } from 'react';
import { User } from '@domain/entities/User';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthContext_Internal = AuthContext;

interface AuthProviderProps {
  children: ReactNode;
  value: AuthContextValue;
}

export function AuthProvider({ children, value }: AuthProviderProps) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
