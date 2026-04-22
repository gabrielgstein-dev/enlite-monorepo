/**
 * admin-users.spec.ts
 *
 * Playwright E2E — /admin/users (Admin Users management)
 *
 * Cenários cobertos:
 *   1. Listagem: tabela visível com colunas Rol, Departamento, Último login
 *   2. Criar usuário: modal abre, preenche, cria → fallback modal com link
 *   3. Trocar role: select inline muda role → badge atualiza
 *   4. Gating: recruiter não vê botão "Nuevo" nem o select de role
 *   5. Reset password: clica em Reset → InvitationFallbackModal abre com link
 *
 * Auth: Firebase Emulator + profile API mock (mesmo padrão dos outros testes E2E).
 * APIs de users são totalmente mockadas para determinismo.
 */

import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';

const FIREBASE_EMULATOR = 'http://127.0.0.1:9099';
const FIREBASE_API_KEY  = 'test-api-key';

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_ADMIN_USER = {
  id: 'user-admin-001',
  firebaseUid: 'uid-admin-001',
  email: 'admin@enlite.health',
  displayName: 'Admin E2E',
  role: 'admin',
  department: 'Tech',
  lastLoginAt: '2026-04-01T10:00:00Z',
  loginCount: 5,
  createdAt: '2026-01-01T00:00:00Z',
};

const MOCK_RECRUITER_USER = {
  id: 'user-recruiter-001',
  firebaseUid: 'uid-recruiter-001',
  email: 'recruiter@enlite.health',
  displayName: 'Recruiter E2E',
  role: 'recruiter',
  department: 'HR',
  lastLoginAt: null,
  loginCount: 0,
  createdAt: '2026-02-01T00:00:00Z',
};

function usersListBody(users = [MOCK_ADMIN_USER, MOCK_RECRUITER_USER]) {
  return JSON.stringify({ success: true, data: users });
}

// ── Auth helper ────────────────────────────────────────────────────────────

