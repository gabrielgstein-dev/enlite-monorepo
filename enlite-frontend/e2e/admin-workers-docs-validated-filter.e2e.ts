/**
 * admin-workers-docs-validated-filter.e2e.ts
 *
 * Playwright E2E — Filtro "Todos validados" (docs_validated=true) na página /admin/workers
 *
 * Fluxos cobertos:
 *   1. Visual: dropdown de Documentación exibe a opção "Todos validados"
 *   2. Selecionar "Todos validados" envia docs_validated=true na request (sem docs_complete)
 *   3. Voltar para "Todos" (sem filtro) remove docs_validated da próxima request
 *   4. Screenshot da página com filtro "Todos validados" selecionado
 */

import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY  = 'test-api-key';

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_CASE_OPTIONS = [
  { value: 'uuid-1', label: 'CASO 101 - Juan García' },
  { value: 'uuid-2', label: 'CASO 102 - María López' },
];

const MOCK_WORKERS_VALIDATED = [
  {
    id: 'w3333333-0003-0003-0003-000000000003',
    name: 'Ana Validada',
    email: 'ana.validada@e2e.test',
    casesCount: 2,
    documentsComplete: true,
    documentsStatus: 'approved',
    platform: 'talentum',
    createdAt: '2026-03-10T09:00:00Z',
  },
];

const MOCK_STATS = {
  success: true,
  data: { today: 1, yesterday: 0, sevenDaysAgo: 3 },
};

function mockWorkersList(workers = MOCK_WORKERS_VALIDATED, total = workers.length) {
  return JSON.stringify({
    success: true,
    data: workers,
    total,
    limit: 20,
    offset: 0,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function seedAdminAndLogin(page: Page): Promise<void> {
  const rnd      = Math.random().toString(36).slice(2, 8);
  const email    = `e2e.docsvalidated.${Date.now()}.${rnd}@test.com`;
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
    INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at)
      VALUES ('${uid}', '${email}', 'DocsValidated E2E', 'admin', NOW(), NOW()) ON CONFLICT DO NOTHING;
    INSERT INTO admins_extension (user_id, must_change_password, created_at, updated_at)
      VALUES ('${uid}', false, NOW(), NOW()) ON CONFLICT DO NOTHING;
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
          firstName: 'DocsValidated',
          lastName: 'E2E',
          isActive: true,
          mustChangePassword: false,
        },
      }),
    }),
  );

  // 4. Mock auxiliary endpoints
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
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });
}

