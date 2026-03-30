import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKER_AUTH_FILE = path.join(__dirname, '.auth', 'profile-worker.json');

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY = 'test-api-key';
// Must match VITE_FIREBASE_API_KEY so the Firebase SDK recognises the localStorage entry
const FRONTEND_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'TODO_FIREBASE_API_KEY';

setup('criar conta de worker para testes de perfil', async ({ page }) => {
  const email = `profile.e2e.${Date.now()}@enlite-test.com`;
  const password = 'TestProfile123!';

  // 1. Create user via REST in Firebase Auth Emulator (no UI dependency)
  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signUpData = await signUpRes.json();
  if (!signUpData.localId) {
    throw new Error(`Firebase sign-up failed: ${JSON.stringify(signUpData)}`);
  }
  const { localId: uid, idToken, refreshToken } = signUpData;

  // 2. Ensure .auth directory exists
  const authDir = path.dirname(WORKER_AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 3. Inject Firebase auth state into localStorage BEFORE navigating.
  //    The key format must match: firebase:authUser:{VITE_FIREBASE_API_KEY}:[DEFAULT]
  await page.addInitScript(
    ({ uid, email, idToken, refreshToken, apiKey }) => {
      const authKey = `firebase:authUser:${apiKey}:[DEFAULT]`;
      const authValue = JSON.stringify({
        uid,
        email,
        emailVerified: false,
        isAnonymous: false,
        providerData: [
          {
            providerId: 'password',
            uid: email,
            displayName: null,
            email,
            phoneNumber: null,
            photoURL: null,
          },
        ],
        stsTokenManager: {
          refreshToken,
          accessToken: idToken,
          expirationTime: Date.now() + 3_600_000,
        },
        createdAt: String(Date.now()),
        lastLoginAt: String(Date.now()),
        apiKey,
        appName: '[DEFAULT]',
      });
      localStorage.setItem(authKey, authValue);
    },
    { uid, email, idToken, refreshToken, apiKey: FRONTEND_API_KEY },
  );

  // 4. Navigate to verify auth is picked up (should NOT redirect to /login)
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

  // 5. Save storageState (now contains localStorage with Firebase auth)
  await page.context().storageState({ path: WORKER_AUTH_FILE });
});
