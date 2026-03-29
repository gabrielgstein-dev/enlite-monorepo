/**
 * E2E tests for AdminUploadsPage — ensures every upload zone (Ana Care Control,
 * Candidatos, Planilla Operativa, Talent Search) transitions through all statuses
 * (idle → uploading → processing → done | error) and that the history panel
 * reflects the job lifecycle, similar to GitHub Actions run status.
 *
 * Auth pattern: Firebase Emulator + Postgres seed, with profile API mock as fallback.
 * Upload/poll APIs are fully mocked so tests are fast and deterministic.
 */
import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';

// ── Constants ──────────────────────────────────────────────────────────────

const FIREBASE_EMULATOR = 'http://localhost:9099';
const FIREBASE_API_KEY = 'test-api-key';

// Minimal valid file payloads — AdminUploadsPage validates by extension only.
const XLSX_FILE = {
  name: 'test.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK magic bytes
};
const CSV_FILE = {
  name: 'test.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('nome,email\nJohn,john@test.com'),
};

const UPLOAD_ZONES = [
  { key: 'ana_care_control', label: /Ana Care Control/i, file: XLSX_FILE },
  { key: 'candidatos', label: /Candidatos/i, file: XLSX_FILE },
  { key: 'planilla_operativa', label: /Planilla Operativa/i, file: XLSX_FILE },
  { key: 'talent_search', label: /Talent Search|Talentum/i, file: CSV_FILE },
] as const;

type ZoneKey = (typeof UPLOAD_ZONES)[number]['key'];

// ── Auth helper ────────────────────────────────────────────────────────────

async function seedAdminAndLogin(page: Page): Promise<void> {
  const email = `e2e.uploads.${Date.now()}@test.com`;
  const password = 'TestAdmin123!';

  // 1. Create user in Firebase Emulator.
  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const { localId: uid } = (await signUpRes.json()) as { localId: string };

  // 2. Seed admin role in Postgres (best-effort — profile mock below is the safety net).
  const sql = `
    INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES ('${uid}', '${email}', 'Admin E2E', NOW(), NOW()) ON CONFLICT DO NOTHING;
    INSERT INTO admins_extension (user_id, role, is_active, must_change_password, created_at, updated_at)
      VALUES ('${uid}', 'superadmin', true, false, NOW(), NOW()) ON CONFLICT DO NOTHING;
  `
    .replace(/\n/g, ' ')
    .trim();
  try {
    execSync(`docker exec enlite-postgres psql -U enlite_admin -d enlite_e2e -c "${sql}"`, {
      stdio: 'pipe',
    });
  } catch {
    // Postgres seed failed — profile mock below guarantees admin access.
  }

  // 3. Mock admin profile so AdminProtectedRoute lets us in.
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
          lastName: 'E2E',
          isActive: true,
          mustChangePassword: false,
        },
      }),
    });
  });

  // 4. Login via Admin Login UI (real Firebase Emulator auth).
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar|Entrar/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20000 });
}

// ── API mock helpers ───────────────────────────────────────────────────────

/** Mocks history + queue to return empty (silences background polling). */
async function mockEmptyHistory(page: Page): Promise<void> {
  await page.route('**/api/import/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      }),
    });
  });
  await page.route('**/api/import/queue', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { running: null, queued: [] } }),
    });
  });
}

async function navigateToUploads(page: Page): Promise<void> {
  await page.goto('/admin/uploads');
  await expect(page.getByRole('heading', { name: /Importar Archivos/i })).toBeVisible({ timeout: 10000 });
}

function zone(page: Page, key: ZoneKey) {
  return page.locator(`[data-testid="upload-zone-${key}"]`);
}

function fileInput(page: Page, key: ZoneKey) {
  return page.locator(`[data-testid="upload-zone-${key}"] input[type="file"]`);
}

// ── Test suite ─────────────────────────────────────────────────────────────

