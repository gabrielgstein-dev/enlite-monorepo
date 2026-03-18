import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  getIdToken,
  sendEmailVerification,
} from 'firebase/auth';
import { getFirebaseAuth } from '../config/firebase';
import { User } from '@domain/entities/User';

// Interface para mock auth state (usado em testes E2E)
interface MockAuthState {
  uid: string;
  email: string;
  displayName?: string;
  roles?: string[];
  emailVerified?: boolean;
  stsTokenManager?: {
    accessToken: string;
    expirationTime: number;
  };
}

export class FirebaseAuthService {
  private readonly googleProvider: GoogleAuthProvider;
  private mockAuthState: MockAuthState | null = null;

  constructor() {
    this.googleProvider = new GoogleAuthProvider();
    this.googleProvider.addScope('email');
    this.googleProvider.addScope('profile');
    
    // Verificar se há mock auth state no localStorage (para testes E2E)
    this.checkForMockAuth();
  }

  /**
   * Verifica se há mock auth no localStorage (modo teste E2E)
   */
  private checkForMockAuth(): void {
    if (typeof window === 'undefined') return;
    
    // Procurar por mock auth state em qualquer chave do localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('firebase:authUser') || key?.includes('mock_auth')) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            // Verificar se é um auth state válido
            if (parsed.uid && parsed.email) {
              // Verificar se não expirou
              const expTime = parsed.stsTokenManager?.expirationTime;
              if (!expTime || expTime > Date.now()) {
                this.mockAuthState = parsed as MockAuthState;
                console.log('[FirebaseAuthService] Mock auth detectado para:', parsed.email);
                break;
              }
            }
          }
        } catch {
          // Ignorar erros de parse
        }
      }
    }
  }

  /**
   * Converte mock auth state para User
   */
  private mapMockAuthToUser(mockState: MockAuthState): User {
    return {
      id: mockState.uid,
      email: mockState.email,
      name: mockState.displayName || mockState.email.split('@')[0],
      roles: mockState.roles || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async signInWithEmail(email: string, password: string): Promise<{ user: User; idToken: string }> {
    const auth = getFirebaseAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await getIdToken(credential.user);
    return {
      user: this.mapFirebaseUser(credential.user),
      idToken,
    };
  }

  async signUpWithEmail(email: string, password: string): Promise<{ user: User; idToken: string }> {
    const auth = getFirebaseAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Send verification email but don't block login (lazy start)
    await sendEmailVerification(credential.user);
    
    const idToken = await getIdToken(credential.user);
    return {
      user: this.mapFirebaseUser(credential.user),
      idToken,
    };
  }

  async signInWithGoogle(): Promise<{ user: User; idToken: string }> {
    const auth = getFirebaseAuth();
    const credential = await signInWithPopup(auth, this.googleProvider);
    const idToken = await getIdToken(credential.user);
    return {
      user: this.mapFirebaseUser(credential.user),
      idToken,
    };
  }

  async logout(): Promise<void> {
    const auth = getFirebaseAuth();
    await signOut(auth);
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    // Verificar mock auth dinamicamente (para testes E2E)
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.includes('firebase:authUser')) {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              const parsed = JSON.parse(value);
              if (parsed.uid && parsed.email) {
                const expTime = parsed.stsTokenManager?.expirationTime;
                if (!expTime || expTime > Date.now()) {
                  console.log('[FirebaseAuthService] Mock auth detectado para:', parsed.email);
                  callback(this.mapMockAuthToUser(parsed));
                  return () => {};
                }
              }
            }
          } catch {
            // Ignorar
          }
        }
      }
    }

    // Caso contrário, usar Firebase normalmente
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (firebaseUser) => {
      callback(firebaseUser ? this.mapFirebaseUser(firebaseUser) : null);
    });
  }

  async getCurrentUser(): Promise<User | null> {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }
    return this.mapFirebaseUser(currentUser);
  }

  async getIdToken(): Promise<string | null> {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }
    return getIdToken(currentUser);
  }

  private mapFirebaseUser(firebaseUser: FirebaseUser, roles: string[] = []): User {
    return {
      id: firebaseUser.uid,
      email: firebaseUser.email || '',
      name: firebaseUser.displayName || '',
      roles,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
