# Roadmap: 100% de Cobertura E2E — Formulário de Perfil

> **Objetivo:** garantir que todas as funcionalidades das 4 abas do perfil do worker
> (`Información General`, `Dirección de Atención`, `Disponibilidad`, `Documentos`) sejam
> exercitadas por testes E2E antes de chegar em produção.
>
> **Ponto de partida:** `e2e/worker-profile-tabs.e2e.ts` com 84 testes existentes.
> Gaps identificados na análise pós-criação.

---

## Visão geral das fases

| Fase | O que entrega | Impacto | Pré-requisito | Status |
|---|---|---|---|---|
| 1 | Infraestrutura de auth isolada | Elimina falha em cascata | — | ⬜ Pendente |
| 2 | `data-testid` nos componentes customizados | Seletores estáveis | — | ⬜ Pendente |
| 3 | Validações ausentes em espanhol | +7 testes isolados | Fase 2 | ⬜ Pendente |
| 4 | Google Places mockado no browser | Cobre happy-path de endereço | Fase 2 | ⬜ Pendente |
| 5 | Upload de documentos | Cobre fluxo de 4 etapas | Fase 2 | ⬜ Pendente |
| 6 | Upload de foto de perfil | Cobre compressão e preview | Fase 2 | ⬜ Pendente |
| 7 | Edge cases e campos secundários | Fecha gaps restantes | Fases 3–6 | ⬜ Pendente |

---

## Fase 1 — Infraestrutura de autenticação isolada

> **Por que primeiro:** o `beforeAll` atual registra um único worker para toda a suite.
> Se o Firebase falhar ou a conta já existir, **todos os 84 testes falham em cascata**
> sem diagnóstico claro. Isolar o setup em um projeto Playwright separado garante que
> falhas de auth não contaminem falhas de feature.

### Problema atual

```typescript
// worker-profile-tabs.e2e.ts
test.beforeAll(async ({ browser }) => {
  // Se isso falhar, TODOS os 84 testes falham com "storageState file not found"
  // sem indicar qual funcionalidade quebrou
  await registerWorker(page, email, BASE_PASSWORD);
  await context.storageState({ path: AUTH_STATE });
});
```

### Solução: setup project no `playwright.config.ts`

#### 1.1 — Criar arquivo de setup de autenticação

**Arquivo novo:** `e2e/auth.setup.ts`

```typescript
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

export const WORKER_AUTH_FILE = path.join(__dirname, '.auth', 'profile-worker.json');

setup('criar conta de worker para testes de perfil', async ({ page }) => {
  const email = `profile.e2e.${Date.now()}@enlite-test.com`;
  const password = 'TestProfile123!';

  await page.goto('/register');
  await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByText('Acepto recibir comunicaciones').click();
  await page.getByText('Registrarse').click();
  await expect(page).toHaveURL('/', { timeout: 15_000 });

  await page.context().storageState({ path: WORKER_AUTH_FILE });
});
```

#### 1.2 — Registrar o setup project no `playwright.config.ts`

**Arquivo:** `playwright.config.ts`

```typescript
// Antes:
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // ...
});

// Depois:
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',

  projects: [
    // Projeto de setup — roda antes de todos os outros
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },

    // Testes de perfil dependem do setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/profile-worker.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/profile-worker.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/profile-worker.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

#### 1.3 — Remover `beforeAll` de auth do arquivo de testes

```typescript
// Remover de worker-profile-tabs.e2e.ts:
test.beforeAll(async ({ browser }) => {        // ← remover
  fs.mkdirSync(path.dirname(AUTH_STATE), ...); // ← remover
  const context = await browser.newContext();  // ← remover
  await registerWorker(page, email, ...);      // ← remover
  await context.storageState({ path: ... });   // ← remover
  await context.close();                       // ← remover
});                                            // ← remover