async function mockWorkersApis(page: Page, workers = MOCK_WORKERS_VALIDATED): Promise<void> {
  await page.route('**/api/admin/workers/case-options', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_CASE_OPTIONS }),
    }),
  );

  await page.route('**/api/admin/workers/stats', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATS),
    }),
  );

  await page.route('**/api/admin/workers*', (route) => {
    const url = route.request().url();
    if (url.includes('/stats') || url.includes('/case-options')) {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: mockWorkersList(workers),
    });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('AdminWorkersPage — Filtro docs_validated', () => {
  test.setTimeout(60000);
  test.use({ viewport: { width: 1280, height: 900 } });

  // ── 1. Visual: dropdown exibe "Todos validados" ────────────────────────────

  test('dropdown de Documentación exibe a opção "Todos validados"', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockWorkersApis(page);

    await page.goto('/admin/workers');

    // Aguarda a seção de filtros carregar
    const filtersSection = page.locator('.bg-white.rounded-b-\\[20px\\]');
    await expect(filtersSection).toBeVisible({ timeout: 15000 });

    // Abre o select de Documentación (é o segundo SelectField no filtro)
    // Localiza pelo label "Documentación"
    const docsLabel = page.getByText('Documentación').first();
    await expect(docsLabel).toBeVisible({ timeout: 10000 });

    // Clica no select de documentação — é o select dentro do container do label Documentación
    const docsContainer = docsLabel.locator('..').locator('..');
    const docsSelect = docsContainer.locator('select');
    await expect(docsSelect).toBeVisible({ timeout: 5000 });

    // Verifica que a opção "Todos validados" existe dentro do select
    await expect(docsSelect.locator('option[value="validated"]')).toHaveCount(1);
    const optionText = await docsSelect.locator('option[value="validated"]').textContent();
    expect(optionText).toContain('Todos validados');

    // Screenshot visual do filtro
    await expect(filtersSection).toHaveScreenshot('workers-docs-validated-filter-initial.png');
  });

  // ── 2. Selecionar "Todos validados" envia docs_validated=true ───────────────

  test('selecionar "Todos validados" envia docs_validated=true e não docs_complete na request', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers/case-options', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_CASE_OPTIONS }),
      }),
    );
    await page.route('**/api/admin/workers/stats', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_STATS),
      }),
    );

    const capturedUrls: string[] = [];
    await page.route('**/api/admin/workers*', (route) => {
      const url = route.request().url();
      if (!url.includes('/stats') && !url.includes('/case-options')) {
        capturedUrls.push(url);
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockWorkersList(),
      });
    });

    await page.goto('/admin/workers');
    await expect(page.getByText('Documentación').first()).toBeVisible({ timeout: 15000 });

    // Seleciona "Todos validados" no select de Documentación
    const docsLabel = page.getByText('Documentación').first();
    const docsContainer = docsLabel.locator('..').locator('..');
    const docsSelect = docsContainer.locator('select');
    await expect(docsSelect).toBeVisible({ timeout: 5000 });
    await docsSelect.selectOption('validated');

    // Aguarda requisição com o filtro
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/admin/workers') &&
        !resp.url().includes('/stats') &&
        !resp.url().includes('/case-options') &&
        resp.url().includes('docs_validated=true'),
      { timeout: 10000 },
    );

    const lastUrl = capturedUrls[capturedUrls.length - 1];
    expect(lastUrl).toContain('docs_validated=true');
    expect(lastUrl).not.toContain('docs_complete=');
  });

  // ── 3. Screenshot com filtro "Todos validados" selecionado ──────────────────

  test('screenshot da página com filtro "Todos validados" selecionado', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockWorkersApis(page);

    await page.goto('/admin/workers');

    const filtersSection = page.locator('.bg-white.rounded-b-\\[20px\\]');
    await expect(filtersSection).toBeVisible({ timeout: 15000 });

    const docsLabel = page.getByText('Documentación').first();
    await expect(docsLabel).toBeVisible({ timeout: 10000 });

    const docsContainer = docsLabel.locator('..').locator('..');
    const docsSelect = docsContainer.locator('select');
    await expect(docsSelect).toBeVisible({ timeout: 5000 });

    // Seleciona "Todos validados"
    await docsSelect.selectOption('validated');

    // Aguarda que a lista seja atualizada
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/admin/workers') &&
        !resp.url().includes('/stats') &&
        !resp.url().includes('/case-options'),
      { timeout: 10000 },
    );

    // Aguarda a tabela estar visível
    await expect(page.getByText('Ana Validada')).toBeVisible({ timeout: 10000 });

    // Screenshot: filtros com "Todos validados" selecionado + lista renderizada
    await expect(page).toHaveScreenshot('workers-docs-validated-filter.png');
  });

  // ── 4. Voltar para "Todos" remove docs_validated da request ─────────────────

  test('voltar para "Todos" remove docs_validated da próxima request', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route('**/api/admin/workers/case-options', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_CASE_OPTIONS }),
      }),
    );
    await page.route('**/api/admin/workers/stats', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_STATS),
      }),
    );

    const capturedUrls: string[] = [];
    await page.route('**/api/admin/workers*', (route) => {
      const url = route.request().url();
      if (!url.includes('/stats') && !url.includes('/case-options')) {
        capturedUrls.push(url);
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockWorkersList(),
      });
    });

    await page.goto('/admin/workers');
    await expect(page.getByText('Documentación').first()).toBeVisible({ timeout: 15000 });

    const docsLabel = page.getByText('Documentación').first();
    const docsContainer = docsLabel.locator('..').locator('..');
    const docsSelect = docsContainer.locator('select');
    await expect(docsSelect).toBeVisible({ timeout: 5000 });

    // Seleciona "Todos validados"
    await docsSelect.selectOption('validated');
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/admin/workers') &&
        !resp.url().includes('/stats') &&
        !resp.url().includes('/case-options') &&
        resp.url().includes('docs_validated=true'),
      { timeout: 10000 },
    );

    // Volta para "Todos" (valor vazio = placeholder)
    await docsSelect.selectOption('');

    // Aguarda a próxima request sem docs_validated
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/admin/workers') &&
        !resp.url().includes('/stats') &&
        !resp.url().includes('/case-options') &&
        !resp.url().includes('docs_validated='),
      { timeout: 10000 },
    );

    const lastUrl = capturedUrls[capturedUrls.length - 1];
    expect(lastUrl).not.toContain('docs_validated=');
    expect(lastUrl).not.toContain('docs_complete=');
  });
});