async function seedAdminAndLogin(
  page: Page,
  profileRole: 'admin' | 'recruiter' = 'admin',
): Promise<void> {
  const email    = `e2e.users.${Date.now()}@test.com`;
  const password = 'TestAdmin123!';

  // 1. Create Firebase Emulator user
  const signUpRes = await fetch(
    `${FIREBASE_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const { localId: uid } = (await signUpRes.json()) as { localId: string };

  // 2. Seed Postgres (best-effort — profile mock is the safety net)
  const sql = `
    INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at)
      VALUES ('${uid}', '${email}', 'Admin E2E', '${profileRole}', NOW(), NOW())
      ON CONFLICT DO NOTHING;
  `.replace(/\n/g, ' ').trim();

  try {
    execSync(`docker exec enlite-postgres psql -U enlite_admin -d enlite_e2e -c "${sql}"`, {
      stdio: 'pipe',
    });
  } catch { /* ignore — profile mock covers this */ }

  // 3. Mock profile endpoint
  await page.route('**/api/admin/auth/profile', async (route) => {
    await route.fulfill({
      status:      200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: uid,
          firebaseUid: uid,
          email,
          displayName:       'Admin E2E',
          role:              profileRole,
          department:        'Tech',
          lastLoginAt:       new Date().toISOString(),
          loginCount:        1,
          createdAt:         new Date().toISOString(),
        },
      }),
    });
  });

  // 4. Login
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar|Entrar/i }).click();
  await expect(page).not.toHaveURL(/.*login.*/, { timeout: 20_000 });
}

// ── Mock users API ─────────────────────────────────────────────────────────

async function mockUsersApi(page: Page, users = [MOCK_ADMIN_USER, MOCK_RECRUITER_USER]) {
  await page.route('**/api/admin/users**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        usersListBody(users),
      });
    } else {
      await route.continue();
    }
  });
}

async function navigateToUsers(page: Page) {
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: /Usuarios|Usuários/i })).toBeVisible({
    timeout: 10_000,
  });
}

// ── Cenário 1 — Listagem ───────────────────────────────────────────────────

test.describe('Admin Users — Cenário 1: Listagem', () => {
  test('tabela aparece com colunas Rol, Departamento, Último login', async ({ page }) => {
    await mockUsersApi(page);
    await seedAdminAndLogin(page);
    await navigateToUsers(page);

    // Colunas obrigatórias
    await expect(page.getByRole('columnheader', { name: /Rol|Papel/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Departamento/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /login/i })).toBeVisible();

    // Linhas com dados mockados
    await expect(page.getByText('Admin E2E')).toBeVisible();
    await expect(page.getByText('Recruiter E2E')).toBeVisible();

    // Screenshot visual assertion
    await expect(page).toHaveScreenshot('admin-users-list.png', { maxDiffPixelRatio: 0.05 });
  });
});

// ── Cenário 2 — Criar usuário ──────────────────────────────────────────────

test.describe('Admin Users — Cenário 2: Criar usuário', () => {
  test('abre modal, preenche, cria → modal de fallback com link aparece', async ({ page }) => {
    const createdUser = {
      ...MOCK_RECRUITER_USER,
      firebaseUid: 'uid-new-001',
      email:       'new.recruiter@enlite.health',
      displayName: 'New Recruiter',
      role:        'recruiter',
      resetLink:   'https://enlite.health/reset?oobCode=test-code-123',
    };

    await mockUsersApi(page);

    // Mock POST /api/admin/users
    await page.route('**/api/admin/users', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify({ success: true, data: createdUser }),
        });
      } else {
        await route.continue();
      }
    });

    await seedAdminAndLogin(page);
    await navigateToUsers(page);

    // Abrir modal
    await page.getByRole('button', { name: /Nuevo Usuario|Novo Usuário/i }).click();
    await expect(page.getByRole('heading', { name: /Nuevo Usuario|Novo Usuário/i })).toBeVisible();

    // Preencher campos
    await page.getByLabel(/Email/i).fill('new.recruiter@enlite.health');
    await page.getByLabel(/Nombre|Nome/i).fill('New Recruiter');
    await page.getByLabel(/Departamento/i).fill('Recrutamento');
    await page.getByLabel(/Rol|Papel/i).selectOption('recruiter');

    // Screenshot do modal preenchido
    await expect(page.locator('.fixed.inset-0')).toHaveScreenshot('admin-users-create-modal.png', {
      maxDiffPixelRatio: 0.05,
    });

    // Submeter
    await page.getByRole('button', { name: /Crear|Criar/i }).click();

    // Fallback modal deve aparecer com link
    await expect(
      page.getByRole('heading', { name: /Usuario creado|Usuário criado/i }),
    ).toBeVisible({ timeout: 8_000 });

    await expect(page.getByText('https://enlite.health/reset?oobCode=test-code-123')).toBeVisible();

    // Screenshot do modal de fallback
    await expect(page.locator('.fixed.inset-0')).toHaveScreenshot('admin-users-invitation-fallback.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});

// ── Cenário 3 — Trocar role ────────────────────────────────────────────────

test.describe('Admin Users — Cenário 3: Trocar role', () => {
  test('select inline muda role e lista recarrega', async ({ page }) => {
    const updatedUser = { ...MOCK_ADMIN_USER, role: 'recruiter' };

    await mockUsersApi(page);

    // Mock PATCH /api/admin/users/:id/role
    await page.route('**/api/admin/users/*/role', async (route) => {
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: true, data: updatedUser }),
      });
    });

    await seedAdminAndLogin(page);
    await navigateToUsers(page);

    // Aguarda tabela carregar
    await expect(page.getByText('Admin E2E')).toBeVisible();

    // Screenshot antes
    await expect(page).toHaveScreenshot('admin-users-role-before.png', { maxDiffPixelRatio: 0.05 });

    // Mudar role do primeiro usuário (Admin E2E) de admin → recruiter
    const selects = page.getByRole('combobox');
    await selects.first().selectOption('recruiter');

    // Aguarda reload (GET users chamado novamente)
    await page.waitForResponse((resp) =>
      resp.url().includes('/api/admin/users') && resp.request().method() === 'GET',
    );

    // Screenshot depois
    await expect(page).toHaveScreenshot('admin-users-role-after.png', { maxDiffPixelRatio: 0.05 });
  });
});

// ── Cenário 4 — Gating (recruiter) ────────────────────────────────────────

test.describe('Admin Users — Cenário 4: Gating para recruiter', () => {
  test('recruiter não vê botão Nuevo nem selects de role', async ({ page }) => {
    await mockUsersApi(page);
    await seedAdminAndLogin(page, 'recruiter');
    await navigateToUsers(page);

    await expect(page.getByText('Admin E2E')).toBeVisible();

    // Botão "Nuevo" NÃO deve existir
    await expect(
      page.getByRole('button', { name: /Nuevo Usuario|Novo Usuário/i }),
    ).not.toBeVisible();

    // Selects de role NÃO devem existir
    const selects = page.getByRole('combobox');
    await expect(selects).toHaveCount(0);

    // Screenshot do gating
    await expect(page).toHaveScreenshot('admin-users-recruiter-view.png', { maxDiffPixelRatio: 0.05 });
  });
});

// ── Cenário 5 — Reset password ────────────────────────────────────────────

test.describe('Admin Users — Cenário 5: Reset password', () => {
  test('clica em Reset → InvitationFallbackModal abre com link de restablecimento', async ({ page }) => {
    const resetLink = 'https://enlite.health/reset?oobCode=reset-code-e2e';

    await mockUsersApi(page);

    // Mock POST /api/admin/users/:id/reset-password
    await page.route('**/api/admin/users/*/reset-password', async (route) => {
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({
          success: true,
          data: { resetLink, message: 'Email enviado' },
        }),
      });
    });

    await seedAdminAndLogin(page);
    await navigateToUsers(page);

    await expect(page.getByText('Admin E2E')).toBeVisible();

    // Clicar em "Reset" do primeiro usuário
    const resetButtons = page.getByRole('button', { name: /^Reset$/i });
    await resetButtons.first().click();

    // InvitationFallbackModal deve aparecer com título de reset
    await expect(
      page.getByRole('heading', { name: /restablecimiento|redefinição/i }),
    ).toBeVisible({ timeout: 8_000 });

    // O link de reset deve estar visível
    await expect(page.getByText(resetLink)).toBeVisible();

    // Screenshot do modal de fallback no modo reset
    await expect(page.locator('.fixed.inset-0')).toHaveScreenshot('admin-users-reset-password-fallback.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
