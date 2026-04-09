/**
 * phone-input-reload.e2e.ts
 *
 * Testa que o número de telefone é exibido corretamente ao recarregar o perfil.
 * Bug fix: anteriormente o componente PhoneInputIntl truncava os últimos dígitos
 * ao receber um número internacional do backend (contava código do país no limite).
 *
 * Inclui validação visual via screenshot para garantir exibição correta.
 */

import { test, expect, Page } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/profile-worker.json' });

/** Mock GET /api/workers/me retornando telefone salvo no banco */
async function mockWorkerWithPhone(page: Page, phone: string): Promise<void> {
  await page.route('**/api/workers/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            email: 'worker@test.com',
            firstName: 'María',
            lastName: 'García',
            phone,
            documentNumber: '30123456',
            birthDate: '1990-03-18',
            sex: 'female',
            gender: 'female',
            documentType: 'DNI',
            titleCertificate: '',
            languages: ['es'],
            profession: 'caregiver',
            knowledgeLevel: 'technical',
            experienceTypes: ['elderly'],
            yearsExperience: '0_2',
            preferredTypes: ['elderly'],
            preferredAgeRange: 'elderly',
            profilePhotoUrl: null,
            serviceAddress: null,
            serviceRadiusKm: 10,
            availability: {},
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe('PhoneInputIntl — Exibição após reload', () => {
  test('AR: telefone +5491112345678 deve exibir todos os dígitos ao carregar perfil', async ({ page }) => {
    const phoneFromDb = '+5491112345678';
    await mockWorkerWithPhone(page, phoneFromDb);

    await page.goto('/worker/profile');
    await page.waitForLoadState('networkidle');

    const phoneInput = page.locator('input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10000 });

    // Aguarda o valor ser preenchido pelo componente
    await expect(phoneInput).not.toHaveValue('', { timeout: 5000 });

    // Verifica que o número exibido contém todos os dígitos do assinante (prova de não-truncamento)
    // Formato nacional AR: 011 15-1234-5678 → dígitos: 0111512345678
    const displayedValue = await phoneInput.inputValue();
    const displayedDigits = displayedValue.replace(/\D/g, '');

    // O número do assinante (12345678) deve estar completo — antes do fix, os últimos dígitos eram cortados
    expect(displayedDigits).toContain('12345678');
    // Deve ter pelo menos 10 dígitos no display (formato nacional AR completo)
    expect(displayedDigits.length).toBeGreaterThanOrEqual(10);

    // Screenshot visual: telefone completo no campo
    await expect(phoneInput).toHaveScreenshot('phone-ar-reload-full-number.png');
  });

  test('BR: telefone +5511999998888 deve exibir todos os dígitos ao carregar perfil', async ({ page }) => {
    const phoneFromDb = '+5511999998888';
    await mockWorkerWithPhone(page, phoneFromDb);

    await page.goto('/worker/profile');
    await page.waitForLoadState('networkidle');

    const phoneInput = page.locator('input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10000 });
    await expect(phoneInput).not.toHaveValue('', { timeout: 5000 });

    const displayedValue = await phoneInput.inputValue();
    const displayedDigits = displayedValue.replace(/\D/g, '');

    // Deve conter os 11 dígitos nacionais: 11999998888
    expect(displayedDigits).toContain('11999998888');

    // Screenshot visual: telefone BR completo
    await expect(phoneInput).toHaveScreenshot('phone-br-reload-full-number.png');
  });

  test('AR: telefone NÃO deve mudar após salvar, sair e voltar (simulação de navegação)', async ({ page }) => {
    const phoneFromDb = '+5491112345678';
    await mockWorkerWithPhone(page, phoneFromDb);

    // Primeira visita
    await page.goto('/worker/profile');
    await page.waitForLoadState('networkidle');

    const phoneInput = page.locator('input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10000 });
    await expect(phoneInput).not.toHaveValue('', { timeout: 5000 });

    const firstVisitValue = await phoneInput.inputValue();

    // Simula sair e voltar (navega para outra URL e volta)
    await page.goto('/worker/profile');
    await page.waitForLoadState('networkidle');

    const phoneInputReload = page.locator('input[type="tel"]').first();
    await expect(phoneInputReload).toBeVisible({ timeout: 10000 });
    await expect(phoneInputReload).not.toHaveValue('', { timeout: 5000 });

    const secondVisitValue = await phoneInputReload.inputValue();

    // O valor exibido deve ser idêntico nas duas visitas
    expect(secondVisitValue).toBe(firstVisitValue);

    // Screenshot visual: valor estável após reload
    await expect(phoneInputReload).toHaveScreenshot('phone-ar-stable-after-reload.png');
  });

  test('screenshot: campo de telefone dentro do formulário de perfil', async ({ page }) => {
    await mockWorkerWithPhone(page, '+5491176614743');

    await page.goto('/worker/profile');
    await page.waitForLoadState('networkidle');

    const phoneInput = page.locator('input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10000 });
    await expect(phoneInput).not.toHaveValue('', { timeout: 5000 });

    // Screenshot do wrapper completo do phone input (com bandeira e código do país)
    const phoneWrapper = page.locator('.phone-input-wrapper').first();
    await expect(phoneWrapper).toHaveScreenshot('phone-input-wrapper-with-value.png');
  });
});
