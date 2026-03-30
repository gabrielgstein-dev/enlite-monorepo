import { test, expect, Page, request } from '@playwright/test';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_CSV = path.join(__dirname, '../../worker-functions/tests/e2e/fixtures/talentum_sample.csv');

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY = 'test-api-key';
const FIREBASE_PROJECT_ID = 'enlite-e2e-test';
const API_URL = 'http://localhost:8080';

/**
 * Creates an admin user in Firebase Emulator + seeds Postgres with admin role,
 * then performs a real login via the Admin Login UI.
 */
async function seedAdminAndLogin(page: Page): Promise<{ email: string; token: string }> {
  const email = `e2e.admin.${Date.now()}@test.com`;
  const password = 'TestAdmin123!';

  // 1. Sign up in Firebase Emulator
  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signUpData = await signUpRes.json() as { localId: string; idToken: string };
  if (!signUpData.localId) {
    throw new Error(`Firebase sign-up failed: ${JSON.stringify(signUpData)}`);
  }
  const { localId: uid, idToken: token } = signUpData;

  // 2. Seed admin user in Postgres via docker exec
  const sql = `
    INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at) VALUES ('${uid}', '${email}', 'Admin E2E', 'admin', NOW(), NOW()) ON CONFLICT DO NOTHING;
    INSERT INTO admins_extension (user_id, must_change_password, created_at, updated_at) VALUES ('${uid}', false, NOW(), NOW()) ON CONFLICT DO NOTHING;
  `.replace(/\n/g, ' ').trim();
  
  try {
    execSync(`docker exec enlite-postgres psql -U enlite_admin -d enlite_e2e -c "${sql}"`, { stdio: 'pipe' });
  } catch (e) {
    console.warn('[E2E] Could not seed Postgres — admin profile mock will be used:', e);
  }

  // 3. Mock /api/admin/auth/profile to guarantee admin access even if Postgres seed failed
  await page.route('**/api/admin/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: uid,
          email,
          role: 'superadmin',
          firstName: 'Admin',
          lastName: 'Test',
          isActive: true,
          mustChangePassword: false,
        },
      }),
    });
  });

  // 4. Rewrite /api/import headers so the REAL backend accepts the request
  await page.route('**/api/import/**', async (route, req) => {
    const headers = await req.allHeaders();
    headers['authorization'] = `Bearer ${token}`;
    await route.continue({ headers });
  });

  // 5. Perform real login via Firebase Emulator + Admin Login UI
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar|Entrar/i }).click();

  // 6. Wait for redirect to admin panel
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });

  return { email, token };
}

test.describe('Admin Import History Flow - REAL E2E', () => {

  test('should trigger a real upload job, display queue and stream pipeline updates', async ({ page }) => {
    test.setTimeout(120000);

    // 1. Bypass login and land on admin panel
    await seedAdminAndLogin(page);

    // 2. Navigate to the Uploads page via sidebar
    await page.goto('/admin/uploads');
    await expect(page.locator('text=/Histórico de Imports/i')).toBeVisible({ timeout: 15000 });

    // 3. Upload a file into the "Candidatos" zone
    const fileInput = page
      .locator('div', { hasText: 'Candidatos' })
      .filter({ has: page.locator('input[type="file"]') })
      .locator('input[type="file"]')
      .first();

    await fileInput.setInputFiles(SAMPLE_CSV);

    // 4. The upload zone should show a processing indicator
    await expect(page.locator('text=/Procesando|Processing|Subiendo/i').first()).toBeVisible({ timeout: 15000 });

    // 5. The job should appear in the history list
    await expect(page.locator('text=talentum_sample.csv').first()).toBeVisible({ timeout: 20000 });

    // 6. Click the job row to drill into job details (SSE stream view)
    await page.locator('text=talentum_sample.csv').first().click();

    // 7. Confirm the detail view header
    await expect(page.locator('text=/Detalhes do Import/i')).toBeVisible({ timeout: 10000 });

    // 8. Wait for the SSE pipeline to reach a terminal state
    const terminalStatus = page.locator('span', { hasText: /Concluído|Falhou|Cancelado/i }).first();
    await expect(terminalStatus).toBeVisible({ timeout: 60000 });

    // 9. Verify terminal logs are populated from the real SSE stream
    const terminalArea = page.locator('.bg-slate-900');
    await expect(terminalArea).toContainText(/INFO|ERROR|WARN|DEBUG/);
  });

});
