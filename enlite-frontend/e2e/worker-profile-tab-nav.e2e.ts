/**
 * worker-profile-tab-nav.e2e.ts
 *
 * Testes E2E para navegação entre tabs do perfil do worker.
 *
 * Cobre:
 *   - Layout desktop: barra horizontal visível, carousel oculto
 *   - Layout mobile: carousel visível, barra horizontal oculta
 *   - Navegação mobile: avançar por todas as tabs com "próxima"
 *   - Navegação mobile: voltar da última tab até a primeira
 *   - Estados dos botões: desabilitado na primeira e última tab
 *   - Consistência: tab ativa no desktop espelha a navegação mobile
 *
 * API mockada via page.route() — não requer Docker stack.
 */

import { test, expect, Page } from '@playwright/test';

// Worker auth — gerado pelo auth.setup.ts (REST no Firebase Emulator)
test.use({ storageState: 'e2e/.auth/profile-worker.json' });

// ── Constantes ────────────────────────────────────────────────────────────────

const PROFILE_ROUTE = '/worker/profile';

const TAB_LABELS = [
  'Información General',
  'Dirección de Atención',
  'Disponibilidad',
  'Documentos',
] as const;

// Worker mínimo para evitar tela de erro/redirect
const MOCK_WORKER = {
  id: 'test-id',
  authUid: 'test-uid',
  email: 'test@enlite-test.com',
  currentStep: 1,
  status: 'pending',
  registrationCompleted: false,
  country: 'AR',
  timezone: 'America/Argentina/Buenos_Aires',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_DOCUMENTS = {
  id: 'test-docs-id',
  workerId: 'test-id',
  resumeCvUrl: null,
  identityDocumentUrl: null,
  criminalRecordUrl: null,
  professionalRegistrationUrl: null,
  liabilityInsuranceUrl: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockApis(page: Page): Promise<void> {
  await page.route('**/api/workers/me', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_WORKER }),
    });
  });

  await page.route('**/api/workers/me/documents', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_DOCUMENTS }),
    });
  });
}

async function goToProfile(page: Page): Promise<void> {
  await page.goto(PROFILE_ROUTE);
  await page.waitForLoadState('networkidle');
  // Aguarda o spinner de inicialização desaparecer
  await expect(page.getByTestId('tab-mobile-nav').or(page.getByTestId('tab-desktop-nav'))).toBeVisible({ timeout: 10_000 });
}

// ── Suite: Layout ─────────────────────────────────────────────────────────────

test.describe('Layout das tabs', () => {
  test('desktop (1280×800) — barra horizontal visível, carousel oculto', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApis(page);
    await goToProfile(page);

    await expect(page.getByTestId('tab-desktop-nav')).toBeVisible();
    await expect(page.getByTestId('tab-mobile-nav')).not.toBeVisible();
  });

  test('desktop — todas as 4 tabs aparecem na barra', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApis(page);
    await goToProfile(page);

    for (const label of TAB_LABELS) {
      await expect(page.getByTestId('tab-desktop-nav').getByText(label)).toBeVisible();
    }
  });

  test('mobile (390×844) — carousel visível, barra horizontal oculta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApis(page);
    await goToProfile(page);

    await expect(page.getByTestId('tab-mobile-nav')).toBeVisible();
    await expect(page.getByTestId('tab-desktop-nav')).not.toBeVisible();
  });

  test('mobile — exibe botões de navegação e label da tab atual', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApis(page);
    await goToProfile(page);

    await expect(page.getByTestId('tab-prev')).toBeVisible();
    await expect(page.getByTestId('tab-next')).toBeVisible();
    await expect(page.getByTestId('tab-current-label')).toBeVisible();
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[0]);
  });
});

// ── Suite: Navegação mobile ───────────────────────────────────────────────────

test.describe('Navegação mobile — avançar por todas as tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApis(page);
    await goToProfile(page);
  });

  test('começa na primeira tab (Información General)', async ({ page }) => {
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[0]);
  });

  test('botão anterior está desabilitado na primeira tab', async ({ page }) => {
    await expect(page.getByTestId('tab-prev')).toBeDisabled();
  });

  test('avança para Dirección de Atención ao clicar em próxima', async ({ page }) => {
    await page.getByTestId('tab-next').click();
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[1]);
  });

  test('avança para Disponibilidad', async ({ page }) => {
    await page.getByTestId('tab-next').click();
    await page.getByTestId('tab-next').click();
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[2]);
  });

  test('avança até Documentos (última tab)', async ({ page }) => {
    for (let i = 0; i < TAB_LABELS.length - 1; i++) {
      await page.getByTestId('tab-next').click();
    }
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[3]);
  });

  test('botão próxima está desabilitado na última tab', async ({ page }) => {
    for (let i = 0; i < TAB_LABELS.length - 1; i++) {
      await page.getByTestId('tab-next').click();
    }
    await expect(page.getByTestId('tab-next')).toBeDisabled();
  });
});

// ── Suite: Navegação mobile — volta completa ──────────────────────────────────

test.describe('Navegação mobile — ciclo completo (avança e volta)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApis(page);
    await goToProfile(page);
  });

  test('avança até a última tab e volta até a primeira sem bugs', async ({ page }) => {
    // Avança por todas as tabs
    for (let i = 0; i < TAB_LABELS.length - 1; i++) {
      await page.getByTestId('tab-next').click();
      await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[i + 1]);
    }

    // Confirma que está na última
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[TAB_LABELS.length - 1]);
    await expect(page.getByTestId('tab-next')).toBeDisabled();

    // Volta por todas as tabs
    for (let i = TAB_LABELS.length - 1; i > 0; i--) {
      await page.getByTestId('tab-prev').click();
      await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[i - 1]);
    }

    // Confirma que voltou à primeira
    await expect(page.getByTestId('tab-current-label')).toContainText(TAB_LABELS[0]);
    await expect(page.getByTestId('tab-prev')).toBeDisabled();
  });

  test('label atualiza corretamente em cada passo do ciclo', async ({ page }) => {
    for (const label of TAB_LABELS) {
      await expect(page.getByTestId('tab-current-label')).toContainText(label);
      if (label !== TAB_LABELS[TAB_LABELS.length - 1]) {
        await page.getByTestId('tab-next').click();
      }
    }
  });
});

// ── Suite: Desktop — navegação por clique direto ──────────────────────────────

test.describe('Navegação desktop — clique direto nas tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApis(page);
    await goToProfile(page);
  });

  test('primeira tab ativa por padrão', async ({ page }) => {
    const firstTab = page.getByTestId('tab-btn-general');
    await expect(firstTab).toHaveAttribute('aria-current', 'page');
  });

  test('clicar em Dirección de Atención ativa essa tab', async ({ page }) => {
    await page.getByTestId('tab-btn-address').click();
    await expect(page.getByTestId('tab-btn-address')).toHaveAttribute('aria-current', 'page');
  });

  test('clicar em Disponibilidad ativa essa tab', async ({ page }) => {
    await page.getByTestId('tab-btn-availability').click();
    await expect(page.getByTestId('tab-btn-availability')).toHaveAttribute('aria-current', 'page');
  });

  test('clicar em Documentos ativa essa tab', async ({ page }) => {
    await page.getByTestId('tab-btn-documents').click();
    await expect(page.getByTestId('tab-btn-documents')).toHaveAttribute('aria-current', 'page');
  });
});
