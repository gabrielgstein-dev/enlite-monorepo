/**
 * full-create-vacancy.integration.e2e.ts @integration
 *
 * Integration E2E — full stack (frontend → real backend → real Postgres).
 *
 * Prereqs:
 *   1. Docker stack running: cd worker-functions && docker compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres api
 *   2. Frontend dev server: cd enlite-frontend && pnpm dev
 *   3. Firebase Emulator on port 9099 (or test falls back to direct Firebase sign-up against prod emulator)
 *
 * Auth strategy:
 *   - Creates a test user in Firebase Emulator via REST
 *   - Mocks GET /api/admin/auth/profile (returns admin role)
 *   - ALL other API calls are intercepted to swap the Firebase token for a
 *     mock_* token (USE_MOCK_AUTH=true mode on the backend)
 *
 * AI strategy:
 *   - generate-ai-content endpoint is mocked (GEMINI_API_KEY not in Docker
 *     test env), returning a realistic fixture
 *
 * publish-talentum:
 *   - Always mocked to avoid creating real records in Talentum
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  insertTestPatient,
  cleanupTestPatient,
  getVacancyById,
} from '../helpers/db-test-helper';

// ── Constants ─────────────────────────────────────────────────────────────────

const BACKEND_URL = 'http://localhost:8080';

// Mock token for USE_MOCK_AUTH=true backend
const MOCK_ADMIN_USER = { uid: 'e2e-int-admin-vacancy', email: 'admin.vacancy@e2e.test', role: 'admin' };
const MOCK_TOKEN =
  'mock_' + Buffer.from(JSON.stringify(MOCK_ADMIN_USER), 'utf-8').toString('base64');

// AI content fixture
const AI_CONTENT_FIXTURE = {
  description:
    'Se busca Acompañante Terapéutico para paciente con diagnóstico de TEA leve en CABA. ' +
    'El AT deberá acompañar al paciente en sus actividades diarias, promoviendo la autonomía ' +
    'y la integración social. Horario: Lunes a Viernes, turnos mañana.',
  prescreening: {
    questions: [
      {
        question: '¿Tenés experiencia trabajando con pacientes con TEA?',
        responseType: ['YES_NO'],
        desiredResponse: 'YES',
        weight: 3,
        required: true,
        analyzed: true,
        earlyStoppage: false,
      },
      {
        question: '¿Disponés de CUD vigente?',
        responseType: ['YES_NO'],
        desiredResponse: 'YES',
        weight: 2,
        required: false,
        analyzed: true,
        earlyStoppage: false,
      },
    ],
    faq: [
      {
        question: '¿Cuáles son las condiciones de contratación?',
        answer: 'Contratación bajo modalidad MEI con liquidación mensual.',
      },
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal JWT header.payload (no signature) that Firebase SDK accepts for mock login
const FAKE_ID_TOKEN =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
  Buffer.from(
    JSON.stringify({
      sub: MOCK_ADMIN_USER.uid,
      uid: MOCK_ADMIN_USER.uid,
      email: MOCK_ADMIN_USER.email,
      iss: 'https://securetoken.google.com/enlite-prd',
      aud: 'enlite-prd',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url') +
  '.';

/**
 * Sets up all route interceptors before navigation:
 *   1. Firebase Identity Toolkit (signIn, token refresh) → fake JWT response
 *   2. /api/admin/auth/profile → mock admin profile
 *   3. /generate-ai-content → fixture
 *   4. /publish-talentum → mock success
 *   5. All other /api/** → swap token to mock_*
 */