test.use({ storageState: AUTH_STATE });        // ← remover (agora no config)
```

### Critério de aceite da Fase 1

- [ ] Falha no setup de auth resulta em `"setup" project failed` — não contamina resultados de feature
- [ ] `worker-profile-tabs.e2e.ts` não tem mais `beforeAll` nem `test.use({ storageState })`
- [ ] `npm run test:e2e` passa com os 84 testes existentes após a mudança
- [ ] `.auth/profile-worker.json` está no `.gitignore`

---

## Fase 2 — `data-testid` nos componentes customizados

> **Por que antes das outras fases:** os seletores atuais usam XPath e class names
> Tailwind para encontrar `MultiSelect` e `GooglePlacesAutocomplete`. Se o design
> system mudar (reordenação de classes, wrapping em novo elemento), **os testes
> silenciosamente param de clicar onde devem**. `data-testid` é imune a isso.

### Problema atual

```typescript
// Frágil — quebra se a estrutura DOM ou classes Tailwind mudarem
const container = page
  .locator('label')
  .filter({ hasText: 'Idiomas' })
  .locator('xpath=..')                            // ← depende da hierarquia DOM exata
  .locator('div[class*="relative"]')              // ← depende de "relative" estar na classe
  .locator('div[class*="h-12"]')                  // ← depende de "h-12" estar na classe
  .first();
```

### 2.1 — Adicionar `data-testid` no `MultiSelect`

**Arquivo:** `src/presentation/components/molecules/MultiSelect.tsx`

```tsx
// Props adicionais (não quebrando a interface existente)
interface MultiSelectProps {
  // ...props existentes...
  testId?: string; // ← adicionar
}

// No JSX — trigger
<div
  onClick={() => setIsOpen(!isOpen)}
  data-testid={testId ? `${testId}-trigger` : undefined}  // ← adicionar
  className="flex items-center h-12 px-4 ..."
>

