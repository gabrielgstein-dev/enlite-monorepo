import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const FIREBASE_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';

export function createApiClient(): AxiosInstance {
  return axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
}

/**
 * Obtém token de autenticação para testes.
 *
 * Se USE_FIREBASE_EMULATOR=true: emite JWT real via Firebase Auth Emulator
 * (mesmo fluxo de produção — zero MockAuth).
 *
 * Caso contrário: usa MockAuth (USE_MOCK_AUTH=true, via /api/test/auth/token).
 */
export async function getMockToken(
  api: AxiosInstance,
  opts: { uid: string; email: string; role?: string },
): Promise<string> {
  if (process.env.USE_FIREBASE_EMULATOR === 'true') {
    return getFirebaseEmulatorToken(opts);
  }
  const res = await api.post('/api/test/auth/token', {
    uid: opts.uid,
    email: opts.email,
    role: opts.role || 'worker',
  });
  if (res.status !== 200) throw new Error(`Mock token failed: ${JSON.stringify(res.data)}`);
  return res.data.data.token;
}

async function getFirebaseEmulatorToken(
  opts: { uid: string; email: string },
): Promise<string> {
  const base = `http://${FIREBASE_EMULATOR_HOST}`;
  const signUpUrl = `${base}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  const signInUrl = `${base}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;

  // Criar usuário (ignora erro se já existir)
  await axios.post(signUpUrl, {
    email: opts.email,
    password: 'enlite-e2e-password',
    returnSecureToken: false,
  }).catch(() => {});

  // Login para obter idToken JWT real
  const res = await axios.post(signInUrl, {
    email: opts.email,
    password: 'enlite-e2e-password',
    returnSecureToken: true,
  });

  if (!res.data?.idToken) {
    throw new Error(`Firebase emulator signIn failed: ${JSON.stringify(res.data)}`);
  }

  return res.data.idToken;
}

export async function waitForBackend(api: AxiosInstance, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await api.get('/health').catch(() => null);
    if (res?.status === 200) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Backend not ready');
}
