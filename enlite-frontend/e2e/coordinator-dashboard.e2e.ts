/**
 * coordinator-dashboard.e2e.ts
 *
 * Playwright E2E — Dashboard Coordinadores (/admin/dashboard/coordinators)
 *
 * Fluxo coberto:
 *   - Navega via sidebar para o dashboard de coordenadores
 *   - Exibe cards de capacidade por coordenador com métricas corretas
 *   - Exibe alertas de casos problemáticos com badges de motivo
 *   - Clicar em alerta navega para o kanban do caso
 */

import { test, expect, Page } from '@playwright/test';

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY  = 'test-api-key';

const MOCK_COORDINATORS = {
  success: true,
  data: [
    { id: 'c1', name: 'María González', weeklyHours: 20, activeCases: 5, encuadresThisWeek: 18, conversionRate: 0.22, totalCases: 12 },
    { id: 'c2', name: 'Juan Rodríguez', weeklyHours: 15, activeCases: 3, encuadresThisWeek: 8, conversionRate: 0.35, totalCases: 7 },
    { id: 'c3', name: 'Laura Fernández', weeklyHours: null, activeCases: 1, encuadresThisWeek: 2, conversionRate: null, totalCases: 2 },
  ],
};

const MOCK_CHANNELS = {
  success: true,
  data: [
    { channel: 'Facebook', total: 120, selected: 8, attended: 45, conversionRate: 0.178 },
    { channel: 'Talentum', total: 85, selected: 12, attended: 60, conversionRate: 0.200 },
    { channel: 'LinkedIn', total: 30, selected: 2, attended: 15, conversionRate: 0.133 },
    { channel: 'Desconocido', total: 50, selected: 1, attended: 20, conversionRate: 0.050 },
  ],
};

const MOCK_ALERTS = {
  success: true,
  data: [
    {
      jobPostingId: 'jp-alert-001',
      caseNumber: 500,
      title: 'Caso 500 — Paciente Crítico',
      coordinatorName: 'María González',
      daysOpen: 45,
      totalEncuadres: 250,
      selectedCount: 0,
      recentEncuadres: 0,
      alertReasons: ['MORE_THAN_200_ENCUADRES', 'OPEN_MORE_THAN_30_DAYS', 'NO_CANDIDATES_LAST_7_DAYS'],
    },
    {
      jobPostingId: 'jp-alert-002',
      caseNumber: 601,
      title: 'Caso 601 — Sin Candidatos',
      coordinatorName: 'Juan Rodríguez',
      daysOpen: 15,
      totalEncuadres: 30,
      selectedCount: 0,
      recentEncuadres: 0,
      alertReasons: ['NO_CANDIDATES_LAST_7_DAYS'],
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function seedAdminAndLogin(page: Page): Promise<void> {
  const email    = `e2e.dashboard.${Date.now()}@test.com`;
  const password = 'TestAdmin123!';

  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  const { localId: uid } = (await signUpRes.json()) as any;

  await page.route('**/api/admin/auth/profile', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { id: uid, email, role: 'superadmin', firstName: 'Admin', lastName: 'Dashboard', isActive: true, mustChangePassword: false } }),
    }),
  );

  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar|Entrar/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });
}

function mockDashboardApis(page: Page) {
  return Promise.all([
    page.route('**/api/admin/dashboard/coordinator-capacity', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_COORDINATORS) }),
    ),
    page.route('**/api/admin/dashboard/alerts', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ALERTS) }),
    ),
    page.route('**/api/admin/dashboard/conversion-by-channel', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHANNELS) }),
    ),
  ]);
}

// ── Testes ────────────────────────────────────────────────────────────────

test.describe('CoordinatorDashboardPage', () => {
  test.setTimeout(60000);

  test('navega para dashboard via sidebar', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    // Mock outros endpoints para não ter erros de rede
    await page.route('**/api/admin/**', route => {
      if (route.request().url().includes('dashboard')) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });

    await page.goto('/admin');
    // Clicar no item "Coordinadores" no sidebar
    await page.locator('text=Coordinadores').first().click();
    await expect(page).toHaveURL(/.*dashboard\/coordinators/, { timeout: 10000 });
  });

  test('exibe cards de capacidade com métricas dos coordenadores', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    await page.goto('/admin/dashboard/coordinators');

    // Verifica que os 3 coordenadores estão visíveis
    await expect(page.locator('text=María González').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Juan Rodríguez').first()).toBeVisible();
    await expect(page.locator('text=Laura Fernández').first()).toBeVisible();

    // Verifica métricas de María
    await expect(page.locator('text=20').first()).toBeVisible(); // weeklyHours
    await expect(page.locator('text=22%').first()).toBeVisible(); // conversion rate
  });

  test('exibe seção de alertas com casos problemáticos', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    await page.goto('/admin/dashboard/coordinators');

    // Título da seção de alertas
    await expect(page.locator('text=Casos problemáticos').first()).toBeVisible({ timeout: 15000 });

    // Caso 500 — 3 alertas
    await expect(page.locator('text=Caso 500').first()).toBeVisible();
    await expect(page.locator('text=+200 encuadres sin éxito').first()).toBeVisible();
    await expect(page.locator('text=Abierto +30 días').first()).toBeVisible();

    // Caso 601
    await expect(page.locator('text=Caso 601').first()).toBeVisible();
    await expect(page.locator('text=Sin candidatos').first()).toBeVisible();
  });

  test('alertas mostram dados do coordenador e dias aberto', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    await page.goto('/admin/dashboard/coordinators');

    // Coordenador do alerta
    await expect(page.locator('text=Coord: María González').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=45d abierto').first()).toBeVisible();
    await expect(page.locator('text=250 encuadres').first()).toBeVisible();
  });

  test('título e botão de atualizar estão presentes', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    await page.goto('/admin/dashboard/coordinators');

    await expect(page.locator('text=Dashboard Coordinadores').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Actualizar/i })).toBeVisible();
  });

  test('clicar em alerta navega para o kanban do caso', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    // Mock vacancy + funnel para a página de destino
    await page.route(`**/api/admin/vacancies/jp-alert-001`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'jp-alert-001', case_number: 500, title: 'Caso 500', encuadres: [], publications: [] } }) }),
    );
    await page.route(`**/api/admin/vacancies/jp-alert-001/funnel`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { stages: { INVITED: [], CONFIRMED: [], INTERVIEWING: [], SELECTED: [], REJECTED: [], PENDING: [] }, totalEncuadres: 0 } }) }),
    );

    await page.goto('/admin/dashboard/coordinators');

    // Clicar no alerta do Caso 500
    await expect(page.locator('text=Caso 500').first()).toBeVisible({ timeout: 15000 });
    await page.locator('text=Caso 500').first().click();

    // Deve navegar para o kanban do caso
    await expect(page).toHaveURL(/.*vacancies\/jp-alert-001\/kanban/, { timeout: 10000 });
  });

  test('exibe tabela de conversão por canal de origem', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockDashboardApis(page);

    await page.goto('/admin/dashboard/coordinators');

    // Título da seção
    await expect(page.locator('text=Conversión por canal de origen').first()).toBeVisible({ timeout: 15000 });

    // Canais na tabela
    await expect(page.locator('td:has-text("Facebook")').first()).toBeVisible();
    await expect(page.locator('td:has-text("Talentum")').first()).toBeVisible();
    await expect(page.locator('td:has-text("LinkedIn")').first()).toBeVisible();

    // Taxa de conversão do Talentum (0.200 → 20.0%)
    await expect(page.locator('text=20.0%').first()).toBeVisible();
  });
});
