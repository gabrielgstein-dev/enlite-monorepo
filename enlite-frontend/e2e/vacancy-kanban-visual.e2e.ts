/**
 * vacancy-kanban-visual.e2e.ts
 *
 * Playwright E2E — Testes visuais (screenshot assertions) para o Kanban
 *
 * Cobre as 3 funcionalidades novas:
 *   1. Formatação de telefone por país (AR, BR, genérico)
 *   2. Nome clicável que navega para /admin/workers/:id
 *   3. Tag de data/hora da reunião na coluna Confirmados
 */

import { test, expect, Page } from '@playwright/test';

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY = 'test-api-key';

const MOCK_VACANCY_ID = 'visual-test-0001-0001-0001-000000000001';

const MOCK_VACANCY = {
  id: MOCK_VACANCY_ID,
  case_number: 747,
  vacancy_number: 312,
  title: 'CASO 747-312',
  status: 'BUSQUEDA',
  country: 'Argentina',
  patient_first_name: 'Paciente',
  patient_last_name: 'Visual',
  encuadres: [],
  publications: [],
};

const MOCK_FUNNEL = {
  success: true,
  data: {
    stages: {
      INVITED: [],
      INITIATED: [],
      IN_PROGRESS: [],
      COMPLETED: [
        {
          id: 'vis-ar',
          workerId: 'worker-ar-001',
          workerName: 'María Gabriela Arena',
          workerPhone: '5491158908375',
          occupation: 'AT',
          interviewDate: '2026-04-08T12:00:00',
          interviewTime: '14:00',
          meetLink: null,
          resultado: null,
          attended: null,
          rejectionReasonCategory: null,
          rejectionReason: null,
          matchScore: 7.5,
          talentumStatus: 'QUALIFIED',
          workZone: 'Palermo',
          redireccionamiento: null,
        },
        {
          id: 'vis-br',
          workerId: 'worker-br-001',
          workerName: 'João Silva',
          workerPhone: '5511987654321',
          occupation: 'AT',
          interviewDate: null,
          interviewTime: null,
          meetLink: null,
          resultado: null,
          attended: null,
          rejectionReasonCategory: null,
          rejectionReason: null,
          matchScore: 8.2,
          talentumStatus: 'QUALIFIED',
          workZone: 'Belgrano',
          redireccionamiento: null,
        },
        {
          id: 'vis-generic',
          workerId: null,
          workerName: 'Jean Dupont',
          workerPhone: '33612345678',
          occupation: 'AT',
          interviewDate: null,
          interviewTime: null,
          meetLink: null,
          resultado: null,
          attended: null,
          rejectionReasonCategory: null,
          rejectionReason: null,
          matchScore: 6.0,
          talentumStatus: 'COMPLETED',
          workZone: null,
          redireccionamiento: null,
        },
      ],
      CONFIRMED: [
        {
          id: 'vis-confirmed-1',
          workerId: 'worker-conf-001',
          workerName: 'Gabriel Stein',
          workerPhone: '5491176614743',
          occupation: 'AT',
          interviewDate: '2026-04-15T12:00:00',
          interviewTime: '10:30',
          meetLink: 'https://meet.google.com/abc',
          resultado: null,
          attended: null,
          rejectionReasonCategory: null,
          rejectionReason: null,
          matchScore: 16.0,
          talentumStatus: null,
          workZone: 'Recoleta',
          redireccionamiento: null,
        },
        {
          id: 'vis-confirmed-2',
          workerId: 'worker-conf-002',
          workerName: 'Laura Méndez',
          workerPhone: '5491144332211',
          occupation: 'NURSE',
          interviewDate: '2026-04-16T12:00:00',
          interviewTime: null,
          meetLink: null,
          resultado: null,
          attended: null,
          rejectionReasonCategory: null,
          rejectionReason: null,
          matchScore: 12.5,
          talentumStatus: null,
          workZone: 'Palermo',
          redireccionamiento: null,
        },
      ],
      SELECTED: [],
      REJECTED: [],
    },
    totalEncuadres: 5,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function seedAdminAndLogin(page: Page): Promise<void> {
  const email = `e2e.kanban.visual.${Date.now()}@test.com`;
  const password = 'TestAdmin123!';

  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const { localId: uid } = (await signUpRes.json()) as any;

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
          firstName: 'Admin',
          lastName: 'Visual',
          isActive: true,
          mustChangePassword: false,
        },
      }),
    }),
  );

  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar sesión/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });
}

