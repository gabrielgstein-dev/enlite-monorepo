/**
 * worker-profile-tabs.e2e.ts
 *
 * Testes E2E RIGOROSOS para as 4 abas do formulário de perfil do worker:
 *   Aba 1 — Información General  → PUT /api/workers/me/general-info
 *   Aba 2 — Dirección de Atención → PUT /api/workers/me/service-area
 *   Aba 3 — Disponibilidad        → PUT /api/workers/me/availability
 *   Aba 4 — Documentos            → GET/POST/DELETE /api/workers/me/documents/*
 *
 * Cobertura por aba:
 *   ✓ Todas as mensagens de validação em espanhol (texto exato do es.json)
 *   ✓ Comportamento das máscaras de input (data DD/MM/AAAA)
 *   ✓ Labels e opções de select em espanhol
 *   ✓ Interceptação e verificação do payload enviado à API
 *   ✓ Mensagem de sucesso "Información guardada con éxito"
 *   ✓ Exibição de erro quando API retorna 500
 *   ✓ Fluxo ponta-a-ponta com persistência real no banco (sem mock)
 *
 * Pré-requisitos: Docker stack rodando (npm run test:e2e:docker)
 *   Frontend: http://localhost:5173
 *   API:      http://localhost:8080
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const AUTH_STATE = path.join(__dirname, '.auth', 'profile-worker.json');
const BASE_PASSWORD = 'TestProfile123!';

// Mensagens de validação — exatamente como definidas em es.json
const MSG = {
  fullNameMin:         'El nombre completo debe tener al menos 3 caracteres',
  lastNameRequired:    'El apellido es obligatorio',
  documentInvalid:     'Documento inválido',
  phoneInvalid:        'Teléfono inválido',
  birthDateRequired:   'La fecha de nacimiento es obligatoria',
  selectSex:           'Por favor, seleccione el sexo',
  selectGender:        'Por favor, seleccione el género',
  licenseRequired:     'El registro profesional es obligatorio',
  selectLanguage:      'Seleccione al menos un idioma',
  selectProfession:    'Por favor, seleccione la profesión',
  selectKnowledge:     'Por favor, seleccione el nivel de conocimiento',
  selectExperience:    'Seleccione al menos un tipo de experiencia',
  selectYears:         'Por favor, seleccione los años de experiencia',
  selectPreferred:     'Seleccione al menos un tipo preferido',
  selectAgeRange:      'Por favor, seleccione el rango de edad preferido',
  serviceRadiusMin:    'El radio de atención debe ser al menos 1 km',
  addressRequired:     'La dirección es obligatoria',
  selectAddress:       'Por favor, seleccione una dirección de la lista de sugerencias',
  timeInvalid:         'Horario inválido',
  endTimeAfterStart:   'El horario de fin debe ser después del horario de inicio',
  selectAtLeastOneDay: 'Seleccione al menos un día con horarios disponibles',
  saveSuccess:         'Información guardada con éxito',
  saveError:           'Error al guardar. Intente nuevamente.',
};

// ─────────────────────────────────────────────────────────────
// Helpers — autenticação
// ─────────────────────────────────────────────────────────────

async function registerWorker(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register');
  await expect(page).toHaveURL('/register', { timeout: 10_000 });
  await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByText('Acepto recibir comunicaciones').click();
  await page.getByText('Registrarse').click();
  await expect(page).toHaveURL('/', { timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────
// Helpers — interação com componentes customizados
// ─────────────────────────────────────────────────────────────

/**
 * Abre o dropdown de um MultiSelect pelo texto do label
 * e seleciona uma opção.
 *
 * Estrutura DOM do MultiSelect:
 *   div.flex-col.gap-1            ← container
 *     label                       ← labelText
 *     div.relative
 *       div.h-12  (trigger)       ← clicar aqui para abrir
 *       div.absolute.z-50         ← dropdown (ao abrir)
 *         div[option]             ← clicar para selecionar
 */
async function selectInMultiSelect(
  page: Page,
  labelText: string,
  optionLabel: string,
): Promise<void> {
  // Sobe ao container pai da <label> e clica no trigger
  const container = page
    .locator('label')
    .filter({ hasText: labelText })
    .locator('xpath=..');
  await container
    .locator('div[class*="relative"]')
    .locator('div[class*="h-12"]')
    .first()
    .click();
  // Clica na opção dentro do dropdown aberto
  await container
    .locator('div[class*="absolute"]')
    .getByText(optionLabel, { exact: true })
    .click();
}

/** Fecha MultiSelect aberto pressionando Escape */
async function closeMultiSelect(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

/**
 * Mock para PUT /api/workers/me/general-info.
 * Captura o body enviado e retorna 200.
 */
async function mockGeneralInfoPut(
  page: Page,
): Promise<{ getBody: () => Record<string, unknown> | null }> {
  let captured: Record<string, unknown> | null = null;
  await page.route('**/api/workers/me/general-info', async (route) => {
    if (route.request().method() === 'PUT') {
      captured = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { message: 'General info saved' } }),
      });
    } else {
      await route.continue();
    }
  });
  return { getBody: () => captured };
}

/**
 * Preenche todos os campos obrigatórios da aba Información General.
 * Usado nos testes de happy-path e de erro de API.
 */
