import { create } from 'zustand';
import { User } from '@domain/entities/User';
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';
import { WorkerApiService } from '@infrastructure/http/WorkerApiService';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authService: FirebaseAuthService;
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  authService: new FirebaseAuthService(),
  
  // Actions
  setUser: (user: User | null): void => set({ user, isAuthenticated: user !== null }),
  
  setLoading: (isLoading: boolean): void => set({ isLoading }),
  
  login: async (email: string, password: string): Promise<void> => {
    const { authService } = get();
    const { user } = await authService.signInWithEmail(email, password);
    set({ user, isAuthenticated: true });
  },
  
  loginWithGoogle: async (): Promise<void> => {
    const { authService } = get();
    const { user } = await authService.signInWithGoogle();
    set({ user, isAuthenticated: true });
    // Ensure worker record exists — idempotent, safe to call on every login.
    // Fire-and-forget: WorkerProfilePage retries if this fails.
    WorkerApiService.initWorker({ authUid: user.id, email: user.email }).catch(() => undefined);
  },

  register: async (email: string, password: string): Promise<void> => {
    const { authService } = get();
    const { user } = await authService.signUpWithEmail(email, password);
    set({ user, isAuthenticated: true });
    // Ensure worker record exists on fresh registration.
    WorkerApiService.initWorker({ authUid: user.id, email: user.email }).catch(() => undefined);
  },
  
  logout: async (): Promise<void> => {
    const { authService } = get();
    await authService.logout();
    set({ user: null, isAuthenticated: false });
  },
  
  initialize: (): (() => void) => {
    const { authService, setUser, setLoading } = get();
    
    const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    
    return unsubscribe;
  },
}));
