/**
 * admin-workers.e2e.ts
 *
 * Playwright E2E — Tela de listagem de Workers (/admin/workers)
 *
 * Fluxos cobertos:
 *   - Página renderiza corretamente em /admin/workers
 *   - Item "Workers" visível no menu lateral (sidebar)
 *   - Tabela exibe dados dos workers (nome, casos, documentação, plataforma)
 *   - Estado vazio exibe mensagem "Nenhum worker encontrado"
 *   - Filtro por plataforma inclui parâmetro na requisição
 *   - Filtro por documentação inclui parâmetro na requisição
 *   - Erro de API exibe mensagem de erro
 *   - Acesso sem auth redireciona para /admin/login
 */

import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';

const FIREBASE_EMULATOR  = 'http://localhost:9099';
const FIREBASE_API_KEY   = 'test-api-key';

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_WORKERS = [
  {
    id: 'w1111111-0001-0001-0001-000000000001',
    name: 'Maria Silva',
    email: 'maria.silva@e2e.test',
    casesCount: 3,
    documentsComplete: true,
    documentsStatus: 'approved',
    platform: 'talentum',
    createdAt: '2026-03-20T10:00:00Z',
  },
  {
    id: 'w2222222-0002-0002-0002-000000000002',
    name: 'João Souza',
    email: 'joao.souza@e2e.test',
    casesCount: 0,
    documentsComplete: false,
    documentsStatus: 'pending',
    platform: 'planilla_operativa',
    createdAt: '2026-03-15T08:00:00Z',
  },
];