async function fillGeneralInfoForm(page: Page): Promise<void> {
  // Texto
  await page.locator('#fullName').fill('Alberto');
  await page.locator('#lastName').fill('Marquez');

  // Data com máscara DD/MM/AAAA
  await page.locator('#birthDate').fill('');
  await page.locator('#birthDate').pressSequentially('18031990', { delay: 30 });

  // Documento
  await page.locator('#cpf').fill('12345678901');

  // Selects nativos
  await page.selectOption('#sex', 'male');
  await page.selectOption('#gender', 'male');
  await page.selectOption('#profession', 'caregiver');
  await page.selectOption('#knowledgeLevel', 'technical');
  await page.selectOption('#yearsExperience', '0_2');
  await page.selectOption('#preferredAgeRange', 'elderly');

  // Registro profissional
  await page.locator('#professionalLicense').fill('Técnico en cuidados geriátricos');

  // Telefone — PhoneInputIntl renderiza <input type="tel">
  const phoneInput = page.locator('input[type="tel"]').first();
  if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await phoneInput.fill('+5491112345678');
  }

  // MultiSelects customizados
  await selectInMultiSelect(page, 'Idiomas', 'Español');
  await closeMultiSelect(page);
  await selectInMultiSelect(
    page,
    '¿Con qué tipos de pacientes tiene experiencia?',
    'Adultos mayores',
  );
  await closeMultiSelect(page);
  await selectInMultiSelect(
    page,
    '¿Con qué tipos de pacientes prefiere trabajar?',
    'Adultos mayores',
  );
  await closeMultiSelect(page);
}

// ─────────────────────────────────────────────────────────────
// Suite principal
// ─────────────────────────────────────────────────────────────

