import { test, expect } from '@playwright/test';

test.describe('Worker Registration Flow - E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to registration page
    await page.goto('/worker/register');
  });

  test('should complete full registration with all fields', async ({ page }) => {
    // Step 1: General Info
    await test.step('Fill General Info Step', async () => {
      // Upload profile photo
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'profile.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-image-data'),
      });

      // Fill basic info
      await page.fill('input[name="email"]', 'test.worker@example.com');
      await page.fill('input[name="fullName"]', 'Alberto');
      await page.fill('input[name="lastName"]', 'Marquez');

      // Select sex and gender
      await page.selectOption('select[name="sex"]', 'male');
      await page.selectOption('select[name="gender"]', 'male');

      // Fill birth date
      await page.fill('input[type="date"]', '1980-03-18');

      // Select document type and fill number
      await page.selectOption('select[name="documentType"]', 'CPF');
      await page.fill('input[name="cpf"]', '12345678901');

      // Fill phone
      await page.fill('input[name="phone"]', '+5511999999999');

      // Select language
      await page.selectOption('select[name="languages.0"]', 'pt');

      // Select profession
      await page.selectOption('select[name="profession"]', 'psychologist');

      // Fill professional license
      await page.fill('input[name="professionalLicense"]', 'Licenciado em psicologia');

      // Select knowledge level
      await page.selectOption('select[name="knowledgeLevel"]', 'masters');

      // Select experience types
      await page.selectOption('select[name="experienceTypes.0"]', 'elderly');

      // Select years of experience
      await page.selectOption('select[name="yearsExperience"]', '10_plus');

      // Select preferred types
      await page.selectOption('select[name="preferredTypes.0"]', 'adhd');

      // Select preferred age range
      await page.selectOption('select[name="preferredAgeRange"]', 'elderly');

      // Verify all fields are filled
      await expect(page.locator('input[name="email"]')).toHaveValue('test.worker@example.com');
      await expect(page.locator('input[name="fullName"]')).toHaveValue('Alberto');
      await expect(page.locator('input[name="lastName"]')).toHaveValue('Marquez');

      // Click next button
      await page.click('button:has-text("Próximo")');
    });

    // Step 2: Service Address
    await test.step('Fill Service Address Step', async () => {
      // Wait for step 2 to load
      await expect(page.locator('text=Endereço de Atendimento')).toBeVisible();

      // Fill address
      await page.fill('input[name="address"]', 'Rua São Bento, 1500');
      await page.fill('input[name="complement"]', 'Ed. dos Palmares, ap. 202');

      // Set service radius
      await page.fill('input[name="serviceRadius"]', '10');

      // Toggle remote service
      await page.click('input[name="acceptsRemoteService"]');

      // Verify fields
      await expect(page.locator('input[name="address"]')).toHaveValue('Rua São Bento, 1500');
      await expect(page.locator('input[name="serviceRadius"]')).toHaveValue('10');

      // Click next button
      await page.click('button:has-text("Próximo")');
    });

    // Step 3: Availability
    await test.step('Fill Availability Step', async () => {
      // Wait for step 3 to load
      await expect(page.locator('text=Disponibilidade')).toBeVisible();

      // Enable Monday
      await page.click('text=Segunda');
      
      // Add time slot for Monday
      await page.click('button:has-text("Adicionar horário")');
      await page.fill('input[name="schedule.1.timeSlots.0.startTime"]', '09:00');
      await page.fill('input[name="schedule.1.timeSlots.0.endTime"]', '17:00');

      // Enable Wednesday
      await page.click('text=Quarta');
      
      // Add time slot for Wednesday
      await page.click('button:has-text("Adicionar horário")');
      await page.fill('input[name="schedule.3.timeSlots.0.startTime"]', '10:00');
      await page.fill('input[name="schedule.3.timeSlots.0.endTime"]', '16:00');

      // Click submit button
      await page.click('button:has-text("Finalizar Cadastro")');
    });

    // Verify success
    await test.step('Verify Registration Success', async () => {
      // Should redirect to Home page after completing registration
      await expect(page).toHaveURL('/');
      
      // Should NOT show incomplete registration banner since registration is complete
      await expect(page.locator('text=Complete seu cadastro')).not.toBeVisible();
    });
  });

  test('should show validation errors for empty required fields', async ({ page }) => {
    await test.step('Try to submit without filling fields', async () => {
      // Try to click next without filling anything
      await page.click('button:has-text("Próximo")');

      // Should show validation errors
      await expect(page.locator('text=Nome completo deve ter pelo menos 3 caracteres')).toBeVisible();
      await expect(page.locator('text=Sobrenome é obrigatório')).toBeVisible();
      await expect(page.locator('text=CPF inválido')).toBeVisible();
      await expect(page.locator('text=E-mail inválido')).toBeVisible();
      await expect(page.locator('text=Sexo é obrigatório')).toBeVisible();
      await expect(page.locator('text=Gênero é obrigatório')).toBeVisible();
      await expect(page.locator('text=Profissão é obrigatória')).toBeVisible();
    });
  });

  test('should validate email format', async ({ page }) => {
    await test.step('Enter invalid email', async () => {
      await page.fill('input[name="email"]', 'invalid-email');
      await page.blur('input[name="email"]');

      // Should show email validation error
      await expect(page.locator('text=E-mail inválido')).toBeVisible();
    });

    await test.step('Enter valid email', async () => {
      await page.fill('input[name="email"]', 'valid@example.com');
      await page.blur('input[name="email"]');

      // Error should disappear
      await expect(page.locator('text=E-mail inválido')).not.toBeVisible();
    });
  });

  test('should validate CPF length', async ({ page }) => {
    await test.step('Enter short CPF', async () => {
      await page.fill('input[name="cpf"]', '123');
      await page.blur('input[name="cpf"]');

      await expect(page.locator('text=CPF inválido')).toBeVisible();
    });

    await test.step('Enter valid CPF', async () => {
      await page.fill('input[name="cpf"]', '12345678901');
      await page.blur('input[name="cpf"]');

      await expect(page.locator('text=CPF inválido')).not.toBeVisible();
    });
  });

  test('should validate phone number', async ({ page }) => {
    await test.step('Enter short phone', async () => {
      await page.fill('input[name="phone"]', '123');
      await page.blur('input[name="phone"]');

      await expect(page.locator('text=Telefone inválido')).toBeVisible();
    });

    await test.step('Enter valid phone', async () => {
      await page.fill('input[name="phone"]', '+5511999999999');
      await page.blur('input[name="phone"]');

      await expect(page.locator('text=Telefone inválido')).not.toBeVisible();
    });
  });

  test('should persist data when navigating between steps', async ({ page }) => {
    // Fill Step 1
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[name="lastName"]', 'Silva');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="cpf"]', '12345678901');
    await page.fill('input[name="phone"]', '+5511999999999');
    await page.fill('input[type="date"]', '1990-01-01');
    await page.selectOption('select[name="sex"]', 'male');
    await page.selectOption('select[name="gender"]', 'male');
    await page.selectOption('select[name="documentType"]', 'CPF');
    await page.fill('input[name="professionalLicense"]', 'CRM-12345');
    await page.selectOption('select[name="languages.0"]', 'pt');
    await page.selectOption('select[name="profession"]', 'psychologist');
    await page.selectOption('select[name="knowledgeLevel"]', 'bachelor');
    await page.selectOption('select[name="experienceTypes.0"]', 'adults');
    await page.selectOption('select[name="yearsExperience"]', '3_5');
    await page.selectOption('select[name="preferredTypes.0"]', 'adults');
    await page.selectOption('select[name="preferredAgeRange"]', 'adults');

    // Go to Step 2
    await page.click('button:has-text("Próximo")');
    await expect(page.locator('text=Endereço de Atendimento')).toBeVisible();

    // Fill Step 2
    await page.fill('input[name="address"]', 'Test Address');
    await page.fill('input[name="serviceRadius"]', '15');

    // Go back to Step 1
    await page.click('button:has-text("Voltar")');

    // Verify Step 1 data persisted
    await expect(page.locator('input[name="fullName"]')).toHaveValue('Test User');
    await expect(page.locator('input[name="lastName"]')).toHaveValue('Silva');
    await expect(page.locator('input[name="email"]')).toHaveValue('test@example.com');

    // Go to Step 2 again
    await page.click('button:has-text("Próximo")');

    // Verify Step 2 data persisted
    await expect(page.locator('input[name="address"]')).toHaveValue('Test Address');
    await expect(page.locator('input[name="serviceRadius"]')).toHaveValue('15');
  });

  test('should send all fields to backend on submission', async ({ page }) => {
    // Intercept API call
    await page.route('**/api/workers/*/step', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();

      // Verify all required fields are present in payload
      expect(postData).toHaveProperty('firstName');
      expect(postData).toHaveProperty('lastName');
      expect(postData).toHaveProperty('sex');
      expect(postData).toHaveProperty('gender');
      expect(postData).toHaveProperty('birthDate');
      expect(postData).toHaveProperty('documentType');
      expect(postData).toHaveProperty('documentNumber');
      expect(postData).toHaveProperty('phone');
      expect(postData).toHaveProperty('languages');
      expect(postData).toHaveProperty('profession');
      expect(postData).toHaveProperty('knowledgeLevel');
      expect(postData).toHaveProperty('titleCertificate');
      expect(postData).toHaveProperty('experienceTypes');
      expect(postData).toHaveProperty('yearsExperience');
      expect(postData).toHaveProperty('preferredTypes');
      expect(postData).toHaveProperty('preferredAgeRange');
      expect(postData).toHaveProperty('termsAccepted');
      expect(postData).toHaveProperty('privacyAccepted');

      // Verify array fields are arrays
      expect(Array.isArray(postData.languages)).toBe(true);
      expect(Array.isArray(postData.experienceTypes)).toBe(true);
      expect(Array.isArray(postData.preferredTypes)).toBe(true);

      await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    });

    // Fill and submit form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="fullName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[name="cpf"]', '12345678901');
    await page.fill('input[name="phone"]', '+5511999999999');
    await page.fill('input[type="date"]', '1990-01-01');
    await page.selectOption('select[name="sex"]', 'male');
    await page.selectOption('select[name="gender"]', 'male');
    await page.selectOption('select[name="documentType"]', 'CPF');
    await page.fill('input[name="professionalLicense"]', 'CRM-12345');
    await page.selectOption('select[name="languages.0"]', 'pt');
    await page.selectOption('select[name="profession"]', 'psychologist');
    await page.selectOption('select[name="knowledgeLevel"]', 'bachelor');
    await page.selectOption('select[name="experienceTypes.0"]', 'adults');
    await page.selectOption('select[name="yearsExperience"]', '3_5');
    await page.selectOption('select[name="preferredTypes.0"]', 'adults');
    await page.selectOption('select[name="preferredAgeRange"]', 'adults');

    await page.click('button:has-text("Próximo")');
  });
});
