# Roadmap — Fix Playwright Auth Persistence (83 testes bloqueados)

> **Criado em:** 2026-03-30
> **Prioridade:** ALTA — 83 de 157 testes Chromium estao "did not run"
> **Estimativa:** Pequena (1 arquivo de setup + config)

---

## Problema

O `auth.setup.ts` registra um worker via UI e salva o estado com `page.context().storageState()`. O Playwright `storageState()` captura **cookies + localStorage**, mas o Firebase Auth SDK v9+ persiste tokens no **IndexedDB** por padrao. Resultado: o arquivo `e2e/.auth/profile-worker.json` fica vazio (`{ "cookies": [], "origins": [] }`) e os 83 testes que dependem dele sao skippados.

### Estado atual

```
auth.setup.ts
  1. Navega para /register
  2. Preenche form + clica "Registrarse"
  3. Firebase SDK cria conta no Auth Emulator
  4. Firebase SDK salva tokens no IndexedDB (NAO no localStorage)
  5. storageState() captura localStorage vazio -> profile-worker.json vazio
  6. Testes que usam storageState: 'e2e/.auth/profile-worker.json' nao tem auth -> "did not run"
```

### Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `e2e/auth.setup.ts` | Cria a conta e salva storageState |
| `playwright.config.ts` | Define `storageState` como dependencia para chromium/firefox/webkit |
| `src/infrastructure/config/firebase.ts` | Inicializa Firebase Auth (sem `setPersistence`) |

---

## Solucao Recomendada: Injecao de token via REST + addInitScript

Em vez de depender da UI para registrar e capturar o estado, a abordagem e:

1. **Criar user via REST** no Firebase Auth Emulator (como os testes admin ja fazem)
2. **Obter o idToken** da resposta de signup
3. **Injetar o token no browser** via `page.addInitScript` ou `page.evaluate` antes de navegar

### Implementacao

#### Passo 1 — Novo `auth.setup.ts`

```typescript
import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORKER_AUTH_FILE = path.join(__dirname, '.auth', 'profile-worker.json');

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY = 'test-api-key';
const API_URL = 'http://localhost:8080';

setup('criar conta de worker para testes de perfil', async ({ page }) => {
  const email = `profile.e2e.${Date.now()}@enlite-test.com`;
  const password = 'TestProfile123!';

  // 1. Criar user via REST no Firebase Emulator
  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const { localId: uid, idToken, refreshToken } = await signUpRes.json();

  // 2. Inicializar worker no backend (simula o que o frontend faz pos-registro)
  await fetch(`${API_URL}/api/workers/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, email }),
  });

  // 3. Injetar auth state no localStorage ANTES de navegar
  //    O Firebase SDK com connectAuthEmulator le do IndexedDB,
  //    mas podemos forcar localStorage persistence via script injection.
  await page.addInitScript(({ uid, email, idToken, refreshToken }) => {
    // Firebase Auth SDK armazena neste formato no IndexedDB.
    // Alternativa: popular localStorage com o formato que o SDK espera.
    const authKey = `firebase:authUser:TODO_FIREBASE_API_KEY:[DEFAULT]`;
    const authValue = JSON.stringify({
      uid,
      email,
      emailVerified: false,
      spiVersion: 'firebase-auth/latest',
      spiProvider: 'password',
      appName: '[DEFAULT]',
      apiKey: 'TODO_FIREBASE_API_KEY',
      stsTokenManager: {
        refreshToken,
        accessToken: idToken,
        expirationTime: Date.now() + 3600000,
      },
    });
    localStorage.setItem(authKey, authValue);
  }, { uid, email, idToken, refreshToken });

  // 4. Navegar para verificar que o auth funciona
  await page.goto('/');
  // Se o worker foi criado e o token injetado, a pagina deve carregar sem redirect para /login

  // 5. Salvar storageState (agora com localStorage populado)
  await page.context().storageState({ path: WORKER_AUTH_FILE });
});
```

#### Passo 2 — Forcar `browserLocalPersistence` no Firebase SDK (alternativa mais limpa)

Modificar `src/infrastructure/config/firebase.ts` para usar `localStorage` em vez de IndexedDB quando conectado ao emulator:

```typescript
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth, Auth, connectAuthEmulator,
  setPersistence, browserLocalPersistence,
} from 'firebase/auth';
import { ENV } from './env';