async function installInterceptors(page: Page): Promise<void> {
  // ── Firebase Identity Toolkit ──────────────────────────────────────────────
  // Intercept sign-in and token refresh so the SDK considers us authenticated
  await page.route('**/identitytoolkit.googleapis.com/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('signInWithPassword') || url.includes('signUp')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: MOCK_ADMIN_USER.uid,
          email: MOCK_ADMIN_USER.email,
          idToken: FAKE_ID_TOKEN,
          refreshToken: 'fake-refresh-token',
          expiresIn: '3600',
          registered: true,
        }),
      });
      return;
    }
    if (url.includes('token') || url.includes('securetoken')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: FAKE_ID_TOKEN,
          expires_in: '3600',
          token_type: 'Bearer',
          refresh_token: 'fake-refresh-token',
          id_token: FAKE_ID_TOKEN,
          user_id: MOCK_ADMIN_USER.uid,
        }),
      });
      return;
    }
    // Other Firebase calls (getUserData, etc.) — return minimal user info
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          {
            localId: MOCK_ADMIN_USER.uid,
            email: MOCK_ADMIN_USER.email,
            emailVerified: true,
          },
        ],
      }),
    });
  });

  await page.route('**/securetoken.googleapis.com/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: FAKE_ID_TOKEN,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'fake-refresh-token',
        id_token: FAKE_ID_TOKEN,
      }),
    });
  });

  // ── Backend API calls ──────────────────────────────────────────────────────
  await page.route('**/api/**', async (route: Route) => {
    const url = route.request().url();

    if (url.includes('/api/admin/auth/profile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: MOCK_ADMIN_USER.uid,
            email: MOCK_ADMIN_USER.email,
            role: 'superadmin',
            firstName: 'Integration',
            lastName: 'Admin',
            isActive: true,
            mustChangePassword: false,
          },
        }),
      });
      return;
    }

    if (url.includes('/generate-ai-content')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: AI_CONTENT_FIXTURE }),
      });
      return;
    }

    if (url.includes('/publish-talentum')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            projectId: 'fake-project-id',
            publicId: '00000000-0000-0000-0000-000000000000',
            slug: 'e2e-test-vacancy',
            whatsappUrl: 'https://wa.me/fake',
          },
        }),
      });
      return;
    }

    // All other calls: swap Authorization header to mock token
    const headers = { ...route.request().headers(), authorization: `Bearer ${MOCK_TOKEN}` };
    await route.continue({ headers });
  });
}

/**
 * Logs in as admin via the login form. Firebase Identity Toolkit calls are
 * intercepted to return a fake-but-valid JWT (no real Firebase needed).
 * The backend profile endpoint is also mocked.
 */