function mockWorkersList(workers = MOCK_WORKERS, total = MOCK_WORKERS.length) {
  return JSON.stringify({
    success: true,
    data: workers,
    total,
    limit: 20,
    offset: 0,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedAdminAndLogin(page: Page): Promise<void> {
  const rnd     = Math.random().toString(36).slice(2, 8);
  const email   = `e2e.workers.${Date.now()}.${rnd}@test.com`;
  const password = 'TestAdmin123!';

  // 1. Create user in Firebase Emulator
  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signUpData = (await signUpRes.json()) as any;
  if (!signUpData.localId) throw new Error(`Firebase sign-up failed: ${JSON.stringify(signUpData)}`);
  const uid = signUpData.localId;

  // 2. Seed Postgres admin record
  const sql = `
    INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES ('${uid}', '${email}', 'Workers E2E', NOW(), NOW()) ON CONFLICT DO NOTHING;
    INSERT INTO admins_extension (user_id, role, is_active, must_change_password, created_at, updated_at)
      VALUES ('${uid}', 'superadmin', true, false, NOW(), NOW()) ON CONFLICT DO NOTHING;
  `.replace(/\n/g, ' ').trim();

  try {
    execSync(`docker exec enlite-postgres psql -U enlite_admin -d enlite_e2e -c "${sql}"`, { stdio: 'pipe' });
  } catch {
    // Fall through to mock below
  }

  // 3. Mock /api/admin/auth/profile
  await page.route('**/api/admin/auth/profile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: uid,
          email,
          role: 'superadmin',
          firstName: 'Workers',
          lastName: 'E2E',
          isActive: true,
          mustChangePassword: false,
        },
      }),
    }),
  );

  // 4. Mock other pages that could be visited during navigation
  await page.route('**/api/vacancies*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], total: 0, page: 1, limit: 20 }),
    }),
  );

  await page.route('**/api/admin/users*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );

  // 5. Login via UI
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar|Entrar/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('AdminWorkersPage', () => {
  test.setTimeout(60000);

  test('página /admin/workers renderiza título e tabela de workers', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() }),
    );

    await page.goto('/admin/workers');

    // Título da página
    await expect(page.locator('text=Workers').first()).toBeVisible({ timeout: 15000 });

    // Cabeçalhos da tabela
    await expect(page.locator('text=Nome').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Casos').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Documentação').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Cadastro').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Plataforma').first()).toBeVisible({ timeout: 5000 });
  });

  test('item "Workers" está visível no menu lateral', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() }),
    );

    await page.goto('/admin/workers');
    await expect(page.getByRole('link', { name: /Workers/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('tabela exibe dados do worker: nome, email, casos, badge documentação e plataforma', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() }),
    );

    await page.goto('/admin/workers');

    // Worker 1 — Maria Silva
    await expect(page.locator('text=Maria Silva').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=maria.silva@e2e.test').first()).toBeVisible({ timeout: 5000 });
    // Use exact match to avoid hitting hidden <option>Completos</option> in the filter select
    await expect(page.getByText('Completo', { exact: true }).first()).toBeVisible({ timeout: 5000 });

    // Worker 2 — João Souza
    await expect(page.locator('text=João Souza').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pendente', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test('tabela vazia exibe "Nenhum worker encontrado"', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList([], 0) }),
    );

    await page.goto('/admin/workers');

    await expect(page.locator('text=Nenhum worker encontrado').first()).toBeVisible({ timeout: 15000 });
  });

  test('filtro por plataforma envia parâmetro platform na URL da requisição', async ({ page }) => {
    await seedAdminAndLogin(page);

    let capturedUrl = '';
    await page.route('**/api/admin/workers*', (route) => {
      capturedUrl = route.request().url();
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() });
    });

    await page.goto('/admin/workers');
    await expect(page.locator('text=Nome').first()).toBeVisible({ timeout: 15000 });

    // Seleciona a plataforma Talentum no select de filtros
    const platformSelect = page.locator('select').first();
    await platformSelect.selectOption('talentum');

    // Aguarda nova requisição com filtro
    await page.waitForResponse((resp) => resp.url().includes('/api/admin/workers') && resp.url().includes('platform=talentum'));

    expect(capturedUrl).toContain('platform=talentum');
  });

  test('filtro por documentação envia parâmetro docs_complete na URL da requisição', async ({ page }) => {
    await seedAdminAndLogin(page);

    let capturedUrl = '';
    await page.route('**/api/admin/workers*', (route) => {
      capturedUrl = route.request().url();
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() });
    });

    await page.goto('/admin/workers');
    await expect(page.locator('text=Nome').first()).toBeVisible({ timeout: 15000 });

    // Seleciona filtro de documentação completa
    const selects = page.locator('select');
    await selects.nth(1).selectOption('complete');

    await page.waitForResponse((resp) => resp.url().includes('/api/admin/workers') && resp.url().includes('docs_complete=complete'));

    expect(capturedUrl).toContain('docs_complete=complete');
  });

  test('erro de API exibe mensagem de erro na tela', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal Server Error' }),
      }),
    );

    await page.goto('/admin/workers');

    await expect(page.locator('text=Erro ao carregar workers').first()).toBeVisible({ timeout: 15000 });
  });

  test('filtros de plataforma e documentação não possuem opções duplicadas', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() }),
    );

    await page.goto('/admin/workers');
    await expect(page.locator('text=Nome').first()).toBeVisible({ timeout: 15000 });

    const selects = page.locator('select');

    // Plataforma: 1 placeholder ("Todas") + 5 valores = 6 options
    const platformOptions = await selects.nth(0).locator('option').all();
    expect(platformOptions).toHaveLength(6);
    const platformValues = await Promise.all(platformOptions.map((o) => o.getAttribute('value')));
    const platformDuplicates = platformValues.filter((v, i) => platformValues.indexOf(v) !== i);
    expect(platformDuplicates).toHaveLength(0);

    // Documentação: 1 placeholder ("Todos") + 2 valores = 3 options
    const docsOptions = await selects.nth(1).locator('option').all();
    expect(docsOptions).toHaveLength(3);
    const docsValues = await Promise.all(docsOptions.map((o) => o.getAttribute('value')));
    const docsDuplicates = docsValues.filter((v, i) => docsValues.indexOf(v) !== i);
    expect(docsDuplicates).toHaveLength(0);
  });

  test('fluxo completo: carrega workers, aplica filtro e exibe resultado visualmente', async ({ page }) => {
    await seedAdminAndLogin(page);

    // Intercept inicial retorna lista completa
    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() }),
    );

    await page.goto('/admin/workers');

    // 1. Verificar estado inicial — sem erro, com dados
    await expect(page.locator('text=Erro ao carregar workers')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Maria Silva').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=João Souza').first()).toBeVisible({ timeout: 5000 });

    // 2. Aplicar filtro por plataforma (Talentum) — apenas Maria Silva esperada
    const filteredBody = JSON.stringify({
      success: true,
      data: [MOCK_WORKERS[0]],
      total: 1,
      limit: 20,
      offset: 0,
    });

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: filteredBody }),
    );

    const platformSelect = page.locator('select').first();
    await platformSelect.selectOption('talentum');

    // 3. Garantia visual: tabela atualiza, sem erro
    await expect(page.locator('text=Erro ao carregar workers')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Maria Silva').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=João Souza')).not.toBeVisible({ timeout: 5000 });
  });

  test('acesso sem autenticação redireciona para /admin/login', async ({ browser }) => {
    const context = await browser.newContext();
    const page    = await context.newPage();

    await page.goto('/admin/workers');
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });

    await context.close();
  });

  test('clicar no link Workers na sidebar navega para /admin/workers', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: mockWorkersList() }),
    );

    // Começa em /admin para testar navegação via sidebar
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin', { timeout: 10000 });

    const workersLink = page.getByRole('link', { name: /Workers/i }).first();
    await expect(workersLink).toBeVisible({ timeout: 10000 });
    await workersLink.click();

    await expect(page).toHaveURL(/\/admin\/workers/, { timeout: 10000 });
    await expect(page.locator('text=Lista de Workers').first()).toBeVisible({ timeout: 15000 });
  });
});
