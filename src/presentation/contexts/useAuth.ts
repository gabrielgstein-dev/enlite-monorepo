import { useContext } from 'react';
import { AuthContext_Internal } from './AuthContext';
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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext_Internal);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
