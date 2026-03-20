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
    
    // Send verification email with actionCodeSettings for Identity Platform
    const actionCodeSettings = {
      url: `${window.location.origin}/login?verified=true`,
      handleCodeInApp: true,
      // iOS and Android settings (optional, but helps with delivery)
      iOS: {
        bundleId: 'com.enlite.app'
      },
      android: {
        packageName: 'com.enlite.app',
        installApp: false,
        minimumVersion: '1'
      },
      // Dynamic link domain (if you have one configured)
      // dynamicLinkDomain: 'enlite.page.link'
    };
    
    try {
      await sendEmailVerification(credential.user, actionCodeSettings);
      console.log('[FirebaseAuthService] ✅ Email de verificação enviado para:', email);
      console.log('[FirebaseAuthService] Verifique sua caixa de entrada e spam');
    } catch (emailError) {
      console.error('[FirebaseAuthService] ❌ Erro ao enviar email de verificação:', emailError);
      console.error('[FirebaseAuthService] Detalhes do erro:', JSON.stringify(emailError, null, 2));
      // Don't block registration if email fails
    }
    
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
    
    // Limpar mock auth do localStorage
    if (typeof window !== 'undefined') {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.includes('firebase:authUser') || key?.includes('mock_auth')) {
          localStorage.removeItem(key);
        }
      }
    }
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    const auth = getFirebaseAuth();
    
    // Sempre registrar o listener real do Firebase primeiro
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      callback(firebaseUser ? this.mapFirebaseUser(firebaseUser) : null);
    });

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
                }
              }
            }
          } catch {
            // Ignorar erros de parse
          }
        }
      }
    }

    return unsubscribe;
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

  private mapFirebaseUser(firebaseUser: FirebaseUser, _roles: string[] = []): User {
    return {
      id: firebaseUser.uid,
      email: firebaseUser.email || '',
      name: firebaseUser.displayName || '',
      roles: _roles,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