function mockVacancyApis(page: Page) {
  return Promise.all([
    page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_VACANCY }),
      }),
    ),
    page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}/funnel`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_FUNNEL),
      }),
    ),
  ]);
}

// ── Testes Visuais ──────────────────────────────────────────────────────

test.describe('Kanban — testes visuais (screenshot)', () => {
  test.setTimeout(60000);
  test.use({ viewport: { width: 1920, height: 1080 } });

  // ── 1. Formatação de telefone por país ────────────────────────────────

  test('telefone AR formatado como +54 9 XX XXXX-XXXX', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-ar"]')).toBeVisible({ timeout: 15000 });

    // Verifica texto formatado
    const card = page.locator('[data-testid="kanban-card-vis-ar"]');
    await expect(card.locator('text=+54 9 11 5890-8375')).toBeVisible();

    // Screenshot do card com telefone AR
    await expect(card).toHaveScreenshot('kanban-card-phone-ar.png');
  });

  test('telefone BR formatado como +55 (XX) XXXXX-XXXX', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-br"]')).toBeVisible({ timeout: 15000 });

    // Verifica texto formatado
    const card = page.locator('[data-testid="kanban-card-vis-br"]');
    await expect(card.locator('text=+55 (11) 98765-4321')).toBeVisible();

    // Screenshot do card com telefone BR
    await expect(card).toHaveScreenshot('kanban-card-phone-br.png');
  });

  test('telefone genérico formatado como +XXXXX', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-generic"]')).toBeVisible({ timeout: 15000 });

    // Verifica texto formatado
    const card = page.locator('[data-testid="kanban-card-vis-generic"]');
    await expect(card.locator('text=+33612345678')).toBeVisible();

    // Screenshot do card com telefone genérico
    await expect(card).toHaveScreenshot('kanban-card-phone-generic.png');
  });

  // ── 2. Nome clicável → navegação para worker detail ───────────────────

  test('nome do worker é clicável e navega para /admin/workers/:id', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    // Mock worker detail page to avoid 404
    await page.route('**/api/admin/workers/worker-ar-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'worker-ar-001', firstName: 'María Gabriela', lastName: 'Arena' } }),
      }),
    );

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-ar"]')).toBeVisible({ timeout: 15000 });

    // Screenshot antes do click — nome com estilo de link
    const card = page.locator('[data-testid="kanban-card-vis-ar"]');
    const nameButton = card.getByRole('button', { name: 'María Gabriela Arena' });
    await expect(nameButton).toBeVisible();

    await expect(card).toHaveScreenshot('kanban-card-clickable-name.png');

    // Click no nome navega para detalhe do worker
    await nameButton.click();
    await expect(page).toHaveURL(/\/admin\/workers\/worker-ar-001/, { timeout: 10000 });
  });

  test('nome NÃO é clicável quando workerId é null', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-generic"]')).toBeVisible({ timeout: 15000 });

    // Jean Dupont tem workerId: null — nome deve ser texto plain, sem button
    const card = page.locator('[data-testid="kanban-card-vis-generic"]');
    await expect(card.locator('text=Jean Dupont')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Jean Dupont' })).not.toBeVisible();

    // Screenshot do card sem link no nome
    await expect(card).toHaveScreenshot('kanban-card-non-clickable-name.png');
  });

  // ── 3. Tag de reunião na coluna Confirmados ───────────────────────────

  test('coluna Confirmados exibe tag com data e hora da reunião', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-confirmed-1"]')).toBeVisible({ timeout: 15000 });

    // Gabriel Stein — deve ter tag "15 abr 10:30"
    const card1 = page.locator('[data-testid="kanban-card-vis-confirmed-1"]');
    await expect(card1.locator('text=10:30')).toBeVisible();

    // Screenshot do card confirmado com tag de reunião (data + hora)
    await expect(card1).toHaveScreenshot('kanban-card-confirmed-meeting-tag.png');
  });

  test('tag de reunião mostra apenas data quando hora é null', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-confirmed-2"]')).toBeVisible({ timeout: 15000 });

    // Laura Méndez — interviewTime: null, deve mostrar apenas data
    const card2 = page.locator('[data-testid="kanban-card-vis-confirmed-2"]');
    await expect(card2.locator('text=abr')).toBeVisible();

    // Screenshot do card confirmado com tag de reunião (apenas data)
    await expect(card2).toHaveScreenshot('kanban-card-confirmed-date-only.png');
  });

  test('tag de reunião NÃO aparece na coluna Completado', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-ar"]')).toBeVisible({ timeout: 15000 });

    // María Gabriela Arena está em COMPLETED com interviewDate — NÃO deve ter tag cyan
    const card = page.locator('[data-testid="kanban-card-vis-ar"]');

    // Não deve conter o ícone CalendarClock (identificado pela tag cyan)
    const cyanTag = card.locator('.bg-cyan-50');
    await expect(cyanTag).not.toBeVisible();

    // Screenshot do card em Completado sem tag de reunião
    await expect(card).toHaveScreenshot('kanban-card-completed-no-meeting-tag.png');
  });

  // ── 4. Screenshot da coluna Confirmados completa ──────────────────────

  test('coluna Confirmados completa com tags de reunião visíveis', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-column-CONFIRMED"]')).toBeVisible({ timeout: 15000 });

    const confirmedColumn = page.locator('[data-testid="kanban-column-CONFIRMED"]');

    // Ambos os cards devem ter tag cyan
    await expect(confirmedColumn.locator('.bg-cyan-50')).toHaveCount(2);

    // Screenshot da coluna inteira
    await expect(confirmedColumn).toHaveScreenshot('kanban-column-confirmed-with-tags.png');
  });

  // ── 5. Screenshot panorâmico do Kanban completo ───────────────────────

  test('visão panorâmica do Kanban com todas as funcionalidades', async ({ page }) => {
    await seedAdminAndLogin(page);
    await mockVacancyApis(page);

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}/kanban`);
    await expect(page.locator('[data-testid="kanban-card-vis-ar"]')).toBeVisible({ timeout: 15000 });

    // Screenshot do board completo
    const board = page.locator('.flex.gap-3.overflow-x-auto');
    await expect(board).toHaveScreenshot('kanban-board-full-visual.png');
  });
});