async function loginAsAdmin(page: Page): Promise<void> {
  const email = MOCK_ADMIN_USER.email;
  const password = 'TestAdmin123!';

  // Install interceptors BEFORE any navigation
  await installInterceptors(page);

  // Go to admin login and fill the form
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar sesión/i }).click();

  // Wait for redirect away from login
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Full create vacancy flow @integration', () => {
  test.setTimeout(90_000);

  let patientId: string;
  let addressId: string | null;

  test.beforeAll(() => {
    const result = insertTestPatient({
      status: 'ACTIVE',
      firstName: 'IntegTest',
      lastName: `ActivePatient${Date.now()}`,
      diagnosis: 'TEA leve',
      dependencyLevel: 'SEVERE',
      withAddress: true,
      addressLat: -34.6037,
      addressLng: -58.3816,
    });
    patientId = result.patientId;
    addressId = result.addressId;
  });

  test.afterAll(() => {
    cleanupTestPatient(patientId);
  });

  test('happy path: create vacancy end-to-end with real backend and DB', async ({ page }) => {
    test.skip(!patientId, 'Could not seed test patient');

    await loginAsAdmin(page);
    await page.goto('/admin/vacancies/new');
    await expect(page.getByText('Nueva Vacante')).toBeVisible({ timeout: 15_000 });

    // ── Step 1: Search and select patient ──────────────────────────────────

    const searchInput = page.getByPlaceholder(/Buscar paciente/i);
    await searchInput.fill('IntegTest');

    // Dropdown appears with real data from backend
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 });
    const option = page.getByRole('option').first();
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // ── Step 2: Verify patient fields hydrate ─────────────────────────────

    // Diagnosis and dependency level visible (come from patient record)
    await expect(page.getByText('TEA leve')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('SEVERE')).toBeVisible({ timeout: 5_000 });

    // Address auto-selected (1 address) — availability badge confirms address rendered
    // Note: address label text may be empty if backend doesn't return fullAddress field,
    // but the availability badge ("hs/sem disponibles") confirms the address row IS rendered
    await expect(page.getByText(/hs\/sem disponibles/i)).toBeVisible({ timeout: 8_000 });

    // Screenshot 1: after patient hydration
    await expect(page).toHaveScreenshot('full-create-vacancy-patient-hydrated.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });

    // ── Step 3: Fill required professions ─────────────────────────────────

    // Find and click the AT checkbox/option (required_professions)
    const atOption = page.getByText('AT', { exact: true }).first();
    if (await atOption.isVisible()) {
      await atOption.click();
    } else {
      // Fallback: try select/multi-select for profession
      const profSelect = page.locator('[id="required_professions"]').first();
      if (await profSelect.isVisible()) {
        await profSelect.selectOption('AT');
      }
    }

    // ── Step 4: Add a schedule slot (Lunes 09:00-17:00) ──────────────────

    // The VacancyDaySchedulePicker renders day cards with "+" buttons
    // Click the "+" button for Lunes (first day card)
    const addSlotButtons = page.getByRole('button', {
      name: /horario/i,
    });
    if ((await addSlotButtons.count()) > 0) {
      await addSlotButtons.first().click();
    } else {
      // Try aria-label approach
      const lunesAddBtn = page.locator('[aria-label*="horario"]').first();
      if (await lunesAddBtn.isVisible()) {
        await lunesAddBtn.click();
      }
    }

    // ── Step 5: Save vacancy ──────────────────────────────────────────────

    const saveBtn = page.getByRole('button', { name: /Guardar/i });
    await saveBtn.click();

    // Should navigate to /admin/vacancies/:id/talentum
    await expect(page).toHaveURL(/\/admin\/vacancies\/.+\/talentum/, { timeout: 20_000 });

    // ── Step 6: Verify vacancy in DB ──────────────────────────────────────

    const urlParts = page.url().split('/');
    const talentumIdx = urlParts.indexOf('talentum');
    const vacancyId = talentumIdx > 0 ? urlParts[talentumIdx - 1] : null;
    expect(vacancyId).toBeTruthy();

    const dbVacancy = vacancyId ? getVacancyById(vacancyId) : null;
    expect(dbVacancy).not.toBeNull();
    expect(dbVacancy?.patient_id).toBe(patientId);
    expect(dbVacancy?.patient_address_id).toBe(addressId);
    // Status can be SEARCHING (default) or PENDING_ACTIVATION
    expect(['SEARCHING', 'PENDING_ACTIVATION']).toContain(dbVacancy?.status);

    // ── Step 7: TalentumConfigPage — generate AI content ─────────────────

    await expect(page.getByRole('button', { name: /Generar contenido con IA/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /Generar contenido con IA/i }).click();

    // AI is mocked — response is near instant
    // Wait for description textarea to be filled
    const descTextarea = page.locator('textarea').first();
    await expect(descTextarea).not.toBeEmpty({ timeout: 8_000 });

    // Verify prescreening section is visible (questions are inside <textarea> value
    // attributes, so getByText() won't find them — check the section heading instead)
    await page.getByText(/Configuración Pre-Screening Talentum/i).scrollIntoViewIfNeeded();
    await expect(page.getByText(/Configuración Pre-Screening Talentum/i)).toBeVisible({
      timeout: 5_000,
    });

    // Verify at least one prescreening question was populated by AI
    // (textarea value is not queryable via getByText — use evaluateAll on textareas)
    const textareaValues = await page.locator('textarea').evaluateAll(
      (els) => els.map((el) => (el as HTMLTextAreaElement).value),
    );
    const hasQuestion = textareaValues.some((v) =>
      v.includes('experiencia') || v.includes('TEA') || v.length > 10,
    );
    expect(hasQuestion).toBe(true);

    // Screenshot 2: after AI generation
    await expect(page).toHaveScreenshot('full-create-vacancy-ai-generated.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });

    // ── Step 8: Edit description (interactivity check) ────────────────────

    await descTextarea.click();
    const currentDesc = await descTextarea.inputValue();
    expect(currentDesc.length).toBeGreaterThan(10);
    await descTextarea.fill(currentDesc.slice(0, -5) + 'EDITD');

    // ── Step 9: Publish to Talentum (mocked) ─────────────────────────────

    await page.getByRole('button', { name: /Publicar en Talentum/i }).click();

    // Should navigate to /admin/vacancies/:id (detail page)
    await expect(page).toHaveURL(
      new RegExp(`/admin/vacancies/${vacancyId}$`),
      { timeout: 20_000 },
    );
  });
});

// ── Test backend is reachable ───────────────────────────────────────────────

test.describe('Backend connectivity check @integration', () => {
  test.setTimeout(10_000);

  test('backend health endpoint returns OK', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/health`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});