// ... (firebaseConfig igual)

export function initializeFirebase(): void {
  // ... (validacoes iguais)

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  if (ENV.IS_DEVELOPMENT && ENV.FIREBASE_AUTH_EMULATOR) {
    connectAuthEmulator(auth, ENV.FIREBASE_AUTH_EMULATOR);
    // Forcar localStorage para que Playwright storageState() capture os tokens
    setPersistence(auth, browserLocalPersistence);
    console.log('[Firebase] Conectado ao Auth Emulator:', ENV.FIREBASE_AUTH_EMULATOR);
  }
}
```

> **IMPORTANTE:** `setPersistence(auth, browserLocalPersistence)` faz o SDK salvar tokens no `localStorage` em vez do `IndexedDB`. Isso so deve ser feito no ambiente de desenvolvimento/emulator — em producao o padrao (IndexedDB) e mais seguro.

#### Passo 3 — Verificar e ajustar `playwright.config.ts`

Nenhuma mudanca necessaria no config — a estrutura de `storageState` e `dependencies` ja esta correta. O problema e apenas que o state salvo estava vazio.

---

## Opcoes alternativas (caso a solucao principal nao funcione)

### Opcao B — Mock de auth via `page.route` (sem Firebase real)

Criar um `workerAuthFixture` que mocka todas as chamadas de auth:

```typescript
// e2e/fixtures/worker-auth.ts
import { test as base, Page } from '@playwright/test';

async function mockWorkerAuth(page: Page) {
  const uid = `e2e-worker-${Date.now()}`;
  const email = `${uid}@test.com`;
  const token = `mock-token-${uid}`;

  // Mock Firebase Auth state no frontend
  await page.addInitScript(({ uid, email, token }) => {
    // Simula o estado de auth que o useAuthStore espera
    window.__E2E_AUTH__ = { uid, email, token };
  }, { uid, email, token });

  // Mock API calls que verificam auth
  await page.route('**/api/workers/me', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true, data: { id: uid, email, status: 'in_progress' } }),
    })
  );
}
```

### Opcao C — Shared global setup com `page.evaluate` pos-login

Fazer o registro real via UI (como hoje) e depois extrair os tokens do IndexedDB:

```typescript
// Apos registro via UI, extrair token do IndexedDB
const authData = await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  const firebaseDb = dbs.find(db => db.name?.includes('firebase'));
  if (!firebaseDb?.name) return null;

  return new Promise((resolve) => {
    const req = indexedDB.open(firebaseDb.name!);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('firebaseLocalStorageDb', 'readonly');
      const store = tx.objectStore('firebaseLocalStorageDb');
      const getReq = store.getAll();
      getReq.onsuccess = () => resolve(getReq.result);
    };
  });
});

// Popular localStorage com os dados extraidos
await page.evaluate((data) => {
  if (data) {
    for (const item of data) {
      localStorage.setItem(item.fbase_key, JSON.stringify(item.value));
    }
  }
}, authData);

// Agora storageState() vai capturar os tokens
await page.context().storageState({ path: WORKER_AUTH_FILE });
```

---

## Criterios de aceite

- [ ] `e2e/.auth/profile-worker.json` contem dados de auth apos `auth.setup.ts` rodar
- [ ] Os 83 testes que dependem de `storageState` passam de "did not run" para "passed" ou "failed" (com erros reais, nao auth)
- [ ] Worker registration flow continua funcionando nos testes E2E
- [ ] Nenhuma mudanca em producao — `setPersistence` so no modo emulator/dev
- [ ] Testes admin (que usam `seedAdminAndLogin`) nao sao afetados

---

## Decisao recomendada

**Passo 2 (setPersistence)** e a solucao mais limpa:
- 1 linha de codigo no `firebase.ts`
- Zero mudanca no `auth.setup.ts` (o registro via UI continua igual)
- O `storageState()` passa a capturar os tokens automaticamente
- So afeta modo dev/emulator — producao usa o padrao (IndexedDB)

Se `setPersistence` nao resolver (ex: o SDK ignora em modo emulator), usar **Opcao C** como fallback — extrair IndexedDB e popular localStorage.
