/**
 * profile-completion-card.e2e.ts
 *
 * Testes E2E visuais para o ProfileCompletionCard.
 * Verifica que TODOS os itens estão presentes e visíveis na tela,
 * tanto no desktop (1280×800) quanto no mobile (390×844).
 *
 * API mockada via page.route() — não requer Docker stack.
 * Usa o storageState de autenticação configurado em playwright.config.ts.
 */

import { test, expect, Page } from '@playwright/test';

// ── Labels exatos conforme es.json ──────────────────────────────────────────

const CARD_TITLE         = 'Complete su Perfil Profesional';
const SECTION_REGISTRO   = 'Registro Básico';
const SECTION_DOCUMENTOS = 'Documentos Profesionales';

const STEP_LABELS = [
  'Información General',
  'Dirección de Atención',
  'Disponibilidad',
  'Cargue su currículum en PDF',
  'Cargue su DNI en PDF',
  'Cargue sus antecedentes penales en PDF',
  'Cargue su constancia de registro en AFIP en PDF',
  'Cargue su póliza de seguro de responsabilidad civil en PDF',
] as const;

const BTN_COMPLETAR = 'Completar Registro';

// ── Mocks de API ─────────────────────────────────────────────────────────────

/** Worker com perfil vazio — garante que o card apareça com todas as seções */
const EMPTY_WORKER_MOCK = {
  id: 'test-worker-id',
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

const EMPTY_DOCUMENTS_MOCK = {
  id: 'test-docs-id',
  workerId: 'test-worker-id',
  resumeCvUrl: null,
  identityDocumentUrl: null,
  criminalRecordUrl: null,
  professionalRegistrationUrl: null,
  liabilityInsuranceUrl: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function mockApis(page: Page): Promise<void> {
  // Mock GET /api/workers/me — retorna worker com perfil vazio
  await page.route('**/api/workers/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: EMPTY_WORKER_MOCK }),
    });
  });

  // Mock GET /api/workers/me/documents — retorna sem documentos
  await page.route('**/api/workers/me/documents', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: EMPTY_DOCUMENTS_MOCK }),
    });
  });
}

async function navigateToHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

async function assertCardVisible(page: Page): Promise<void> {
  await expect(page.getByTestId('profile-completion-card')).toBeVisible();
}

async function assertTitleAndPercentage(page: Page): Promise<void> {
  await expect(page.getByTestId('profile-completion-title')).toContainText(CARD_TITLE);
  await expect(page.getByTestId('overall-percentage')).toContainText('0%');
}

async function assertSectionsVisible(page: Page): Promise<void> {
  await expect(page.getByTestId('section-registration')).toBeVisible();
  await expect(page.getByText(SECTION_REGISTRO)).toBeVisible();

  await expect(page.getByTestId('section-documents')).toBeVisible();
  await expect(page.getByText(SECTION_DOCUMENTOS)).toBeVisible();
}

async function assertAllStepsVisible(page: Page): Promise<void> {
  for (const label of STEP_LABELS) {
    await expect(page.getByText(label)).toBeVisible();
  }
}

async function assertActionButton(page: Page): Promise<void> {
  await expect(page.getByText(BTN_COMPLETAR)).toBeVisible();
}

async function assertAllItemsVisible(page: Page): Promise<void> {
  await assertCardVisible(page);
  await assertTitleAndPercentage(page);
  await assertSectionsVisible(page);
  await assertAllStepsVisible(page);
  await assertActionButton(page);
}

// ── Testes ───────────────────────────────────────────────────────────────────

test.describe('ProfileCompletionCard — presença visual', () => {
  test.describe('desktop (1280×800)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await mockApis(page);
      await navigateToHome(page);
    });

    test('card principal está visível', async ({ page }) => {
      await assertCardVisible(page);
    });

    test('título e percentual geral estão visíveis', async ({ page }) => {
      await assertTitleAndPercentage(page);
    });

    test('seção Registro Básico (0/3) está visível', async ({ page }) => {
      await expect(page.getByTestId('section-registration')).toBeVisible();
      await expect(page.getByText(SECTION_REGISTRO)).toBeVisible();
      await expect(page.getByText('(0/3)')).toBeVisible();
    });

    test('seção Documentos Profesionales (0/5) está visível', async ({ page }) => {
      await expect(page.getByTestId('section-documents')).toBeVisible();
      await expect(page.getByText(SECTION_DOCUMENTOS)).toBeVisible();
      await expect(page.getByText('(0/5)')).toBeVisible();
    });

    test('steps de Registro Básico estão visíveis', async ({ page }) => {
      await expect(page.getByText('Información General')).toBeVisible();
      await expect(page.getByText('Dirección de Atención')).toBeVisible();
      await expect(page.getByText('Disponibilidad')).toBeVisible();
    });

    test('steps de Documentos Profesionales estão visíveis', async ({ page }) => {
      await expect(page.getByText('Cargue su currículum en PDF')).toBeVisible();
      await expect(page.getByText('Cargue su DNI en PDF')).toBeVisible();
      await expect(page.getByText('Cargue sus antecedentes penales en PDF')).toBeVisible();
      await expect(page.getByText('Cargue su constancia de registro en AFIP en PDF')).toBeVisible();
      await expect(page.getByText('Cargue su póliza de seguro de responsabilidad civil en PDF')).toBeVisible();
    });

    test('botão Completar Registro está visível', async ({ page }) => {
      await assertActionButton(page);
    });

    test('todos os itens visíveis — snapshot completo', async ({ page }) => {
      await assertAllItemsVisible(page);
    });
  });

  test.describe('mobile (390×844)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockApis(page);
      await navigateToHome(page);
    });

    test('card principal está visível', async ({ page }) => {
      await assertCardVisible(page);
    });

    test('título e percentual geral estão visíveis', async ({ page }) => {
      await assertTitleAndPercentage(page);
    });

    test('seção Registro Básico (0/3) está visível', async ({ page }) => {
      await expect(page.getByTestId('section-registration')).toBeVisible();
      await expect(page.getByText(SECTION_REGISTRO)).toBeVisible();
      await expect(page.getByText('(0/3)')).toBeVisible();
    });

    test('seção Documentos Profesionales (0/5) está visível', async ({ page }) => {
      await expect(page.getByTestId('section-documents')).toBeVisible();
      await expect(page.getByText(SECTION_DOCUMENTOS)).toBeVisible();
      await expect(page.getByText('(0/5)')).toBeVisible();
    });

    test('steps de Registro Básico estão visíveis', async ({ page }) => {
      await expect(page.getByText('Información General')).toBeVisible();
      await expect(page.getByText('Dirección de Atención')).toBeVisible();
      await expect(page.getByText('Disponibilidad')).toBeVisible();
    });

    test('steps de Documentos Profesionales estão visíveis — scroll se necessário', async ({ page }) => {
      await expect(page.getByText('Cargue su currículum en PDF')).toBeVisible();
      await expect(page.getByText('Cargue su DNI en PDF')).toBeVisible();
      await expect(page.getByText('Cargue sus antecedentes penales en PDF')).toBeVisible();
      await expect(page.getByText('Cargue su constancia de registro en AFIP en PDF')).toBeVisible();
      await expect(page.getByText('Cargue su póliza de seguro de responsabilidad civil en PDF')).toBeVisible();
    });

    test('botão Completar Registro está visível', async ({ page }) => {
      await assertActionButton(page);
    });

    test('todos os itens visíveis — snapshot completo', async ({ page }) => {
      await assertAllItemsVisible(page);
    });
  });
});