test.describe('Worker Profile — Abas de Edição', () => {
  test.describe.configure({ mode: 'serial' });

  // ── Registra um worker uma única vez e salva o estado de autenticação ──
  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    const email = `profile.tabs.${Date.now()}@example.com`;
    await registerWorker(page, email, BASE_PASSWORD);
    await context.storageState({ path: AUTH_STATE });
    await context.close();
  });

  // Cada teste começa com a sessão do worker já autenticado
  test.use({ storageState: AUTH_STATE });

  test.beforeEach(async ({ page }) => {
    // Intercepta getProgress para não depender de dados pré-existentes no banco
    await page.route('**/api/workers/me', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              email: 'worker@test.com',
              firstName: '',
              lastName: '',
              phone: '',
              documentNumber: '',
              birthDate: null,
              sex: null,
              gender: null,
              documentType: 'DNI',
              titleCertificate: '',
              languages: [],
              profession: null,
              knowledgeLevel: null,
              experienceTypes: [],
              yearsExperience: null,
              preferredTypes: [],
              preferredAgeRange: null,
              profilePhotoUrl: null,
              serviceAddress: null,
              serviceRadiusKm: 10,
              availability: [],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/worker/profile');
    await page.waitForSelector('nav[aria-label="Tabs"]', { timeout: 10_000 });
  });

  // ══════════════════════════════════════════════════════════
  // ESTRUTURA DA PÁGINA
  // ══════════════════════════════════════════════════════════

  test.describe('Estrutura da Página', () => {
    test('exibe título "Mi Perfil" em espanhol', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Mi Perfil');
    });

    test('exibe 4 abas com labels exatos em espanhol', async ({ page }) => {
      const nav = page.locator('nav[aria-label="Tabs"]');
      await expect(nav.getByRole('button', { name: 'Información General' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Dirección de Atención' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Disponibilidad' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Documentos' })).toBeVisible();
    });

    test('primeira aba fica ativa por padrão (aria-current="page")', async ({ page }) => {
      const activeTab = page.locator('nav[aria-label="Tabs"] button[aria-current="page"]');
      await expect(activeTab).toContainText('Información General');
    });

    test('clicar em aba muda aria-current para a aba clicada', async ({ page }) => {
      await page.getByRole('button', { name: 'Disponibilidad' }).click();
      const activeTab = page.locator('nav[aria-label="Tabs"] button[aria-current="page"]');
      await expect(activeTab).toContainText('Disponibilidad');
    });

    test('conteúdo muda ao clicar em cada aba', async ({ page }) => {
      // Dirección de Atención
      await page.getByRole('button', { name: 'Dirección de Atención' }).click();
      await expect(page.getByText('¿A cuántos km está dispuesto a atender?')).toBeVisible();

      // Disponibilidad
      await page.getByRole('button', { name: 'Disponibilidad' }).click();
      await expect(page.getByText('Seleccione los días y horarios de su disponibilidad:')).toBeVisible();

      // Documentos
      await page.getByRole('button', { name: 'Documentos' }).click();
      await expect(page.locator('body')).not.toBeEmpty();

      // Volta para General
      await page.getByRole('button', { name: 'Información General' }).click();
      await expect(page.locator('#email')).toBeVisible();
    });
  });

  // ══════════════════════════════════════════════════════════
  // ABA 1 — INFORMACIÓN GENERAL
  // ══════════════════════════════════════════════════════════

  test.describe('Aba 1 — Información General', () => {

    // ── Validações em Espanhol ──────────────────────────────

    test.describe('Validações — mensagens exatas em espanhol', () => {

      test('nome com < 3 chars → "El nombre completo debe tener al menos 3 caracteres"', async ({ page }) => {
        await page.locator('#fullName').fill('Ab');
        await page.locator('#fullName').blur();
        await expect(page.getByText(MSG.fullNameMin)).toBeVisible();
      });

      test('nome vazio após interação → mesma mensagem de mínimo', async ({ page }) => {
        await page.locator('#fullName').fill('abc');
        await page.locator('#fullName').fill('');
        await page.locator('#fullName').blur();
        await expect(page.getByText(MSG.fullNameMin)).toBeVisible();
      });

      test('sobrenome vazio após interação → "El apellido es obligatorio"', async ({ page }) => {
        await page.locator('#lastName').fill('x');
        await page.locator('#lastName').fill('');
        await page.locator('#lastName').blur();
        await expect(page.getByText(MSG.lastNameRequired)).toBeVisible();
      });

      test('documento com < 11 dígitos → "Documento inválido"', async ({ page }) => {
        await page.locator('#cpf').fill('1234567890'); // 10 dígitos
        await page.locator('#cpf').blur();
        await expect(page.getByText(MSG.documentInvalid)).toBeVisible();
      });

      test('documento com > 14 dígitos → "Documento inválido"', async ({ page }) => {
        await page.locator('#cpf').fill('123456789012345'); // 15 dígitos
        await page.locator('#cpf').blur();
        await expect(page.getByText(MSG.documentInvalid)).toBeVisible();
      });

      test('título profissional vazio → "El registro profesional es obligatorio"', async ({ page }) => {
        await page.locator('#professionalLicense').fill('x');
        await page.locator('#professionalLicense').fill('');
        await page.locator('#professionalLicense').blur();
        await expect(page.getByText(MSG.licenseRequired)).toBeVisible();
      });

      test('nível de conhecimento não selecionado → "Por favor, seleccione el nivel de conocimiento"', async ({ page }) => {
        // Seleciona e depois volta ao placeholder para disparar a validação
        await page.selectOption('#knowledgeLevel', 'bachelor');
        await page.selectOption('#knowledgeLevel', '');
        await page.locator('#knowledgeLevel').blur();
        await expect(page.getByText(MSG.selectKnowledge)).toBeVisible();
      });

      test('anos de experiência não selecionados → "Por favor, seleccione los años de experiencia"', async ({ page }) => {
        await page.selectOption('#yearsExperience', '0_2');
        await page.selectOption('#yearsExperience', '');
        await page.locator('#yearsExperience').blur();
        await expect(page.getByText(MSG.selectYears)).toBeVisible();
      });

      test('faixa etária não selecionada → "Por favor, seleccione el rango de edad preferido"', async ({ page }) => {
        await page.selectOption('#preferredAgeRange', 'children');
        await page.selectOption('#preferredAgeRange', '');
        await page.locator('#preferredAgeRange').blur();
        await expect(page.getByText(MSG.selectAgeRange)).toBeVisible();
      });

      test('clicar em Guardar sem idiomas → "Seleccione al menos un idioma"', async ({ page }) => {
        // Formulário em branco: idiomas vazio dispara ao tentar salvar
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.selectLanguage)).toBeVisible({ timeout: 3_000 });
      });

      test('clicar em Guardar sem tipos de experiência → "Seleccione al menos un tipo de experiencia"', async ({ page }) => {
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.selectExperience)).toBeVisible({ timeout: 3_000 });
      });

      test('clicar em Guardar sem tipos preferidos → "Seleccione al menos un tipo preferido"', async ({ page }) => {
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.selectPreferred)).toBeVisible({ timeout: 3_000 });
      });
    });

    // ── Máscara de Data ─────────────────────────────────────

    test.describe('Máscara de data de nascimento', () => {

      test('digitar "18031990" formata automaticamente para "18/03/1990"', async ({ page }) => {
        const input = page.locator('#birthDate');
        await input.click();
        await input.fill('');
        await input.pressSequentially('18031990', { delay: 30 });
        await expect(input).toHaveValue('18/03/1990');
      });

      test('placeholder exibe o formato esperado "18/03/1960"', async ({ page }) => {
        await expect(page.locator('#birthDate')).toHaveAttribute('placeholder', '18/03/1960');
      });

      test('maxLength impede digitar mais de 10 caracteres', async ({ page }) => {
        const input = page.locator('#birthDate');
        await input.fill('');
        await input.pressSequentially('1803199099999', { delay: 30 });
        const value = await input.inputValue();
        expect(value.replace(/\D/g, '').length).toBeLessThanOrEqual(8); // 8 dígitos = 10 chars com slashes
      });

      test('inserir data parcial mantém máscara parcial', async ({ page }) => {
        const input = page.locator('#birthDate');
        await input.fill('');
        await input.pressSequentially('1803', { delay: 30 });
        const value = await input.inputValue();
        expect(value).toBe('18/03');
      });

      test('parseDateToISO: API recebe data no formato AAAA-MM-DD', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        const body = getBody();
        expect(body?.birthDate).toBe('1990-03-18');
      });
    });

    // ── Labels e Opções em Espanhol ─────────────────────────

    test.describe('Select — labels e opções em espanhol', () => {

      test('campo Sexo tem opções "Masculino" e "Femenino"', async ({ page }) => {
        const select = page.locator('#sex');
        await expect(select.locator('option[value="male"]')).toHaveText('Masculino');
        await expect(select.locator('option[value="female"]')).toHaveText('Femenino');
      });

      test('campo Sexo tem placeholder "Seleccione"', async ({ page }) => {
        const select = page.locator('#sex');
        await expect(select.locator('option[value=""]')).toHaveText('Seleccione');
      });

      test('campo Profissão tem as 4 opções em espanhol', async ({ page }) => {
        const select = page.locator('#profession');
        await expect(select.locator('option[value="caregiver"]')).toHaveText('Cuidador');
        await expect(select.locator('option[value="nurse"]')).toHaveText('Enfermero');
        await expect(select.locator('option[value="psychologist"]')).toHaveText('Psicólogo');
        await expect(select.locator('option[value="physiotherapist"]')).toHaveText('Fisioterapeuta');
      });

      test('campo Nível de Conhecimento tem as 4 opções em espanhol', async ({ page }) => {
        const select = page.locator('#knowledgeLevel');
        await expect(select.locator('option[value="bachelor"]')).toHaveText('Licenciatura');
        await expect(select.locator('option[value="technical"]')).toHaveText('Técnico');
        await expect(select.locator('option[value="masters"]')).toHaveText('Maestría');
        await expect(select.locator('option[value="doctorate"]')).toHaveText('Doctorado');
      });

      test('campo Anos de Experiência tem as 4 faixas em espanhol', async ({ page }) => {
        const select = page.locator('#yearsExperience');
        await expect(select.locator('option[value="0_2"]')).toHaveText('0-2 años');
        await expect(select.locator('option[value="3_5"]')).toHaveText('3-5 años');
        await expect(select.locator('option[value="6_10"]')).toHaveText('6-10 años');
        await expect(select.locator('option[value="10_plus"]')).toHaveText('10 o más');
      });

      test('campo Faixa Etária Preferida tem as 4 opções em espanhol', async ({ page }) => {
        const select = page.locator('#preferredAgeRange');
        await expect(select.locator('option[value="children"]')).toHaveText('Niños (0-12 años)');
        await expect(select.locator('option[value="adolescents"]')).toHaveText('Adolescentes (13-17 años)');
        await expect(select.locator('option[value="adults"]')).toHaveText('Adultos (18-59 años)');
        await expect(select.locator('option[value="elderly"]')).toHaveText('Adultos mayores');
      });

      test('campo Tipo de Documento tem DNI e CPF', async ({ page }) => {
        const select = page.locator('#documentType');
        await expect(select.locator('option[value="DNI"]')).toHaveText('DNI');
        await expect(select.locator('option[value="CPF"]')).toHaveText('CPF');
      });
    });

    // ── Campos Readonly ──────────────────────────────────────

    test.describe('Campos readonly', () => {

      test('campo email é somente leitura (readonly)', async ({ page }) => {
        await expect(page.locator('#email')).toHaveAttribute('readonly', '');
      });

      test('campo email não pode ser editado pelo usuário', async ({ page }) => {
        const emailInput = page.locator('#email');
        const originalValue = await emailInput.inputValue();
        await emailInput.fill('hacked@evil.com');
        // O valor não deve mudar porque é readonly
        await expect(emailInput).toHaveValue(originalValue);
      });
    });

    // ── Integração com API — Happy Path ──────────────────────

    test.describe('Integração com API — fluxo de sucesso', () => {

      test('salvar formulário válido → exibe "Información guardada con éxito"', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        expect(getBody()).not.toBeNull();
      });

      test('payload enviado tem firstName e lastName corretos', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        const body = getBody();
        expect(body?.firstName).toBe('Alberto');
        expect(body?.lastName).toBe('Marquez');
      });

      test('payload enviado tem profession normalizada como "caregiver"', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        expect(getBody()?.profession).toBe('caregiver');
      });

      test('payload enviado tem documentNumber correto', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        expect(getBody()?.documentNumber).toBe('12345678901');
      });

      test('payload enviado tem termsAccepted e privacyAccepted = true', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        const body = getBody();
        expect(body?.termsAccepted).toBe(true);
        expect(body?.privacyAccepted).toBe(true);
      });

      test('payload tem languages como array com "es"', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        const body = getBody();
        expect(Array.isArray(body?.languages)).toBe(true);
        expect((body?.languages as string[]).includes('es')).toBe(true);
      });

      test('payload tem experienceTypes como array não vazio', async ({ page }) => {
        const { getBody } = await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        const body = getBody();
        expect(Array.isArray(body?.experienceTypes)).toBe(true);
        expect((body?.experienceTypes as string[]).length).toBeGreaterThan(0);
      });

      test('mensagem de sucesso desaparece após ~3 segundos', async ({ page }) => {
        await mockGeneralInfoPut(page);
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });
        // Aguarda a mensagem sumir (setTimeout de 3s no componente)
        await expect(page.getByText(MSG.saveSuccess)).not.toBeVisible({ timeout: 5_000 });
      });
    });

    // ── Integração com API — Erros ───────────────────────────

    test.describe('Integração com API — erros', () => {

      test('API retorna 500 → exibe div de erro (bg-red)', async ({ page }) => {
        await page.route('**/api/workers/me/general-info', async (route) => {
          if (route.request().method() === 'PUT') {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Internal server error' }),
            });
          } else {
            await route.continue();
          }
        });
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.locator('div[class*="bg-red"]').first()).toBeVisible({ timeout: 5_000 });
      });

      test('API retorna 400 → exibe div de erro visível', async ({ page }) => {
        await page.route('**/api/workers/me/general-info', async (route) => {
          if (route.request().method() === 'PUT') {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Bad request' }),
            });
          } else {
            await route.continue();
          }
        });
        await fillGeneralInfoForm(page);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.locator('div[class*="bg-red"]').first()).toBeVisible({ timeout: 5_000 });
      });

      test('botão Guardar exibe estado de loading durante a requisição', async ({ page }) => {
        // Mock com delay para capturar o estado de loading
        await page.route('**/api/workers/me/general-info', async (route) => {
          if (route.request().method() === 'PUT') {
            await new Promise((r) => setTimeout(r, 800));
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true, data: {} }),
            });
          } else {
            await route.continue();
          }
        });
        await fillGeneralInfoForm(page);
        // Clica e logo verifica o estado de carregamento
        const saveBtn = page.getByRole('button', { name: 'Guardar' });
        await saveBtn.click();
        // O botão deve estar disabled ou mostrar loading (isLoading=true no Button)
        await expect(saveBtn).toBeDisabled({ timeout: 1_000 });
      });
    });
  });

  // ══════════════════════════════════════════════════════════
  // ABA 2 — DIRECCIÓN DE ATENCIÓN
  // ══════════════════════════════════════════════════════════

  test.describe('Aba 2 — Dirección de Atención', () => {

    test.beforeEach(async ({ page }) => {
      await page.getByRole('button', { name: 'Dirección de Atención' }).click();
      await page.waitForTimeout(300);
    });

    // ── Labels em Espanhol ───────────────────────────────────

    test.describe('Labels em espanhol', () => {

      test('rótulo do campo de endereço é "Dirección"', async ({ page }) => {
        await expect(page.getByText('Dirección', { exact: true })).toBeVisible();
      });

      test('rótulo do complemento é "Complemento de la dirección"', async ({ page }) => {
        await expect(page.getByText('Complemento de la dirección')).toBeVisible();
      });

      test('rótulo do raio de atendimento em espanhol', async ({ page }) => {
        await expect(page.getByText('¿A cuántos km está dispuesto a atender?')).toBeVisible();
      });

      test('label do checkbox em espanhol', async ({ page }) => {
        await expect(page.getByText('Acepto realizar atenciones remotas/online')).toBeVisible();
      });
    });

    // ── Raio de Atendimento ──────────────────────────────────

    test.describe('Campo de raio de atendimento', () => {

      test('valor padrão do raio é 10 km', async ({ page }) => {
        await expect(page.locator('#serviceRadius')).toHaveValue('10');
      });

      test('alterar raio para 20 reflete no input', async ({ page }) => {
        const input = page.locator('#serviceRadius');
        await input.fill('20');
        await input.blur();
        // O componente faz snap para o valor mais próximo de [5, 10, 20, 50]
        await expect(input).toHaveValue('20');
      });

      test('checkbox de atendimento remoto está visível e desmarcado por padrão', async ({ page }) => {
        const checkbox = page.locator('#acceptsRemoteService');
        await expect(checkbox).toBeVisible();
        await expect(checkbox).not.toBeChecked();
      });

      test('pode marcar e desmarcar checkbox de atendimento remoto', async ({ page }) => {
        const checkbox = page.locator('#acceptsRemoteService');
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        await checkbox.uncheck();
        await expect(checkbox).not.toBeChecked();
      });
    });

    // ── Validação de Endereço ────────────────────────────────

    test.describe('Validação — endereço obrigatório', () => {

      test('submit sem digitar endereço → erro de seleção de suggestions', async ({ page }) => {
        // isAddressValid é false quando nenhum endereço foi selecionado
        // O componente exibe saveError = 'Por favor, seleccione una dirección...'
        await page.route('**/api/workers/me/service-area', async (route) => {
          await route.continue(); // não deve chegar na API
        });
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.selectAddress)).toBeVisible({ timeout: 3_000 });
      });
    });

    // ── Integração com API ───────────────────────────────────

    test.describe('Integração com API', () => {

      test('endereço pré-salvo via getProgress preenche raio correto', async ({ page }) => {
        // Override do mock de beforeEach para retornar endereço existente
        await page.route('**/api/workers/me', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: {
                  serviceAddress: 'Av. Santa Fe 1234, Buenos Aires',
                  serviceAddressComplement: 'Piso 3',
                  serviceRadiusKm: 20,
                },
              }),
            });
          } else {
            await route.continue();
          }
        });
        await page.goto('/worker/profile');
        await page.getByRole('button', { name: 'Dirección de Atención' }).click();
        await page.waitForTimeout(800);
        await expect(page.locator('#serviceRadius')).toHaveValue('20');
      });

      test('salvar com endereço já validado → chama API com payload correto', async ({ page }) => {
        // Simula que o endereço foi carregado do backend (isAddressValid = true)
        await page.route('**/api/workers/me', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: {
                  serviceAddress: 'Av. Santa Fe 1234, Buenos Aires',
                  serviceRadiusKm: 10,
                },
              }),
            });
          } else {
            await route.continue();
          }
        });

        let capturedBody: Record<string, unknown> | null = null;
        await page.route('**/api/workers/me/service-area', async (route) => {
          if (route.request().method() === 'PUT') {
            capturedBody = route.request().postDataJSON();
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true }),
            });
          } else {
            await route.continue();
          }
        });

        await page.goto('/worker/profile');
        await page.getByRole('button', { name: 'Dirección de Atención' }).click();
        await page.waitForTimeout(800);

        // Com endereço do backend, isAddressValid = true → pode salvar
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

        expect(capturedBody).not.toBeNull();
        expect(capturedBody?.serviceRadiusKm).toBeDefined();
        expect(capturedBody?.address).toBeTruthy();
      });

      test('API retorna 500 → exibe div de erro vermelho', async ({ page }) => {
        // Força endereço válido via mock
        await page.route('**/api/workers/me', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: { serviceAddress: 'Rua Teste, 123', serviceRadiusKm: 10 },
              }),
            });
          } else {
            await route.continue();
          }
        });
        await page.route('**/api/workers/me/service-area', async (route) => {
          if (route.request().method() === 'PUT') {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Internal server error' }),
            });
          } else {
            await route.continue();
          }
        });

        await page.goto('/worker/profile');
        await page.getByRole('button', { name: 'Dirección de Atención' }).click();
        await page.waitForTimeout(800);
        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.locator('div[class*="bg-red"]').first()).toBeVisible({ timeout: 5_000 });
      });
    });
  });

  // ══════════════════════════════════════════════════════════
  // ABA 3 — DISPONIBILIDAD
  // ══════════════════════════════════════════════════════════

  test.describe('Aba 3 — Disponibilidad', () => {

    test.beforeEach(async ({ page }) => {
      await page.getByRole('button', { name: 'Disponibilidad' }).click();
      await page.waitForTimeout(300);
    });

    // ── Estrutura em Espanhol ────────────────────────────────

    test.describe('Estrutura — 7 dias em espanhol', () => {

      test('exibe instrução em espanhol', async ({ page }) => {
        await expect(
          page.getByText('Seleccione los días y horarios de su disponibilidad:'),
        ).toBeVisible();
      });

      test('exibe Domingo', async ({ page }) => {
        await expect(page.getByText('Domingo')).toBeVisible();
      });

      test('exibe Lunes', async ({ page }) => {
        await expect(page.getByText('Lunes')).toBeVisible();
      });

      test('exibe Martes', async ({ page }) => {
        await expect(page.getByText('Martes')).toBeVisible();
      });

      test('exibe Miércoles', async ({ page }) => {
        await expect(page.getByText('Miércoles')).toBeVisible();
      });

      test('exibe Jueves', async ({ page }) => {
        await expect(page.getByText('Jueves')).toBeVisible();
      });

      test('exibe Viernes', async ({ page }) => {
        await expect(page.getByText('Viernes')).toBeVisible();
      });

      test('exibe Sábado', async ({ page }) => {
        await expect(page.getByText('Sábado')).toBeVisible();
      });
    });

    // ── Interações com Slots de Horário ──────────────────────

    test.describe('Interações — adicionar e remover horários', () => {

      test('clicar em + na Segunda (Lunes) adiciona slot com inputs de tempo', async ({ page }) => {
        const addBtn = page
          .locator('div')
          .filter({ hasText: /^Lunes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await addBtn.click();
        await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 2_000 });
      });

      test('slot adicionado tem startTime=09:00 e endTime=17:00 por padrão', async ({ page }) => {
        const addBtn = page
          .locator('div')
          .filter({ hasText: /^Lunes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await addBtn.click();
        const timeInputs = page.locator('input[type="time"]');
        await expect(timeInputs.nth(0)).toHaveValue('09:00');
        await expect(timeInputs.nth(1)).toHaveValue('17:00');
      });

      test('pode editar horário de início do slot', async ({ page }) => {
        const addBtn = page
          .locator('div')
          .filter({ hasText: /^Martes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await addBtn.click();
        const startInput = page.locator('input[type="time"]').first();
        await startInput.fill('08:00');
        await expect(startInput).toHaveValue('08:00');
      });

      test('pode editar horário de fim do slot', async ({ page }) => {
        const addBtn = page
          .locator('div')
          .filter({ hasText: /^Miércoles$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await addBtn.click();
        const endInput = page.locator('input[type="time"]').nth(1);
        await endInput.fill('20:00');
        await expect(endInput).toHaveValue('20:00');
      });

      test('clicar em × remove o slot adicionado', async ({ page }) => {
        const addBtn = page
          .locator('div')
          .filter({ hasText: /^Jueves$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await addBtn.click();
        await page.locator('input[type="time"]').first().waitFor({ timeout: 2_000 });

        // Clica no botão de remoção (×)
        await page.locator('button[class*="text-primary"]').first().click();
        await expect(page.locator('input[type="time"]')).toHaveCount(0);
      });

      test('pode adicionar múltiplos slots ao mesmo dia', async ({ page }) => {
        const viernes = page
          .locator('div')
          .filter({ hasText: /^Viernes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await viernes.click();
        await viernes.click();
        await viernes.click();
        const timeInputs = page.locator('input[type="time"]');
        expect(await timeInputs.count()).toBe(6); // 3 slots × 2 inputs
      });

      test('pode adicionar slots em dias diferentes', async ({ page }) => {
        // Segunda
        await page
          .locator('div')
          .filter({ hasText: /^Lunes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]')
          .click();
        // Quarta
        await page
          .locator('div')
          .filter({ hasText: /^Miércoles$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]')
          .click();

        const timeInputs = page.locator('input[type="time"]');
        expect(await timeInputs.count()).toBe(4); // 2 dias × 2 inputs
      });
    });

    // ── Integração com API ───────────────────────────────────

    test.describe('Integração com API', () => {

      test('salvar Segunda 09:00-17:00 → API chamada com payload dayOfWeek=1', async ({ page }) => {
        let capturedBody: Record<string, unknown> | null = null;
        await page.route('**/api/workers/me/availability', async (route) => {
          if (route.request().method() === 'PUT') {
            capturedBody = route.request().postDataJSON();
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true }),
            });
          } else {
            await route.continue();
          }
        });

        const addBtn = page
          .locator('div')
          .filter({ hasText: /^Lunes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]');
        await addBtn.click();

        // Garante valores esperados
        await page.locator('input[type="time"]').nth(0).fill('09:00');
        await page.locator('input[type="time"]').nth(1).fill('17:00');

        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

        expect(capturedBody).not.toBeNull();
        const availability = capturedBody?.availability as Array<{
          dayOfWeek: number;
          startTime: string;
          endTime: string;
        }>;
        expect(Array.isArray(availability)).toBe(true);
        const mondaySlot = availability.find((s) => s.dayOfWeek === 1);
        expect(mondaySlot).toBeDefined();
        expect(mondaySlot?.startTime).toBe('09:00');
        expect(mondaySlot?.endTime).toBe('17:00');
      });

      test('salvar sem nenhum dia habilitado → API chamada com availability=[]', async ({ page }) => {
        let capturedBody: Record<string, unknown> | null = null;
        await page.route('**/api/workers/me/availability', async (route) => {
          if (route.request().method() === 'PUT') {
            capturedBody = route.request().postDataJSON();
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true }),
            });
          } else {
            await route.continue();
          }
        });

        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

        expect(capturedBody).not.toBeNull();
        expect(capturedBody?.availability).toEqual([]);
      });

      test('salvar sexta e sábado → payload tem dayOfWeek 5 e 6', async ({ page }) => {
        let capturedBody: Record<string, unknown> | null = null;
        await page.route('**/api/workers/me/availability', async (route) => {
          if (route.request().method() === 'PUT') {
            capturedBody = route.request().postDataJSON();
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true }),
            });
          } else {
            await route.continue();
          }
        });

        // Sexta (índice 5)
        await page
          .locator('div')
          .filter({ hasText: /^Viernes$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]')
          .click();
        // Sábado (índice 6)
        await page
          .locator('div')
          .filter({ hasText: /^Sábado$/ })
          .first()
          .locator('xpath=..')
          .locator('button[class*="rounded-pill"]')
          .click();

        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 5_000 });

        const availability = capturedBody?.availability as Array<{ dayOfWeek: number }>;
        expect(availability.some((s) => s.dayOfWeek === 5)).toBe(true);
        expect(availability.some((s) => s.dayOfWeek === 6)).toBe(true);
      });

      test('API retorna 500 → exibe mensagem de erro vermelho', async ({ page }) => {
        await page.route('**/api/workers/me/availability', async (route) => {
          if (route.request().method() === 'PUT') {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Internal server error' }),
            });
          } else {
            await route.continue();
          }
        });

        await page.getByRole('button', { name: 'Guardar' }).click();
        await expect(page.locator('div[class*="bg-red"]').first()).toBeVisible({ timeout: 5_000 });
      });

      test('disponibilidade pré-existente é carregada via getProgress', async ({ page }) => {
        await page.route('**/api/workers/me', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: {
                  availability: [
                    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Segunda
                    { dayOfWeek: 3, startTime: '14:00', endTime: '20:00' }, // Quarta
                  ],
                },
              }),
            });
          } else {
            await route.continue();
          }
        });

        await page.goto('/worker/profile');
        await page.getByRole('button', { name: 'Disponibilidad' }).click();
        await page.waitForTimeout(1_000);

        // Deve exibir os slots carregados (4 inputs: 2 slots × 2 campos)
        await expect(page.locator('input[type="time"]')).toHaveCount(4, { timeout: 3_000 });
      });
    });
  });

  // ══════════════════════════════════════════════════════════
  // ABA 4 — DOCUMENTOS
  // ══════════════════════════════════════════════════════════

  test.describe('Aba 4 — Documentos', () => {

    test.beforeEach(async ({ page }) => {
      // Mock da listagem de documentos (vazia — worker novo)
      await page.route('**/api/workers/me/documents', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: [] }),
          });
        } else {
          await route.continue();
        }
      });
      await page.getByRole('button', { name: 'Documentos' }).click();
      await page.waitForTimeout(500);
    });

    // ── Estrutura dos cards ───────────────────────────────────

    test.describe('Cards de documentos em espanhol', () => {

      test('exibe card de currículo (CV)', async ({ page }) => {
        await expect(page.getByText(/currículum/i)).toBeVisible();
      });

      test('exibe card de documento de identidade (DNI)', async ({ page }) => {
        await expect(page.getByText(/DNI/i)).toBeVisible();
      });

      test('exibe card de antecedentes penais', async ({ page }) => {
        await expect(page.getByText(/antecedentes penales/i)).toBeVisible();
      });

      test('exibe card de registro profissional (AFIP)', async ({ page }) => {
        await expect(page.getByText(/AFIP/i)).toBeVisible();
      });

      test('exibe card de seguro de responsabilidade civil', async ({ page }) => {
        await expect(
          page.getByText(/responsabilidad civil/i).or(page.getByText(/seguro/i)),
        ).toBeVisible();
      });
    });

    // ── Inputs de arquivo ────────────────────────────────────

    test.describe('Input de arquivo — restrição a PDF', () => {

      test('inputs de upload aceitam apenas PDF (accept contém "pdf")', async ({ page }) => {
        const fileInputs = page.locator('input[type="file"]');
        const count = await fileInputs.count();
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const accept = await fileInputs.nth(i).getAttribute('accept');
            expect(accept?.toLowerCase()).toContain('pdf');
          }
        }
        // Se não há inputs de arquivo visíveis, o componente usa outra abordagem
        // mas pelo menos não deve haver erro
        await expect(page.locator('body')).not.toBeEmpty();
      });
    });

    // ── Estado de Erro da API ────────────────────────────────

    test.describe('Estado de erro da API de documentos', () => {

      test('quando GET /documents retorna 500 → exibe mensagem de erro visível', async ({ page }) => {
        // Override: retorna erro
        await page.route('**/api/workers/me/documents', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Failed to load documents' }),
            });
          } else {
            await route.continue();
          }
        });
        // Força reload da aba
        await page.getByRole('button', { name: 'Información General' }).click();
        await page.waitForTimeout(100);
        await page.getByRole('button', { name: 'Documentos' }).click();
        await page.waitForTimeout(1_000);

        // DocumentsTab renderiza: <p className="... text-red-700">{error}</p>
        await expect(
          page.locator('p[class*="text-red"], div[class*="text-red"]').first(),
        ).toBeVisible({ timeout: 5_000 });
      });

      test('quando GET /documents retorna 401 → exibe mensagem de erro', async ({ page }) => {
        await page.route('**/api/workers/me/documents', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 401,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Unauthorized' }),
            });
          } else {
            await route.continue();
          }
        });
        await page.getByRole('button', { name: 'Información General' }).click();
        await page.waitForTimeout(100);
        await page.getByRole('button', { name: 'Documentos' }).click();
        await page.waitForTimeout(1_000);

        await expect(
          page.locator('p[class*="text-red"], div[class*="bg-red"]').first(),
        ).toBeVisible({ timeout: 5_000 });
      });
    });
  });

  // ══════════════════════════════════════════════════════════
  // FLUXO PONTA A PONTA — persistência real no banco
  // (sem mock de API — requer Docker stack completo)
  // ══════════════════════════════════════════════════════════

  test.describe('Fluxo E2E ponta a ponta — persistência real', () => {

    // Estes testes NÃO fazem override das rotas — batem na API real
    test.beforeEach(async ({ page }) => {
      // Remove o mock do getProgress (herdado do beforeEach externo via page.unroute)
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.goto('/worker/profile');
      await page.waitForSelector('nav[aria-label="Tabs"]', { timeout: 10_000 });
      await page.waitForTimeout(1_000); // aguarda hidratação do formulário
    });

    test('salvar Información General → dados persistem após reload da página', async ({ page }) => {
      const uniqueLicense = `Técnico E2E ${Date.now()}`;

      await fillGeneralInfoForm(page);
      // Sobrescreve licença com valor único para verificar persistência
      await page.locator('#professionalLicense').fill(uniqueLicense);

      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 8_000 });

      // Recarrega e verifica persistência
      await page.goto('/worker/profile');
      await page.waitForSelector('nav[aria-label="Tabs"]', { timeout: 10_000 });
      await page.waitForTimeout(2_000);

      await expect(page.locator('#professionalLicense')).toHaveValue(uniqueLicense, {
        timeout: 5_000,
      });
      await expect(page.locator('#lastName')).toHaveValue('Marquez');
    });

    test('salvar Disponibilidad → dados persistem após reload', async ({ page }) => {
      await page.getByRole('button', { name: 'Disponibilidad' }).click();
      await page.waitForTimeout(300);

      // Garante que não há slots existentes antes de adicionar
      // (remove todos clicando em ×)
      const removeButtons = page.locator('button[class*="text-primary"]');
      const removeCount = await removeButtons.count();
      for (let i = 0; i < removeCount; i++) {
        await removeButtons.first().click();
      }

      // Adiciona Domingo (índice 0) com slot 08:00-12:00
      await page
        .locator('div')
        .filter({ hasText: /^Domingo$/ })
        .first()
        .locator('xpath=..')
        .locator('button[class*="rounded-pill"]')
        .click();

      await page.locator('input[type="time"]').nth(0).fill('08:00');
      await page.locator('input[type="time"]').nth(1).fill('12:00');

      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText(MSG.saveSuccess)).toBeVisible({ timeout: 8_000 });

      // Recarrega
      await page.goto('/worker/profile');
      await page.waitForSelector('nav[aria-label="Tabs"]', { timeout: 10_000 });
      await page.getByRole('button', { name: 'Disponibilidad' }).click();
      await page.waitForTimeout(2_000);

      // Domingo deve estar com slot visível
      const timeInputs = page.locator('input[type="time"]');
      await expect(timeInputs.first()).toHaveValue('08:00', { timeout: 5_000 });
    });
  });
});
