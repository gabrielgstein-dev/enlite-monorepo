/**
 * register-lgpd-palette.visual.e2e.ts
 *
 * Playwright E2E — Testes visuais para a paleta de cores do bloco LGPD na RegisterPage.
 *
 * Valida que os três textos corrigidos usam text-gray-800 (#737373 / rgb(115,115,115)):
 *   1. Subtítulo LGPD  → span com register.lgpdSubtitle
 *   2. Corpo LGPD      → span com register.lgpdBody (inclui links)
 *   3. Hint de telefone → span com register.phonePrefilledHint (visível só quando phoneMasked)
 *
 * Blindagem contra regressão: além do screenshot, cada span tem assertion CSS explícita
 * de color: rgb(115, 115, 115) — impede que alguém troque de volta para text-gray-500/600
 * sem quebrar o teste mesmo que o screenshot não seja atualizado.
 */

import { test, expect, Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Configura a rota de mock para GET /api/workers/lookup.
 * Deve ser chamado ANTES de page.goto.
 */
async function mockEmailLookup(
  page: Page,
  response: { found: boolean; phoneMasked?: string },
): Promise<void> {
  await page.route('**/api/workers/lookup*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Navega para a página de registro e aguarda o formulário estar visível.
 */
async function gotoRegisterPage(page: Page): Promise<void> {
  await page.goto('/register');
  await expect(page.locator('form')).toBeVisible({ timeout: 10_000 });
  // Aguarda as fontes carregarem para evitar flakiness de texto em screenshots
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Preenche o campo email e dispara o onBlur para acionar o lookup.
 */
async function fillEmailAndBlur(page: Page, email: string): Promise<void> {
  const emailInput = page.locator('input#email');
  await emailInput.fill(email);
  // Dispara o blur clicando em outro elemento (campo de senha)
  await page.locator('input#password').click();
}

// ── Testes ────────────────────────────────────────────────────────────────────

test.describe('RegisterPage — LGPD Block Palette', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // ── Teste 1: Screenshot do bloco LGPD completo no estado inicial ──────────

  test('1. bloco LGPD completo: screenshot e cores corretas no estado inicial', async ({ page }) => {
    await gotoRegisterPage(page);

    // Localiza o container que envolve o checkbox LGPD (label[for="lgpdOptIn"] ou seu pai)
    const lgpdLabel = page.locator('label[for="lgpdOptIn"]');
    await expect(lgpdLabel).toBeVisible({ timeout: 5_000 });

    // ── Assertion semântica: subtítulo usa rgb(115, 115, 115) ────────────────
    // Localiza o span de subtítulo: segundo span dentro do div de labelContent
    // O subtítulo é o span com class text-sm text-gray-800
    const subtitleSpan = lgpdLabel.locator('span.text-sm.text-gray-800').first();
    await expect(subtitleSpan).toBeVisible();
    await expect(subtitleSpan).toHaveCSS('color', 'rgb(115, 115, 115)');

    // ── Assertion semântica: corpo usa rgb(115, 115, 115) ────────────────────
    // O corpo é o span com class text-xs text-gray-800
    const bodySpan = lgpdLabel.locator('span.text-xs.text-gray-800').first();
    await expect(bodySpan).toBeVisible();
    await expect(bodySpan).toHaveCSS('color', 'rgb(115, 115, 115)');

    // ── Screenshot do bloco LGPD completo ───────────────────────────────────
    // Captura o container que inclui o checkbox + todo o texto
    const lgpdContainer = lgpdLabel.locator('..');
    await expect(lgpdContainer).toHaveScreenshot('lgpd-block-palette.png');
  });

  // ── Teste 2: Assertion de cor computada — subtítulo e corpo individualmente

  test('2. spans subtítulo e corpo LGPD têm color computada rgb(115, 115, 115)', async ({ page }) => {
    await gotoRegisterPage(page);

    const lgpdLabel = page.locator('label[for="lgpdOptIn"]');
    await expect(lgpdLabel).toBeVisible({ timeout: 5_000 });

    // Subtítulo: text-sm text-gray-800
    const subtitleSpan = lgpdLabel.locator('span.text-sm.text-gray-800').first();
    await expect(subtitleSpan).toHaveCSS('color', 'rgb(115, 115, 115)');

    // Corpo: text-xs text-gray-800
    const bodySpan = lgpdLabel.locator('span.text-xs.text-gray-800').first();
    await expect(bodySpan).toHaveCSS('color', 'rgb(115, 115, 115)');

    // Confirma que NÃO são quase invisíveis (texto cinza muito claro)
    // Se alguém trocar para text-gray-500 (rgba(217,217,217,0.5)) ou text-gray-600 (#D9D9D9),
    // os valores rgb abaixo falhariam
    const subtitleColor = await subtitleSpan.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(subtitleColor).toBe('rgb(115, 115, 115)');

    const bodyColor = await bodySpan.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(bodyColor).toBe('rgb(115, 115, 115)');
  });

  // ── Teste 3: Screenshot do hint de telefone pré-preenchido ───────────────

  test('3. hint phonePrefilledHint visível com cor rgb(115, 115, 115) quando lookup retorna phoneMasked', async ({ page }) => {
    await mockEmailLookup(page, { found: true, phoneMasked: 'xxxxxxxxxx978' });
    await gotoRegisterPage(page);

    await fillEmailAndBlur(page, 'worker@example.com');

    // Aguarda o input mascarado aparecer (indica que o lookup foi processado)
    await expect(page.locator('input#whatsapp')).toBeDisabled({ timeout: 5_000 });

    // O hint span: text-xs text-gray-800 dentro do FormField de whatsapp
    // Localiza pelo próprio texto da chave de tradução — o span fica após o input mascarado
    // A estrutura é: FormField > InputWithIcon + span.text-xs.text-gray-800
    const hintSpan = page.locator('span.text-xs.text-gray-800').first();
    await expect(hintSpan).toBeVisible({ timeout: 5_000 });

    // ── Assertion de cor computada do hint ───────────────────────────────────
    await expect(hintSpan).toHaveCSS('color', 'rgb(115, 115, 115)');

    // ── Screenshot do campo de telefone com hint ──────────────────────────────
    // Captura o FormField do whatsapp (label + input + hint)
    const whatsappField = page.locator('label').filter({ hasText: /WhatsApp/i }).locator('..');
    await expect(whatsappField).toBeVisible();
    await expect(whatsappField).toHaveScreenshot('lgpd-phone-hint-palette.png');
  });
});
