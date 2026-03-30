import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { ENV } from './env';

const firebaseConfig = {
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  projectId: ENV.FIREBASE_PROJECT_ID,
  storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;

export function initializeFirebase(): void {
  if (!firebaseConfig.apiKey) {
    throw new Error('VITE_FIREBASE_API_KEY is required');
  }
  if (!firebaseConfig.projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is required');
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  // Conectar ao emulador se estiver em modo de teste
  if (ENV.IS_DEVELOPMENT && ENV.FIREBASE_AUTH_EMULATOR) {
    connectAuthEmulator(auth, ENV.FIREBASE_AUTH_EMULATOR);
    // Forçar localStorage para que Playwright storageState() capture os tokens
    // Isso só afeta dev/emulator — produção continua usando IndexedDB (mais seguro)
    void setPersistence(auth, browserLocalPersistence);
    console.log('[Firebase] Conectado ao Auth Emulator:', ENV.FIREBASE_AUTH_EMULATOR);
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    throw new Error('Firebase Auth not initialized. Call initializeFirebase() first.');
  }
  return auth;
}