// No JSX — dropdown
{isOpen && (
  <div
    data-testid={testId ? `${testId}-dropdown` : undefined} // ← adicionar
    className="absolute z-50 ..."
  >
```

#### Passar `testId` nas instâncias de `MultiSelect` em `GeneralInfoTab.tsx`

```tsx
// Idiomas
<MultiSelect
  testId="languages"            // ← adicionar
  label={t('...')}
  // ...
/>

// Tipos de experiência
<MultiSelect
  testId="experience-types"     // ← adicionar
  label={t('...')}
  // ...
/>

// Tipos preferidos
<MultiSelect
  testId="preferred-types"      // ← adicionar
  label={t('...')}
  // ...
/>
```

### 2.2 — Adicionar `data-testid` no `GooglePlacesAutocomplete`

**Arquivo:** `src/presentation/components/molecules/GooglePlacesAutocomplete.tsx`
(verificar nome real do arquivo com `Glob`)

```tsx
// No input de texto
<input
  data-testid="address-autocomplete-input"   // ← adicionar
  // ...
/>

// Em cada sugestão do dropdown
<div
  data-testid={`address-suggestion-${index}`} // ← adicionar
  // ...
>
  {suggestion.description}
</div>
```

### 2.3 — Atualizar o helper `selectInMultiSelect` no arquivo de testes

```typescript
// Antes (frágil):
async function selectInMultiSelect(page, labelText, optionLabel) {
  const container = page.locator('label').filter({ hasText: labelText }).locator('xpath=..');
  await container.locator('div[class*="relative"]').locator('div[class*="h-12"]').first().click();
  await container.locator('div[class*="absolute"]').getByText(optionLabel, { exact: true }).click();
}

// Depois (estável):
async function selectInMultiSelect(page, testId, optionLabel) {
  await page.locator(`[data-testid="${testId}-trigger"]`).click();
  await page.locator(`[data-testid="${testId}-dropdown"]`).getByText(optionLabel, { exact: true }).click();
}

// Uso:
await selectInMultiSelect(page, 'languages', 'Español');
await selectInMultiSelect(page, 'experience-types', 'Adultos mayores');
await selectInMultiSelect(page, 'preferred-types', 'Adultos mayores');
```

### Critério de aceite da Fase 2

- [ ] `MultiSelect` tem `data-testid` quando `testId` prop é passada
- [ ] `GooglePlacesAutocomplete` tem `data-testid` no input e nas sugestões
- [ ] Helper `selectInMultiSelect` usa `data-testid` — sem mais XPath ou `class*`
- [ ] Os 84 testes existentes continuam passando após a mudança

---

## Fase 3 — Validações ausentes em espanhol (7 testes)

> **Situação atual:** 6 mensagens de validação têm testes isolados. 7 não têm.
> Sem testes isolados, uma regressão na tradução ou no schema Zod passa despercebida.

### Gap atual

| Mensagem | Chave `es.json` | Motivo do gap |
|---|---|---|
| `"Teléfono inválido"` | `phoneInvalid` | `PhoneInputIntl` externo — não testamos input inválido |
| `"Por favor, seleccione el sexo"` | `selectSex` | Testado só em conjunto com outros erros |
| `"Por favor, seleccione el género"` | `selectGender` | Idem |
| `"La fecha de nacimiento es obligatoria"` | `birthDateRequired` | Submit com `birthDate` vazio não testado |
| `"Por favor, seleccione la profesión"` | `selectProfession` | Deselect de profissão não testado |

> **Nota sobre `emailInvalid`:** o campo email é `readonly` no formulário de perfil —
> o usuário nunca consegue inserir um email inválido. A mensagem não é alcançável por
> design. Não precisa de teste.

### 3.1 — Testes a adicionar

**Adicionar no bloco `Validações — mensagens exatas em espanhol`:**

```typescript
test('telefone inválido (< 10 dígitos) → "Teléfono inválido"', async ({ page }) => {
  // PhoneInputIntl renderiza <input type="tel">
  const phoneInput = page.locator('input[type="tel"]').first();
  await phoneInput.fill('+1234'); // número curto demais
  await phoneInput.blur();
  await expect(page.getByText(MSG.phoneInvalid)).toBeVisible({ timeout: 2_000 });
});

test('sexo não selecionado → "Por favor, seleccione el sexo"', async ({ page }) => {
  // Seleciona e volta para o placeholder vazio
  await page.selectOption('#sex', 'male');
  await page.selectOption('#sex', '');
  await page.locator('#sex').blur();
  await expect(page.getByText(MSG.selectSex)).toBeVisible();
});

test('gênero não selecionado → "Por favor, seleccione el género"', async ({ page }) => {
  await page.selectOption('#gender', 'male');
  await page.selectOption('#gender', '');
  await page.locator('#gender').blur();
  await expect(page.getByText(MSG.selectGender)).toBeVisible();
});

test('data de nascimento vazia ao submeter → "La fecha de nacimiento es obligatoria"', async ({ page }) => {
  // Garante que birthDate está vazio
  await page.locator('#birthDate').fill('');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(MSG.birthDateRequired)).toBeVisible({ timeout: 3_000 });
});

test('profissão não selecionada → "Por favor, seleccione la profesión"', async ({ page }) => {
  await page.selectOption('#profession', 'caregiver');
  await page.selectOption('#profession', '');
  await page.locator('#profession').blur();
  await expect(page.getByText(MSG.selectProfession)).toBeVisible();
});
```

### Critério de aceite da Fase 3

- [ ] 5 novos testes adicionados ao bloco de validações
- [ ] Cada teste isola **uma única mensagem** de validação
- [ ] Nenhum teste depende de outros campos estarem preenchidos para disparar o erro

---

## Fase 4 — Google Places mockado no browser

> **Situação atual:** o happy-path da aba `Dirección de Atención` usa um mock de
> `GET /api/workers/me` para simular `isAddressValid = true` (endereço pré-existente
> do banco). Isso **não testa o fluxo real** do usuário: digitar um endereço e
> selecionar uma sugestão do autocomplete.
>
> O Google Places API não está disponível em ambiente de teste. A solução é injetar
> um mock de `window.google` **antes** da navegação via `page.addInitScript()`.

### Como funciona o `addInitScript`

```typescript
// Executado ANTES de qualquer script da página — garante que window.google
// existe quando o componente GooglePlacesAutocomplete montar.
await page.addInitScript(() => {
  const mockPlace = {
    formatted_address: 'Av. Santa Fe 1234, Buenos Aires, Argentina',
    geometry: {
      location: {
        lat: () => -34.5961,
        lng: () => -58.3772,
      },
    },
  };

  let placeChangedCallback: (() => void) | null = null;

  (window as any).google = {
    maps: {
      places: {
        Autocomplete: class MockAutocomplete {
          private input: HTMLInputElement;
          constructor(input: HTMLInputElement) {
            this.input = input;
          }
          addListener(event: string, fn: () => void) {
            if (event === 'place_changed') {
              placeChangedCallback = fn;
            }
          }
          getPlace() {
            return mockPlace;
          }
        },
        AutocompleteSessionToken: class {},
      },
    },
  };

  // Expõe uma função para os testes dispararem a seleção programaticamente
  (window as any).__triggerPlaceSelected = () => {
    placeChangedCallback?.();
  };
});
```

### 4.1 — Testes a criar

**Novo bloco `Fluxo de endereço com Google Places mockado`:**

```typescript
test.describe('Fluxo completo com Google Places mockado', () => {

  test.beforeEach(async ({ page }) => {
    // Injeta mock ANTES de navegar
    await page.addInitScript(/* ...script acima... */);
    await page.goto('/worker/profile');
    await page.waitForSelector('nav[aria-label="Tabs"]', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Dirección de Atención' }).click();
    await page.waitForTimeout(300);
  });

  test('digitar endereço e selecionar sugestão → isAddressValid=true → pode salvar', async ({ page }) => {
    let capturedBody = null;
    await page.route('**/api/workers/me/service-area', async (route) => {
      if (route.request().method() === 'PUT') {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }) });
      } else { await route.continue(); }
    });

    // Digita no campo de endereço
    await page.locator('[data-testid="address-autocomplete-input"]').fill('Av. Santa Fe');
    // Simula seleção de sugestão (dispara place_changed no mock)
    await page.evaluate(() => (window as any).__triggerPlaceSelected());

    // Agora isAddressValid=true — pode salvar sem erro de sugestões
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

    expect(capturedBody?.address).toContain('Santa Fe');
    expect(capturedBody?.lat).toBe(-34.5961);
    expect(capturedBody?.lng).toBe(-58.3772);
  });

  test('digitar mas NÃO selecionar sugestão → isAddressValid=false → erro', async ({ page }) => {
    await page.locator('[data-testid="address-autocomplete-input"]').fill('Av. Santa Fe 1234');
    // Não chama __triggerPlaceSelected — isAddressValid permanece false
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(MSG.selectAddress)).toBeVisible({ timeout: 3_000 });
  });

  test('payload tem coordenadas lat/lng corretas do mock', async ({ page }) => {
    let body = null;
    await page.route('**/api/workers/me/service-area', async (route) => {
      if (route.request().method() === 'PUT') {
        body = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }) });
      } else { await route.continue(); }
    });

    await page.locator('[data-testid="address-autocomplete-input"]').fill('Av. Santa Fe');
    await page.evaluate(() => (window as any).__triggerPlaceSelected());
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

    expect(typeof body?.lat).toBe('number');
    expect(typeof body?.lng).toBe('number');
  });
});
```

### Critério de aceite da Fase 4

- [ ] `window.google` mockado via `addInitScript` antes da navegação
- [ ] `__triggerPlaceSelected()` disponível como ponte de comunicação teste ↔ componente
- [ ] 3 novos testes: happy path com coordenadas, erro sem seleção, payload lat/lng
- [ ] O mock não afeta outros testes (é adicionado só nos testes desta seção)

---

## Fase 5 — Upload de documentos (fluxo de 4 etapas)

> **Situação atual:** apenas o estado de erro do `GET /documents` é testado.
> O fluxo real de upload envolve 4 chamadas de API encadeadas e **não está coberto**.

### Fluxo real de upload

```
1. POST /api/workers/me/documents/upload-url   → retorna { signedUrl, filePath }
2. PUT  {signedUrl}                             → upload para Google Cloud Storage
3. POST /api/workers/me/documents/save          → salva filePath no banco
4. GET  /api/workers/me/documents               → refresh da lista
```

### 5.1 — Identificar o componente de upload

**Antes de escrever os testes, verificar:**

```bash
# Encontrar como o DocumentUploadCard renderiza o input de arquivo
grep -n "input\|file\|upload" src/presentation/components/organisms/DocumentsGrid.tsx
grep -n "input\|file\|upload" src/presentation/components/molecules/DocumentUploadCard.tsx
```

Adicionar `data-testid` no input de arquivo de cada card:

```tsx
// Em DocumentUploadCard.tsx
<input
  type="file"
  accept=".pdf"
  data-testid={`upload-input-${documentType}`}  // ← ex: "upload-input-resume_cv"
  onChange={handleFileChange}
  className="hidden"
