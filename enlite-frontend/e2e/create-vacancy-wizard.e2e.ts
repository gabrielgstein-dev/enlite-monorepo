/**
 * create-vacancy-wizard.e2e.ts — Playwright E2E
 *
 * Fase 7: Wizard de criação de vaga com steps bloqueantes de address + clash.
 *
 * Cenários cobertos:
 *   1. PDF com EXACT address match → step 1 (address) → step 2 (no clashes) → step 3 (vacancy data)
 *   2. PDF com clash de dependency_level → step 1 → step 2 (clash) → resolver → continuar
 *   3. PDF sem endereço → step 1 (no addresses) → dialog → criar novo endereço
 *
 * Todas as chamadas à API são mockadas via page.route(). Nenhum banco real.
 */

import { test, expect, type Page } from '@playwright/test';

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY = 'test-api-key';

// ── Shared mocked vacancy data ─────────────────────────────────────────────

const NEXT_VACANCY_NUMBER = { success: true, data: { nextVacancyNumber: 42 } };

const PARSE_FULL_EXACT = {
  success: true,
  data: {
    parsed: {
      vacancy: { case_number: 99, title: 'CASO 99-42', state: 'Buenos Aires', city: 'CABA', providers_needed: 1, service_device_types: ['Domiciliario'], schedule: [] },
      prescreening: { questions: [], faq: [] },
      description: { titulo_propuesta: 'Propuesta', descripcion_propuesta: 'Desc', perfil_profesional: 'Perfil' },
    },
    addressMatches: [
      {
        patient_address_id: 'addr-exact-1',
        addressFormatted: 'Av. Corrientes 1234, CABA',
        addressRaw: 'Corrientes 1234',
        confidence: 1,
        matchType: 'EXACT',
      },
    ],
    fieldClashes: [],
    patientId: 'pat-99',
  },
};

const PARSE_FULL_WITH_CLASH = {
  success: true,
  data: {
    ...PARSE_FULL_EXACT.data,
    fieldClashes: [
      {
        field: 'dependency_level',
        pdfValue: 'HIGH',
        patientValue: 'LOW',
        action: 'CLASH',
      },
    ],
  },
};

const PARSE_FULL_NO_ADDRESS = {
  success: true,
  data: {
    ...PARSE_FULL_EXACT.data,
    addressMatches: [],
    fieldClashes: [],
  },
};

const CREATE_ADDRESS_RESPONSE = {
  success: true,
  data: { id: 'addr-new-1', patient_id: 'pat-99', address_formatted: 'Florida 123, CABA' },
};

// ── Auth helper ────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page): Promise<void> {
  const email = `e2e.wizard.${Date.now()}@test.com`;
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

  // Mock auth profile before navigation so the app picks it up immediately
  await page.route('**/api/admin/auth/profile', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { id: uid, email, role: 'superadmin', firstName: 'Admin', lastName: 'E2E', isActive: true, mustChangePassword: false },
      }),
    }),
  );

  // Log in via the UI (same pattern as vacancy-kanban.e2e.ts)
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar sesión/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });
}

function mockCommonRoutes(page: Page) {
  page.route('**/api/admin/vacancies/next-vacancy-number', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NEXT_VACANCY_NUMBER) }),
  );
}

// ── Scenario 1: PDF with EXACT address, no clashes ─────────────────────────

test.describe('Scenario 1 — PDF with EXACT address match, no clashes', () => {
  test('wizard step 1 shows address card, Continue advances to step 2 (no clashes), then to step 3', async ({ page }) => {
    await loginAsAdmin(page);
    mockCommonRoutes(page);

    await page.route('**/api/admin/vacancies/parse', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARSE_FULL_EXACT) }),
    );

    await page.goto('/admin/vacancies/new');
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

    // Step 0: Upload PDF
    await page.getByText('Subir PDF').click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'caso-99.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 minimal'),
    });
    await expect(page.getByText('caso-99.pdf')).toBeVisible();
    await page.getByText('Analizar con IA').click();

    // Step 1: Address selector should appear
    await expect(page.getByText('Confirmar domicilio del paciente')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Av. Corrientes 1234, CABA')).toBeVisible();
    await expect(page.getByText('Exacto')).toBeVisible();

    // Screenshot of step 1 with address card
    await expect(page).toHaveScreenshot('create-vacancy-scenario1-step1.png', { fullPage: false });

    // Continue is disabled before selecting address
    const continueBtn = page.getByRole('button', { name: 'Continuar' });
    await expect(continueBtn).toBeDisabled();

    // Select the address card
    await page.getByText('Av. Corrientes 1234, CABA').click();
    await expect(continueBtn).not.toBeDisabled();

    // Go to step 2 (clash resolver — no clashes)
    await continueBtn.click();
    await expect(page.getByText('Revisar datos del paciente')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No hay conflictos con los datos del paciente.')).toBeVisible();

    // Screenshot of step 2 with no clashes
    await expect(page).toHaveScreenshot('create-vacancy-scenario1-step2-no-clashes.png', { fullPage: false });

    // Continue to step 3
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Datos de la Vacante')).toBeVisible({ timeout: 5000 });

    // Screenshot of step 3 (vacancy data form)
    await expect(page).toHaveScreenshot('create-vacancy-scenario1-step3.png', { fullPage: false });
  });
});

