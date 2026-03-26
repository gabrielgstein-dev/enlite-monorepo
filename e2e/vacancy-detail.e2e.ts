/**
 * vacancy-detail.e2e.ts
 *
 * Playwright E2E — Tela de Detalhe da Vaga (/admin/vacancies/:id)
 *
 * Fluxo coberto:
 *   - Navegar de /admin/vacancies para detalhe ao clicar na linha
 *   - Exibir case number, status, dados do paciente
 *   - Campos LLM exibem badge "LLM parseado" quando enriquecidos
 *   - Botão "Ver Match" navega para /admin/vacancies/:id/match
 */

import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';

const FIREBASE_EMULATOR = 'http://localhost:9099';
const FIREBASE_API_KEY  = 'test-api-key';
const API_URL           = 'http://localhost:8080';

// ── Fixtures de dados mockados ────────────────────────────────────────────

const MOCK_VACANCY_ID = 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa';

const MOCK_VACANCY = {
  id: MOCK_VACANCY_ID,
  case_number: 11001,
  title: 'Caso 11001 — Paciente Teste',
  status: 'BUSQUEDA',
  country: 'Argentina',
  service_start_date: '2026-04-01',
  providers_needed: 2,
  worker_profile_sought: 'AT con experiencia en adultos mayores',
  schedule_days_hours: 'Lunes a Viernes 08-16hs',
  patient_id: null,
  patient_first_name: 'Paciente',
  patient_last_name: 'Teste',
  patient_zone: 'Palermo',
  insurance_verified: false,
  llm_required_profession: ['Acompañante Terapéutico', 'Enfermero'],
  llm_required_specialties: ['TEA'],
  llm_required_diagnoses: ['TEA leve'],
  llm_required_sex: 'Indistinto',
  llm_parsed_schedule: {
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    shifts: ['Mañana'],
    interpretation: 'Turno completo de mañana',
  },
  llm_enriched_at: '2026-03-20T10:00:00Z',
  encuadres: [],
  publications: [],
};

const MOCK_VACANCIES_LIST = {
  success: true,
  data: [
    {
      id: MOCK_VACANCY_ID,
      case_number: 11001,
      title: 'Caso 11001 — Paciente Teste',
      status: 'BUSQUEDA',
      country: 'Argentina',
      providers_needed: 2,
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function seedAdminAndLogin(page: Page): Promise<{ email: string; token: string }> {
  const email    = `e2e.vacancy.detail.${Date.now()}@test.com`;
  const password = 'TestAdmin123!';

  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const { localId: uid, idToken: token } = (await signUpRes.json()) as any;

  // Seed Postgres
  const sql = `
    INSERT INTO users (id, email, name, created_at, updated_at) VALUES ('${uid}', '${email}', 'Admin E2E', NOW(), NOW()) ON CONFLICT DO NOTHING;
    INSERT INTO admins_extension (user_id, role, is_active, must_change_password, created_at, updated_at) VALUES ('${uid}', 'superadmin', true, false, NOW(), NOW()) ON CONFLICT DO NOTHING;
  `.replace(/\n/g, ' ').trim();

  try {
    execSync(`docker exec enlite-postgres psql -U enlite_admin -d enlite_e2e -c "${sql}"`, { stdio: 'pipe' });
  } catch {
    // ignora se Postgres não disponível — mock abaixo
  }

  // Mock profile — deve seguir o envelope { success: true, data: {...} }
  await page.route('**/api/admin/auth/profile', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: uid, email, role: 'superadmin',
          firstName: 'Admin', lastName: 'Test',
          isActive: true, mustChangePassword: false,
        },
      }),
    }),
  );

  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar|Entrar/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });

  return { email, token };
}

// ── Testes ────────────────────────────────────────────────────────────────

test.describe('VacancyDetailPage', () => {
  test.setTimeout(60000);

  test('navega de /admin/vacancies para detalhe ao clicar na linha', async ({ page }) => {
    await seedAdminAndLogin(page);

    // Mock API calls
    await page.route('**/api/admin/vacancies?**', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_VACANCIES_LIST),
      }),
    );
    await page.route('**/api/admin/vacancies/stats', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    );
    await page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_VACANCY }),
      }),
    );

    await page.goto('/admin/vacancies');
    await expect(page.locator(`text=11001`).first()).toBeVisible({ timeout: 15000 });

    // Clica na linha da vaga
    await page.locator(`text=11001`).first().click();

    // Verifica que navegou para o detalhe
    await expect(page).toHaveURL(new RegExp(`/admin/vacancies/${MOCK_VACANCY_ID}`), { timeout: 10000 });
  });

  test('exibe case number e status badge na tela de detalhe', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_VACANCY }),
      }),
    );

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}`);

    // Case number visível
    await expect(page.locator('text=11001').first()).toBeVisible({ timeout: 15000 });

    // Status badge
    await expect(page.locator('text=BUSQUEDA').first()).toBeVisible({ timeout: 10000 });
  });

  test('campos LLM exibem badge "LLM parseado" quando enriquecidos', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_VACANCY }),
      }),
    );

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}`);

    // Badge LLM parseado (data formatada em pt-BR: 20/03/2026)
    await expect(
      page.locator('text=/LLM parseado/i').first(),
    ).toBeVisible({ timeout: 15000 });

    // Ocupações retornadas pelo LLM
    await expect(page.locator('text=Acompañante Terapéutico').first()).toBeVisible({ timeout: 5000 });
  });

  test('botão "Ver Match" navega para /admin/vacancies/:id/match', async ({ page }) => {
    await seedAdminAndLogin(page);

    await page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_VACANCY }),
      }),
    );
    // Mock match-results para evitar erro na tela de match
    await page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}/match-results**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            jobPostingId: MOCK_VACANCY_ID,
            lastMatchAt: null,
            totalCandidates: 0,
            candidates: [],
          },
        }),
      }),
    );

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}`);

    await expect(page.getByRole('button', { name: /Ver Match/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Ver Match/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`/admin/vacancies/${MOCK_VACANCY_ID}/match`),
      { timeout: 10000 },
    );
  });

  test('vaga sem campos LLM não exibe badge LLM parseado', async ({ page }) => {
    await seedAdminAndLogin(page);

    const vacancyWithoutLlm = {
      ...MOCK_VACANCY,
      id: MOCK_VACANCY_ID,
      llm_enriched_at: null,
      llm_required_profession: null,
      llm_required_specialties: null,
      llm_required_diagnoses: null,
      llm_parsed_schedule: null,
    };

    await page.route(`**/api/admin/vacancies/${MOCK_VACANCY_ID}`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: vacancyWithoutLlm }),
      }),
    );

    await page.goto(`/admin/vacancies/${MOCK_VACANCY_ID}`);
    await expect(page.locator('text=11001').first()).toBeVisible({ timeout: 15000 });

    // Badge LLM parseado NÃO deve estar visível
    await expect(page.locator('text=/LLM parseado/i').first()).not.toBeVisible();
  });
});
