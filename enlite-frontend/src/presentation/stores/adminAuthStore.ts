import { create } from 'zustand';
import { User } from '@domain/entities/User';
import { AdminUser } from '@domain/entities/AdminUser';
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

interface AdminAuthState {
  user: User | null;
  adminProfile: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;

  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  initialize: () => () => void;
}

const authService = new FirebaseAuthService();

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  user: null,
  adminProfile: null,
  isLoading: true,
  isAuthenticated: false,
  mustChangePassword: false,

  setUser: (user: User | null): void => set({ user, isAuthenticated: user !== null }),

  setLoading: (isLoading: boolean): void => set({ isLoading }),

  login: async (email: string, password: string): Promise<void> => {
    const { user } = await authService.signInWithEmail(email, password);
    set({ user, isAuthenticated: true });

    // Fetch admin profile to check mustChangePassword
    try {
      const profile = await AdminApiService.getProfile();
      set({ adminProfile: profile, mustChangePassword: profile.mustChangePassword });
    } catch {
      // If profile fetch fails, user might not be admin
      set({ adminProfile: null, mustChangePassword: false });
    }
  },

  loginWithGoogle: async (): Promise<void> => {
    const { user } = await authService.signInWithGoogle();

    if (!user.email?.endsWith('@enlite.health')) {
      await authService.logout();
      throw new Error('admin.login.unauthorizedDomain');
    }

    set({ user, isAuthenticated: true });

    try {
      const profile = await AdminApiService.getProfile();
      set({ adminProfile: profile, mustChangePassword: profile.mustChangePassword });

      // Force refresh token to pick up custom claims set by backend auto-provisioning
      await authService.forceRefreshToken();
    } catch {
      set({ adminProfile: null, mustChangePassword: false });
    }
  },

  logout: async (): Promise<void> => {
    await authService.logout();
    set({ user: null, isAuthenticated: false, adminProfile: null, mustChangePassword: false });
  },

  fetchProfile: async (): Promise<void> => {
    try {
      const profile = await AdminApiService.getProfile();
      set({ adminProfile: profile, mustChangePassword: profile.mustChangePassword });
    } catch {
      set({ adminProfile: null });
    }
  },

  initialize: (): (() => void) => {
    const { setUser, setLoading } = get();

    const unsubscribe = authService.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profile = await AdminApiService.getProfile();
          set({ adminProfile: profile, mustChangePassword: profile.mustChangePassword });
        } catch {
          set({ adminProfile: null, mustChangePassword: false });
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  },
}));