/>
```

### 5.2 — Testes a criar

**Novo bloco `Upload de Documentos — fluxo completo`:**

```typescript
test.describe('Upload de Documentos — fluxo completo', () => {
  const MOCK_SIGNED_URL = 'http://localhost:9999/mock-gcs/upload';
  const MOCK_FILE_PATH = 'workers/test-id/resume_cv/cv.pdf';

  test.beforeEach(async ({ page }) => {
    // Mock da listagem inicial
    await page.route('**/api/workers/me/documents', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }) });
      } else { await route.continue(); }
    });
    await page.getByRole('button', { name: 'Documentos' }).click();
    await page.waitForTimeout(500);
  });

  test('upload de CV — fluxo completo 4 etapas → documento aparece na lista', async ({ page }) => {
    // Etapa 1: mock do signed URL
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {
          signedUrl: MOCK_SIGNED_URL, filePath: MOCK_FILE_PATH
        }})
      });
    });

    // Etapa 2: mock do PUT para GCS (URL externa)
    await page.route(MOCK_SIGNED_URL, async (route) => {
      await route.fulfill({ status: 200 });
    });

    // Etapa 3: mock do POST /save
    let savedFilePath = '';
    await page.route('**/api/workers/me/documents/save', async (route) => {
      const body = route.request().postDataJSON();
      savedFilePath = body?.filePath;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true }) });
    });

    // Etapa 4: após save, GET retorna o documento
    await page.route('**/api/workers/me/documents', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [{
            documentType: 'resume_cv',
            filePath: MOCK_FILE_PATH,
            uploadedAt: new Date().toISOString(),
          }]})
        });
      } else { await route.continue(); }
    });

    // Faz o upload
    const fileInput = page.locator('[data-testid="upload-input-resume_cv"]');
    await fileInput.setInputFiles({
      name: 'meu-curriculo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    });

    // Verifica que /save foi chamado com o filePath correto
    await page.waitForTimeout(1_000);
    expect(savedFilePath).toBe(MOCK_FILE_PATH);

    // Documento deve aparecer na lista após o upload
    await expect(page.locator('[data-testid="document-card-resume_cv"]'))
      .toContainText(/meu-curriculo|cv/i, { timeout: 3_000 });
  });

  test('arquivo não-PDF é rejeitado pelo input (accept=".pdf")', async ({ page }) => {
    const fileInput = page.locator('[data-testid="upload-input-resume_cv"]');
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toContain('pdf');

    // Tenta enviar um .jpg — o input accept impede o arquivo de ser aceito
    // Verificamos que nenhuma chamada de upload-url é feita
    let uploadUrlCalled = false;
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      uploadUrlCalled = true;
      await route.continue();
    });

    // setInputFiles com arquivo inválido — o handler onChange deve checar o tipo
    await fileInput.setInputFiles({
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('JPEG content'),
    });
    await page.waitForTimeout(500);
    expect(uploadUrlCalled).toBe(false);
  });

  test('delete de documento → chama DELETE e remove da lista', async ({ page }) => {
    // Setup: lista com 1 documento
    await page.route('**/api/workers/me/documents', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [{
            documentType: 'resume_cv',
            filePath: MOCK_FILE_PATH,
          }]})
        });
      } else { await route.continue(); }
    });

    let deleteCalled = false;
    await page.route('**/api/workers/me/documents/resume_cv', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }) });
      } else { await route.continue(); }
    });

    // Re-navega para carregar o estado com documento
    await page.getByRole('button', { name: 'Información General' }).click();
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Documentos' }).click();
    await page.waitForTimeout(500);

    // Clica no botão de deletar
    await page.locator('[data-testid="delete-btn-resume_cv"]').click();
    await page.waitForTimeout(500);

    expect(deleteCalled).toBe(true);
  });

  test('falha no upload para GCS (etapa 2) → exibe mensagem de erro', async ({ page }) => {
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {
          signedUrl: MOCK_SIGNED_URL, filePath: MOCK_FILE_PATH
        }})
      });
    });
    await page.route(MOCK_SIGNED_URL, async (route) => {
      await route.fulfill({ status: 403 }); // GCS rejeita
    });

    const fileInput = page.locator('[data-testid="upload-input-resume_cv"]');
    await fileInput.setInputFiles({
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF'),
    });

    // Deve aparecer mensagem de erro
    await expect(page.locator('div[class*="bg-red"], p[class*="text-red"]').first())
      .toBeVisible({ timeout: 5_000 });
  });
});
```

> ⚠️ **Ponto de atenção:** os `data-testid` `upload-input-{docType}` e
> `delete-btn-{docType}` precisam ser adicionados em `DocumentUploadCard.tsx`
> antes de escrever os testes (parte da Fase 2).

### Critério de aceite da Fase 5

- [ ] Upload de CV cobre as 4 etapas (upload-url → GCS → save → refresh)
- [ ] Arquivo não-PDF não dispara chamadas de upload
- [ ] Delete chama `DELETE /api/workers/me/documents/{docType}`
- [ ] Falha no GCS exibe erro para o usuário

---

## Fase 6 — Upload e compressão de foto de perfil

> **Situação atual:** o upload de foto de perfil (incluindo compressão para 400×400
> e quality 0.8) **não está coberto** por nenhum teste.

### Fluxo real do upload de foto

```
1. Usuário seleciona imagem (input[type="file"] oculto)
2. FileReader.readAsDataURL() lê o arquivo
3. compressImage(dataUrl, 400, 400, 0.8) comprime
4. setValue('profilePhoto', compressedDataUrl)
5. Preview é exibido (img src = compressedDataUrl)
6. No submit, profilePhotoUrl é incluído no payload da API
```

### 6.1 — Adicionar `data-testid` no input de foto

**Arquivo:** `src/presentation/pages/tabs/GeneralInfoTab.tsx`

```tsx
// Antes:
<input type="file" accept="image/*" onChange={handleProfilePhotoUpload} className="hidden" />

