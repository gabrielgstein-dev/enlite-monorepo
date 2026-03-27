import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKER_AUTH_FILE = path.join(__dirname, '.auth', 'profile-worker.json');

setup('criar conta de worker para testes de perfil', async ({ page }) => {
  const email = `profile.e2e.${Date.now()}@enlite-test.com`;
  const password = 'TestProfile123!';

  await page.goto('/register');
  await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByText('Acepto recibir comunicaciones').click();
  await page.getByText('Registrarse').click();
  await expect(page).toHaveURL('/', { timeout: 15_000 });

  await page.context().storageState({ path: WORKER_AUTH_FILE });
});