// ── Scenario 2: PDF with clash ─────────────────────────────────────────────

test.describe('Scenario 2 — PDF with dependency_level clash', () => {
  test('step 2 shows clash; Continue disabled until resolved', async ({ page }) => {
    await loginAsAdmin(page);
    mockCommonRoutes(page);

    await page.route('**/api/admin/vacancies/parse', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARSE_FULL_WITH_CLASH) }),
    );

    await page.goto('/admin/vacancies/new');
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

    // Upload PDF
    await page.getByText('Subir PDF').click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'caso-clash.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF minimal'),
    });
    await page.getByText('Analizar con IA').click();

    // Step 1: Select address
    await expect(page.getByText('Confirmar domicilio del paciente')).toBeVisible({ timeout: 10000 });
    await page.getByText('Av. Corrientes 1234, CABA').click();
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Step 2: Clash resolver
    await expect(page.getByText('Revisar datos del paciente')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('HIGH')).toBeVisible();
    await expect(page.getByText('LOW')).toBeVisible();

    // Screenshot of step 2 with clash visible
    await expect(page).toHaveScreenshot('create-vacancy-scenario2-step2-with-clash.png', { fullPage: false });

    // Continue is disabled before resolving
    const continueBtn = page.getByRole('button', { name: 'Continuar' });
    await expect(continueBtn).toBeDisabled();

    // Click "Mantener paciente"
    await page.getByText('Mantener paciente').click();
    await expect(continueBtn).not.toBeDisabled();

    // Screenshot after resolving
    await expect(page).toHaveScreenshot('create-vacancy-scenario2-step2-resolved.png', { fullPage: false });
  });
});

// ── Scenario 3: No addresses → create new ─────────────────────────────────

test.describe('Scenario 3 — PDF with no address matches → create new', () => {
  test('shows no-addresses message; dialog allows creating new address', async ({ page }) => {
    await loginAsAdmin(page);
    mockCommonRoutes(page);

    await page.route('**/api/admin/vacancies/parse', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARSE_FULL_NO_ADDRESS) }),
    );

    await page.route('**/api/admin/patients/*/addresses', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CREATE_ADDRESS_RESPONSE) }),
    );

    await page.goto('/admin/vacancies/new');
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

    // Upload PDF
    await page.getByText('Subir PDF').click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'caso-no-addr.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF minimal'),
    });
    await page.getByText('Analizar con IA').click();

    // Step 1: No addresses found message
    await expect(page.getByText('No se encontraron domicilios del paciente.')).toBeVisible({ timeout: 10000 });

    // Screenshot of step 1 with no addresses
    await expect(page).toHaveScreenshot('create-vacancy-scenario3-step1-no-addresses.png', { fullPage: false });

    // Dialog should auto-open; if not, click the button
    const dialog = page.getByRole('dialog');
    if (!(await dialog.isVisible())) {
      await page.getByText('Crear nuevo domicilio').click();
    }
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Screenshot of dialog
    await expect(page).toHaveScreenshot('create-vacancy-scenario3-dialog.png', { fullPage: false });

    // Fill in the address
    const addressInput = dialog.locator('input[placeholder="Av. Corrientes 1234, CABA"]');
    await addressInput.fill('Florida 123, CABA');

    // Save
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    // After saving, address is selected and Continue is enabled
    await expect(page.getByText('Florida 123, CABA')).toBeVisible({ timeout: 5000 });
    const continueBtn = page.getByRole('button', { name: 'Continuar' });
    await expect(continueBtn).not.toBeDisabled();

    // Screenshot after address created and selected
    await expect(page).toHaveScreenshot('create-vacancy-scenario3-step1-after-create.png', { fullPage: false });
  });
});