// Depois:
<input
  type="file"
  accept="image/*"
  data-testid="profile-photo-input"             // ← adicionar
  onChange={handleProfilePhotoUpload}
  className="hidden"
/>
```

### 6.2 — Testes a criar

```typescript
test.describe('Upload de Foto de Perfil', () => {

  test('selecionar imagem exibe preview', async ({ page }) => {
    const photoInput = page.locator('[data-testid="profile-photo-input"]');

    // Cria um PNG mínimo válido (1×1 pixel)
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    await photoInput.setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: minimalPng,
    });

    // Preview deve aparecer (img com src != default placeholder)
    await expect(page.locator('img[alt="Profile"]')).toBeVisible({ timeout: 3_000 });
  });

  test('foto incluída no payload da API após salvar', async ({ page }) => {
    const { getBody } = await mockGeneralInfoPut(page);
    await fillGeneralInfoForm(page);

    // Faz upload de foto
    const photoInput = page.locator('[data-testid="profile-photo-input"]');
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await photoInput.setInputFiles({
      name: 'foto.png', mimeType: 'image/png', buffer: minimalPng,
    });
    await page.waitForTimeout(500); // aguarda compressão

    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

    // profilePhotoUrl deve ser um data URL base64
    const body = getBody();
    expect(typeof body?.profilePhotoUrl).toBe('string');
    expect((body?.profilePhotoUrl as string).startsWith('data:')).toBe(true);
  });

  test('imagem não aceita arquivos não-imagem (accept="image/*")', async ({ page }) => {
    const photoInput = page.locator('[data-testid="profile-photo-input"]');
    const accept = await photoInput.getAttribute('accept');
    expect(accept).toBe('image/*');
  });
});
```

### Critério de aceite da Fase 6

- [ ] `data-testid="profile-photo-input"` adicionado ao input de foto
- [ ] Preview aparece após upload
- [ ] Payload inclui `profilePhotoUrl` como data URL
- [ ] `accept="image/*"` verificado

---

## Fase 7 — Edge cases e campos secundários

> Gaps menores que fecham os últimos buracos de cobertura.

### 7.1 — Snapping do raio de atendimento

```typescript
test.describe('Snapping do raio de atendimento', () => {

  test.beforeEach(async ({ page }) => {
    await page.getByRole('button', { name: 'Dirección de Atención' }).click();
    await page.waitForTimeout(300);
  });

  test('digitar 7 km → snap para 5 (mais próximo)', async ({ page }) => {
    const input = page.locator('#serviceRadius');
    await input.fill('7');
    await input.blur(); // dispara o onBlur que faz o snap
    await expect(input).toHaveValue('5');
  });

  test('digitar 15 km → snap para 10 (mais próximo)', async ({ page }) => {
    const input = page.locator('#serviceRadius');
    await input.fill('15');
    await input.blur();
    await expect(input).toHaveValue('10');
  });

  test('digitar 30 km → snap para 20 (mais próximo)', async ({ page }) => {
    const input = page.locator('#serviceRadius');
    await input.fill('30');
    await input.blur();
    await expect(input).toHaveValue('20');
  });

  test('valores exatos [5, 10, 20, 50] não sofrem snap', async ({ page }) => {
    const input = page.locator('#serviceRadius');
    for (const value of ['5', '10', '20', '50']) {
      await input.fill(value);
      await input.blur();
      await expect(input).toHaveValue(value);
    }
  });
});
```

### 7.2 — Seleção múltipla de idiomas

```typescript
test('selecionar 3 idiomas → payload tem languages: ["pt", "es", "en"]', async ({ page }) => {
  const { getBody } = await mockGeneralInfoPut(page);
  await fillGeneralInfoForm(page); // já seleciona "es"

  // Adiciona os outros 2
  await selectInMultiSelect(page, 'languages', 'Portugués');
  await selectInMultiSelect(page, 'languages', 'Inglés');
  await closeMultiSelect(page);

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

  const langs = getBody()?.languages as string[];
  expect(langs).toContain('pt');
  expect(langs).toContain('es');
  expect(langs).toContain('en');
  expect(langs.length).toBe(3);
});
```

### 7.3 — Deselecionar idioma já selecionado

```typescript
test('deselecionar idioma já marcado o remove da lista', async ({ page }) => {
  const { getBody } = await mockGeneralInfoPut(page);
  await fillGeneralInfoForm(page); // seleciona "es"

  // Clica novamente em "Español" para desmarcar
  await selectInMultiSelect(page, 'languages', 'Español'); // toggle OFF

  // Adiciona "Portugués" para ter ao menos 1 (evitar erro de validação)
  await selectInMultiSelect(page, 'languages', 'Portugués');
  await closeMultiSelect(page);

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

  const langs = getBody()?.languages as string[];
  expect(langs).not.toContain('es');
  expect(langs).toContain('pt');
});
```

### 7.4 — Tipos de experiência múltiplos e payload

```typescript
test('selecionar 3 tipos de experiência → payload tem array correto', async ({ page }) => {
  const { getBody } = await mockGeneralInfoPut(page);
  await fillGeneralInfoForm(page); // já seleciona "elderly"

  await selectInMultiSelect(page, 'experience-types', 'Niños');
  await selectInMultiSelect(page, 'experience-types', 'Adultos');
  await closeMultiSelect(page);

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

  const types = getBody()?.experienceTypes as string[];
  expect(types).toContain('elderly');
  expect(types).toContain('children');
  expect(types).toContain('adults');
});
```

### 7.5 — Troca de tipo de documento (DNI → CPF)

```typescript
test('trocar documentType para CPF → payload tem documentType="CPF"', async ({ page }) => {
  const { getBody } = await mockGeneralInfoPut(page);
  await fillGeneralInfoForm(page);
  await page.selectOption('#documentType', 'CPF');

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

  expect(getBody()?.documentType).toBe('CPF');
});
```

### Critério de aceite da Fase 7

- [ ] 4 testes de snapping de raio
- [ ] Seleção e deseleção de múltiplos idiomas com verificação de payload
- [ ] Múltiplos tipos de experiência no payload
- [ ] Troca de tipo de documento refletida no payload

---

## Checklist de validação final

> Marcar cada item após implementação e execução bem-sucedida (`npm run test:e2e`).

### Infraestrutura
- [ ] Setup de auth isolado em projeto separado (`auth.setup.ts`)
- [ ] `data-testid` em `MultiSelect` (trigger + dropdown + cada opção)
- [ ] `data-testid` em `GooglePlacesAutocomplete` (input + sugestões)
- [ ] `data-testid` em `DocumentUploadCard` (input de arquivo + botão delete)
- [ ] `data-testid` em `GeneralInfoTab` (input de foto)
- [ ] `data-testid` em `DocumentsGrid` (card por tipo de documento)
- [ ] `.auth/` no `.gitignore`

### Aba 1 — Información General
- [ ] 13 mensagens de validação com testes isolados (6 existentes + 5 da Fase 3 + 2 já testadas via "clicar Guardar")
- [ ] Máscara de data: digitação completa, parcial, maxLength
- [ ] `parseDateToISO`: API recebe `AAAA-MM-DD`
- [ ] Todos os selects: opções em espanhol verificadas
- [ ] Email é `readonly` e não editável
- [ ] Payload verificado: `firstName`, `lastName`, `profession`, `documentNumber`, `birthDate`, `languages[]`, `experienceTypes[]`, `termsAccepted`, `privacyAccepted`
- [ ] Múltiplos idiomas selecionados e deselecionados
- [ ] Múltiplos tipos de experiência
- [ ] Troca de tipo de documento
- [ ] Foto: upload, preview, payload como data URL
- [ ] Erro de API: 500 exibe div vermelho
- [ ] Botão em estado de loading durante requisição

### Aba 2 — Dirección de Atención
- [ ] Labels em espanhol verificados
- [ ] Raio padrão = 10 km
- [ ] Snapping: 4 testes (7→5, 15→10, 30→20, exatos sem snap)
- [ ] Checkbox remoto: marcar/desmarcar
- [ ] Erro sem seleção de sugestão: `"Por favor, seleccione una dirección..."`
- [ ] Happy path com Google Places mockado: `lat`, `lng`, `address` no payload
- [ ] Endereço pré-existente preenche o formulário
- [ ] Erro de API: 500 exibe div vermelho

### Aba 3 — Disponibilidad
- [ ] 7 dias em espanhol
- [ ] Add slot: startTime=09:00, endTime=17:00 por padrão
- [ ] Editar startTime e endTime
- [ ] Remover slot com ×
- [ ] 3 slots no mesmo dia
- [ ] Dias diferentes simultâneos
- [ ] Payload: `dayOfWeek` correto para cada dia (0=Domingo, 1=Lunes, ..., 6=Sábado)
- [ ] Sem dias habilitados → `availability: []`
- [ ] Disponibilidade pré-existente carregada do banco
- [ ] Erro de API: 500 exibe div vermelho

### Aba 4 — Documentos
- [ ] 5 cards com labels em espanhol
- [ ] Upload CV: fluxo 4 etapas (upload-url → GCS → save → refresh)
- [ ] Arquivo não-PDF não dispara upload
- [ ] Delete: chama `DELETE /documents/{docType}`
- [ ] Falha no GCS exibe erro
- [ ] `GET /documents` erro 500 exibe mensagem de erro
- [ ] `GET /documents` erro 401 exibe mensagem de erro

### Fluxo ponta a ponta (banco real)
- [ ] Información General persiste após reload
- [ ] Disponibilidad persiste após reload

---

## Mapa de dependências entre fases

```
Fase 1 (Auth isolada)         Fase 2 (data-testid)
      │                               │
      │                    ┌──────────┼──────────┬──────────┐
      │                    ▼          ▼          ▼          ▼
      │               Fase 3       Fase 4     Fase 5     Fase 6
      │              (Validações) (G.Places) (Docs)     (Foto)
      │                    │          │          │          │
      └────────────────────┴──────────┴──────────┴──────────┘
                                      │
                                      ▼
                                   Fase 7
                                (Edge cases)

