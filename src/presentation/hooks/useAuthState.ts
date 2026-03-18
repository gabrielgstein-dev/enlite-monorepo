import { useState, useEffect, useCallback } from 'react';
import { User } from '@domain/entities/User';
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authService] = useState(() => new FirebaseAuthService());

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [authService]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: newUser } = await authService.signInWithEmail(email, password);
      setUser(newUser);
    },
    [authService]
  );

  const loginWithGoogle = useCallback(async () => {
    const { user: newUser } = await authService.signInWithGoogle();
    setUser(newUser);
  }, [authService]);

  const register = useCallback(
    async (email: string, password: string) => {
      const { user: newUser } = await authService.signUpWithEmail(email, password);
      setUser(newUser);
    },
    [authService]
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, [authService]);

  return {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    loginWithGoogle,
    register,
    logout,
  };
}