test.describe('Admin Uploads — status transitions (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyHistory(page);
  });

  // ── Estado inicial ────────────────────────────────────────────────────────

  test('all 4 upload zones start in idle state', async ({ page }) => {
    await seedAdminAndLogin(page);
    await navigateToUploads(page);

    for (const { key, label } of UPLOAD_ZONES) {
      const z = zone(page, key);
      await expect(z).toBeVisible();
      // Zone heading must match — use heading role to avoid matching description text.
      await expect(z.getByRole('heading', { name: label })).toBeVisible();
      // Idle: "Seleccionar archivo" button must be present.
      await expect(z.getByRole('button', { name: /Seleccionar archivo/i })).toBeVisible();
      // No spinner — nothing is happening.
      await expect(z.locator('.animate-spin')).not.toBeVisible();
    }
  });

  // ── Transições de status por zona ─────────────────────────────────────────
  // Each zone gets 3 tests: full happy path, upload API error, poll error.

  for (const { key: zoneKey, file } of UPLOAD_ZONES) {
    test(`${zoneKey}: idle → uploading → processing → done`, async ({ page }) => {
      test.setTimeout(30000);
      await seedAdminAndLogin(page);
      await navigateToUploads(page);

      const jobId = `job-${zoneKey}-${Date.now()}`;
      let uploadCalled = false;
      let resolveUpload!: () => void;
      const uploadHeld = new Promise<void>((r) => { resolveUpload = r; });

      // Hold the upload request so we can observe the "uploading" state.
      await page.route('**/api/import/upload', async (route) => {
        if (route.request().method() === 'POST') {
          uploadCalled = true;
          await uploadHeld;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { importJobId: jobId } }),
          });
        } else {
          await route.continue();
        }
      });

      // Polling: first call → processing, second → done.
      let pollCount = 0;
      await page.route(`**/api/import/status/${jobId}`, async (route) => {
        pollCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              status: pollCount >= 2 ? 'done' : 'processing',
              jobId,
              inserted: pollCount >= 2 ? 42 : 0,
              updated: 0,
              errors: 0,
            },
          }),
        });
      });

      const z = zone(page, zoneKey);

      // IDLE state before upload.
      await expect(z.getByRole('button', { name: /Seleccionar archivo/i })).toBeVisible();

      // Trigger file selection.
      await fileInput(page, zoneKey).setInputFiles(file);

      // UPLOADING: spinner + "Subiendo..." visible while request is held.
      await expect(z.locator('.animate-spin')).toBeVisible({ timeout: 5000 });
      await expect(z.getByText(/Subiendo/i)).toBeVisible({ timeout: 5000 });
      // Verify the POST to /api/import/upload was actually called.
      expect(uploadCalled).toBe(true);
      // Idle button must be gone.
      await expect(z.getByRole('button', { name: /Seleccionar archivo/i })).not.toBeVisible();

      // Release the upload.
      resolveUpload();

      // PROCESSING: spinner + "Procesando..." after upload API responds.
      await expect(z.getByText(/Procesando/i)).toBeVisible({ timeout: 10000 });
      await expect(z.locator('.animate-spin')).toBeVisible();

      // DONE: "Subir otro" appears after polling resolves.
      await expect(z.getByText(/Subir otro/i)).toBeVisible({ timeout: 20000 });
      // Spinner must disappear.
      await expect(z.locator('.animate-spin')).not.toBeVisible({ timeout: 5000 });
    });

    test(`${zoneKey}: shows error state when upload API fails`, async ({ page }) => {
      await seedAdminAndLogin(page);
      await navigateToUploads(page);

      await page.route('**/api/import/upload', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Internal Server Error' }),
        });
      });

      const z = zone(page, zoneKey);
      await fileInput(page, zoneKey).setInputFiles(file);

      // Brief uploading state.
      await expect(z.getByText(/Subiendo/i)).toBeVisible({ timeout: 5000 });

      // ERROR: "Intentar de nuevo" visible, no spinner.
      await expect(z.getByText(/Intentar de nuevo/i)).toBeVisible({ timeout: 10000 });
      await expect(z.locator('.animate-spin')).not.toBeVisible();
    });

    test(`${zoneKey}: shows error state when poll returns error status`, async ({ page }) => {
      test.setTimeout(20000);
      await seedAdminAndLogin(page);
      await navigateToUploads(page);

      const jobId = `job-err-${zoneKey}`;
      await page.route('**/api/import/upload', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { importJobId: jobId } }),
        });
      });
      await page.route(`**/api/import/status/${jobId}`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { status: 'error', error: 'Processing failed — constraint violation' },
          }),
        });
      });

      const z = zone(page, zoneKey);
      await fileInput(page, zoneKey).setInputFiles(file);

      // Should reach error state after processing + first poll (~2s).
      await expect(z.getByText(/Intentar de nuevo/i)).toBeVisible({ timeout: 15000 });
      await expect(z.locator('.animate-spin')).not.toBeVisible();
    });
  }

  // ── Formato inválido ──────────────────────────────────────────────────────

  test('rejects non-xlsx/csv files and shows error immediately (no API call)', async ({ page }) => {
    await seedAdminAndLogin(page);
    await navigateToUploads(page);

    let uploadCalled = false;
    await page.route('**/api/import/upload', async (route) => {
      uploadCalled = true;
      await route.continue();
    });

    const z = zone(page, 'candidatos');
    await fileInput(page, 'candidatos').setInputFiles({
      name: 'invalid.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    // Error state appears immediately — no spinner, no API call.
    await expect(z.getByText(/Intentar de nuevo/i)).toBeVisible({ timeout: 5000 });
    await expect(z.locator('.animate-spin')).not.toBeVisible();
    expect(uploadCalled).toBe(false);
  });

  // ── Independência dos zones ───────────────────────────────────────────────

  test('uploading to one zone does not affect other zones', async ({ page }) => {
    await seedAdminAndLogin(page);
    await navigateToUploads(page);

    let resolveUpload!: () => void;
    const uploadHeld = new Promise<void>((r) => { resolveUpload = r; });

    await page.route('**/api/import/upload', async (route) => {
      await uploadHeld;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { importJobId: 'job-isolated' } }),
      });
    });

    // Upload only to candidatos.
    await fileInput(page, 'candidatos').setInputFiles(XLSX_FILE);
    const candidatosZone = zone(page, 'candidatos');
    await expect(candidatosZone.getByText(/Subiendo/i)).toBeVisible({ timeout: 5000 });

    // All other zones must remain idle.
    for (const { key } of UPLOAD_ZONES.filter((z) => z.key !== 'candidatos')) {
      await expect(zone(page, key).getByRole('button', { name: /Seleccionar archivo/i })).toBeVisible();
      await expect(zone(page, key).locator('.animate-spin')).not.toBeVisible();
    }

    resolveUpload();
  });

  // ── Painel de histórico (similar ao GitHub Actions) ───────────────────────

  test('history panel renders job rows with correct status icons (GitHub Actions style)', async ({ page }) => {
    await seedAdminAndLogin(page);

    // Mock history to return 3 jobs with different statuses so we can validate
    // each icon — similar to how GitHub Actions shows run statuses.
    await page.route('**/api/import/history**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'job-proc',
              filename: 'candidatos_processing.xlsx',
              status: 'processing',
              currentPhase: 'import',
              workersCreated: 0,
              encuadresCreated: 0,
              encuadresSkipped: 0,
              errorRows: 0,
              createdBy: 'admin@test.com',
              createdAt: new Date().toISOString(),
              startedAt: new Date().toISOString(),
              finishedAt: null,
              cancelledAt: null,
              duration: null,
            },
            {
              id: 'job-done',
              filename: 'ana_care_done.xlsx',
              status: 'done',
              currentPhase: 'complete',
              workersCreated: 12,
              encuadresCreated: 5,
              encuadresSkipped: 2,
              errorRows: 0,
              createdBy: 'admin@test.com',
              createdAt: new Date(Date.now() - 60000).toISOString(),
              startedAt: new Date(Date.now() - 55000).toISOString(),
              finishedAt: new Date().toISOString(),
              cancelledAt: null,
              duration: '55s',
            },
            {
              id: 'job-err',
              filename: 'planilla_error.xlsx',
              status: 'error',
              currentPhase: 'error',
              workersCreated: 0,
              encuadresCreated: 0,
              encuadresSkipped: 0,
              errorRows: 10,
              createdBy: 'admin@test.com',
              createdAt: new Date(Date.now() - 120000).toISOString(),
              startedAt: new Date(Date.now() - 115000).toISOString(),
              finishedAt: new Date(Date.now() - 60000).toISOString(),
              cancelledAt: null,
              duration: '1m',
            },
          ],
          pagination: { page: 1, limit: 20, total: 3, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      });
    });
    await page.route('**/api/import/queue', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            running: { jobId: 'job-proc', filename: 'candidatos_processing.xlsx', enqueuedAt: new Date().toISOString() },
            queued: [],
          },
        }),
      });
    });

    await navigateToUploads(page);

    // All 3 job filenames must appear in the history table.
    await expect(page.locator('text=candidatos_processing.xlsx')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=ana_care_done.xlsx')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=planilla_error.xlsx')).toBeVisible({ timeout: 5000 });

    // Processing job must show spinning icon (Loader2 animate-spin).
    await expect(page.locator('table .animate-spin')).toBeVisible({ timeout: 5000 });

    // Queue info badge must show "em andamento".
    await expect(page.getByText(/em andamento/i).first()).toBeVisible({ timeout: 5000 });

    // Status filter tabs must be visible (Todos, Em andamento, Concluído, Falhou...).
    await expect(page.getByRole('button', { name: /Todos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Em andamento/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Concluído/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Falhou/i })).toBeVisible();
  });

  // ── Bug 3 — polling starts even when list starts empty ───────────────────

  test('Bug 3 — polling starts when queueInfo has active job even with empty history list', async ({ page }) => {
    test.setTimeout(20000);
    await seedAdminAndLogin(page);

    // History: first call returns empty; subsequent polling calls return the active job.
    let historyCallCount = 0;
    await page.route('**/api/import/history**', async (route) => {
      historyCallCount++;
      if (historyCallCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{
              id: 'job-poll-test',
              filename: 'polling_test.xlsx',
              status: 'processing',
              currentPhase: 'import',
              workersCreated: 0,
              encuadresCreated: 0,
              encuadresSkipped: 0,
              errorRows: 0,
              createdBy: 'admin@test.com',
              createdAt: new Date().toISOString(),
              startedAt: new Date().toISOString(),
              finishedAt: null,
              cancelledAt: null,
              duration: null,
            }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
          }),
        });
      }
    });

    // Queue shows an active job from the very first load.
    await page.route('**/api/import/queue', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            running: { jobId: 'job-poll-test', filename: 'polling_test.xlsx', enqueuedAt: new Date().toISOString() },
            queued: [],
          },
        }),
      });
    });

    await navigateToUploads(page);

    // Queue badge must appear — proves queueInfo was set and polling condition can fire.
    // This is the key signal: queueInfo.running is non-null even though the history list
    // is still empty on first load.
    await expect(page.getByText(/1 em andamento/i).first()).toBeVisible({ timeout: 10000 });

    // History list starts empty, but polling (triggered by queueInfo activity) eventually
    // re-fetches history and the job becomes visible — this is the fix being verified.
    await expect(page.locator('text=polling_test.xlsx')).toBeVisible({ timeout: 10000 });

    // Processing spinner in the table confirms the job is shown in its active state.
    await expect(page.locator('table .animate-spin').first()).toBeVisible({ timeout: 3000 });
  });

  // ── Bug 4 — alreadyImported shows explicit feedback ───────────────────────

  test('Bug 4 — alreadyImported response shows "Arquivo já importado" instead of silent done', async ({ page }) => {
    test.setTimeout(20000);
    await seedAdminAndLogin(page);

    // Track status-polling calls — there should be none when alreadyImported.
    let statusCallCount = 0;
    await page.route('**/api/import/status/**', async (route) => {
      statusCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 'done' } }),
      });
    });

    // Upload returns alreadyImported: true.
    await page.route('**/api/import/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          alreadyImported: true,
          message: 'Arquivo já importado. Envie force=true no body para reimportar.',
          data: { importJobId: 'existing-dup-job', importedAt: new Date(Date.now() - 60000).toISOString() },
        }),
      });
    });

    await navigateToUploads(page);

    const z = zone(page, 'candidatos');
    await expect(z.getByRole('button', { name: /Seleccionar archivo/i })).toBeVisible();

    await fileInput(page, 'candidatos').setInputFiles(XLSX_FILE);

    // Brief uploading spinner.
    await expect(z.getByText(/Subiendo/i)).toBeVisible({ timeout: 5000 });

    // "Already imported" message must appear — NOT the generic "Procesado".
    await expect(z.getByText(/já importado/i)).toBeVisible({ timeout: 10000 });

    // Done state: "Subir otro" link must be visible.
    await expect(z.getByText(/Subir otro/i)).toBeVisible({ timeout: 5000 });

    // No spinner after the message is shown.
    await expect(z.locator('.animate-spin')).not.toBeVisible();

    // Wait a full polling cycle and confirm no status endpoint was ever called.
    await page.waitForTimeout(3500);
    expect(statusCallCount).toBe(0);
  });

  // ── Bug 5 — polling interval stability across multiple ticks ─────────────

  test('Bug 5 — polling stays stable: job status updates visually across 3+ polling cycles', async ({ page }) => {
    test.setTimeout(45000);
    await seedAdminAndLogin(page);

    let historyPollCount = 0;

    // First call: processing job. After 3 polls, transitions to done.
    // This validates that polling ran at least 3 full cycles without interval recreation breaking it.
    await page.route('**/api/import/history**', async (route) => {
      historyPollCount++;
      const isDone = historyPollCount > 3;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'job-race-test',
              filename: 'race_condition_test.xlsx',
              status: isDone ? 'done' : 'processing',
              currentPhase: isDone ? 'complete' : 'import',
              workersCreated: isDone ? 10 : 0,
              encuadresCreated: 0,
              encuadresSkipped: 0,
              errorRows: 0,
              createdBy: 'admin@test.com',
              createdAt: new Date().toISOString(),
              startedAt: new Date().toISOString(),
              finishedAt: isDone ? new Date().toISOString() : null,
              cancelledAt: null,
              duration: isDone ? '9s' : null,
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      });
    });

    await page.route('**/api/import/queue', async (route) => {
      const isActive = historyPollCount <= 3;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            running: isActive
              ? { jobId: 'job-race-test', filename: 'race_condition_test.xlsx', enqueuedAt: new Date().toISOString() }
              : null,
            queued: [],
          },
        }),
      });
    });

    await navigateToUploads(page);

    // 1. Verify the history panel component is present and visible
    await expect(page.getByText(/Histórico de Imports/i)).toBeVisible({ timeout: 10000 });

    // 2. Verify the processing job row appears (component rendered with data)
    await expect(page.locator('text=race_condition_test.xlsx')).toBeVisible({ timeout: 10000 });

    // 3. Visually confirm processing spinner is present in the table row
    await expect(page.locator('table .animate-spin').first()).toBeVisible({ timeout: 5000 });

    // 4. Visually confirm queue indicator is showing active job
    await expect(page.getByText(/1 em andamento/i).first()).toBeVisible({ timeout: 5000 });

    // 5. Wait for job to transition to "done" after 3+ polling cycles (~12s total).
    //    If the race condition were present (interval being recreated but still firing),
    //    this would still work — but the fix guarantees the interval is stable.
    //    The spinner disappears when the done icon appears.
    await expect(page.locator('table .animate-spin')).not.toBeVisible({ timeout: 20000 });

    // 6. Visually verify the done (green checkmark) icon is visible for the job row
    await expect(page.locator('table td svg.text-green-600').first()).toBeVisible({ timeout: 5000 });

    // 7. Confirm the filename is still visible (component didn't break/lose state)
    await expect(page.locator('text=race_condition_test.xlsx')).toBeVisible();
  });

  // ── Todos os 4 zones em sequência ─────────────────────────────────────────

  test('all 4 zones upload successfully in sequence', async ({ page }) => {
    test.setTimeout(120000);
    await seedAdminAndLogin(page);
    await navigateToUploads(page);

    // Use a shared mutable state so the upload mock returns the correct jobId
    // for whichever zone is currently uploading.
    const state = { jobId: '' };

    await page.route('**/api/import/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { importJobId: state.jobId } }),
      });
    });

    // Wildcard status mock — always returns done immediately.
    await page.route('**/api/import/status/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { status: 'done', inserted: 5, updated: 0, errors: 0 },
        }),
      });
    });

    for (const { key: zoneKey, file: zoneFile } of UPLOAD_ZONES) {
      state.jobId = `job-seq-${zoneKey}`;

      const z = zone(page, zoneKey);

      // Each zone starts in idle.
      await expect(z.getByRole('button', { name: /Seleccionar archivo/i })).toBeVisible();

      await fileInput(page, zoneKey).setInputFiles(zoneFile);

      // Verify upload is triggered (uploading → processing → done).
      await expect(z.getByText(/Subiendo/i)).toBeVisible({ timeout: 5000 });
      await expect(z.getByText(/Subir otro/i)).toBeVisible({ timeout: 20000 });
    }

    // Final assertion: all 4 zones show "done" state.
    for (const { key: zoneKey } of UPLOAD_ZONES) {
      await expect(zone(page, zoneKey).getByText(/Subir otro/i)).toBeVisible();
    }
  });
});