Fases 1 e 2 são independentes entre si — podem ser feitas em paralelo.
Fases 3–7 requerem que a Fase 2 esteja concluída.
```

---

## Arquivos de referência

| Arquivo | Relevância |
|---|---|
| `e2e/worker-profile-tabs.e2e.ts` | Arquivo de testes — recebe todos os novos testes |
| `e2e/auth.setup.ts` | A criar na Fase 1 |
| `playwright.config.ts` | Adicionar setup project na Fase 1 |
| `src/presentation/components/molecules/MultiSelect.tsx` | Recebe `data-testid` na Fase 2 |
| `src/presentation/components/molecules/GooglePlacesAutocomplete.tsx` | Recebe `data-testid` na Fase 2 |
| `src/presentation/pages/tabs/GeneralInfoTab.tsx` | Recebe `data-testid` no input de foto (Fase 2) |
| `src/presentation/pages/tabs/DocumentsTab.tsx` e `DocumentsGrid.tsx` | Recebem `data-testid` (Fase 2) |
| `src/presentation/components/molecules/DocumentUploadCard.tsx` | Recebe `data-testid` (Fase 2) |
| `src/infrastructure/i18n/locales/es.json:119-141` | Mensagens de validação — fonte da verdade |
| `src/presentation/validation/workerRegistrationSchemas.ts` | Schema Zod — verificar triggers de validação |
