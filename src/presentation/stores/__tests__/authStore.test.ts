import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAuthStore } from '@presentation/stores/authStore';
import { User } from '@domain/entities/User';

// Simple mock for FirebaseAuthService
vi.mock('@infrastructure/services/FirebaseAuthService', () => {
  return {
    FirebaseAuthService: class MockFirebaseAuthService {
      signInWithEmail = vi.fn();
      signInWithGoogle = vi.fn();
      signUpWithEmail = vi.fn();
      logout = vi.fn();
      onAuthStateChanged = vi.fn();
    },
  };
});

const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'test-id',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['worker'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      isLoading: true,
    });
  });

  describe('initial state', () => {
    it('should start with null user', () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should start with isLoading true', () => {
      expect(useAuthStore.getState().isLoading).toBe(true);
    });

    it('should have authService instance', () => {
      expect(useAuthStore.getState().authService).toBeDefined();
    });
  });

  describe('computed: isAuthenticated', () => {
    it('should return false when user is null', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should return true when user is set', () => {
      act(() => {
        useAuthStore.getState().setUser(createMockUser());
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should return false after logout', () => {
      act(() => {
        useAuthStore.getState().setUser(createMockUser());
        useAuthStore.getState().setUser(null);
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('action: setUser', () => {
    it('should set user', () => {
      const user = createMockUser();

      act(() => {
        useAuthStore.getState().setUser(user);
      });

      expect(useAuthStore.getState().user).toEqual(user);
    });

    it('should allow setting user to null', () => {
      act(() => {
        useAuthStore.getState().setUser(createMockUser());
        useAuthStore.getState().setUser(null);
      });

      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('action: setLoading', () => {
    it('should set loading state', () => {
      act(() => {
        useAuthStore.getState().setLoading(false);
      });

      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should toggle loading state', () => {
      act(() => {
        useAuthStore.getState().setLoading(false);
        useAuthStore.getState().setLoading(true);
      });

      expect(useAuthStore.getState().isLoading).toBe(true);
    });
  });

  describe('async actions integration', () => {
    it('login flow should update user', async () => {
      const mockUser = createMockUser();
      const { authService } = useAuthStore.getState();
      
      authService.signInWithEmail.mockResolvedValue({
        user: mockUser,
        idToken: 'token123',
      });

      await act(async () => {
        await useAuthStore.getState().login('test@test.com', 'password');
      });

      expect(authService.signInWithEmail).toHaveBeenCalledWith('test@test.com', 'password');
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('loginWithGoogle flow should update user', async () => {
      const mockUser = createMockUser();
      const { authService } = useAuthStore.getState();
      
      authService.signInWithGoogle.mockResolvedValue({
        user: mockUser,
        idToken: 'google-token',
      });

      await act(async () => {
        await useAuthStore.getState().loginWithGoogle();
      });

      expect(authService.signInWithGoogle).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('register flow should update user', async () => {
      const mockUser = createMockUser();
      const { authService } = useAuthStore.getState();
      
      authService.signUpWithEmail.mockResolvedValue({
        user: mockUser,
        idToken: 'new-token',
      });

      await act(async () => {
        await useAuthStore.getState().register('new@test.com', 'password');
      });

      expect(authService.signUpWithEmail).toHaveBeenCalledWith('new@test.com', 'password');
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('logout should clear user', async () => {
      const { authService } = useAuthStore.getState();
      authService.logout.mockResolvedValue(undefined);

      // Set user first
      act(() => {
        useAuthStore.getState().setUser(createMockUser());
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(authService.logout).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('login errors should propagate', async () => {
      const { authService } = useAuthStore.getState();
      authService.signInWithEmail.mockRejectedValue(new Error('Auth failed'));

      await expect(
        useAuthStore.getState().login('test@test.com', 'wrong')
      ).rejects.toThrow('Auth failed');
    });

    it('register errors should propagate', async () => {
      const { authService } = useAuthStore.getState();
      authService.signUpWithEmail.mockRejectedValue(new Error('Email exists'));

      await expect(
        useAuthStore.getState().register('exists@test.com', 'password')
      ).rejects.toThrow('Email exists');
    });
  });

  describe('initialize auth listener', () => {
    it('should setup auth listener and return unsubscribe', () => {
      const { authService } = useAuthStore.getState();
      authService.onAuthStateChanged.mockReturnValue(() => {});

      const unsubscribe = useAuthStore.getState().initialize();

      expect(authService.onAuthStateChanged).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should update state when auth changes', () => {
      const mockUser = createMockUser();
      const { authService } = useAuthStore.getState();

      let callback: ((user: User | null) => void) | null = null;
      authService.onAuthStateChanged.mockImplementation((cb) => {
        callback = cb;
        return () => {};
      });

      useAuthStore.getState().initialize();

      act(() => {
        callback?.(mockUser);
      });

      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should handle sign out in auth listener', () => {
      const { authService } = useAuthStore.getState();

      let callback: ((user: User | null) => void) | null = null;
      authService.onAuthStateChanged.mockImplementation((cb) => {
        callback = cb;
        return () => {};
      });

      // Set initial user
      act(() => {
        useAuthStore.getState().setUser(createMockUser());
      });

      useAuthStore.getState().initialize();

      act(() => {
        callback?.(null);
      });

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('state selectors', () => {
    it('should select user with getState', () => {
      const user = createMockUser();
      
      act(() => {
        useAuthStore.setState({ user });
      });

      const selected = useAuthStore.getState().user;
      expect(selected?.id).toBe(user.id);
      expect(selected?.email).toBe(user.email);
    });

    it('should compute isAuthenticated based on user', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      act(() => {
        useAuthStore.setState({ user: createMockUser(), isAuthenticated: true });
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });
});
