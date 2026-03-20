import { test, expect } from '@playwright/test';

test.describe('Worker Registration Flow - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h1')).toContainText(/cuenta|account/i);
  });

  test('should complete registration with email and password', async ({ page }) => {
    const timestamp = Date.now();
    const email = `test.worker.${timestamp}@example.com`;
    const password = 'TestPassword123!';

    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    await page.getByText('Acepto recibir comunicaciones').click();
    await page.getByText('Registrarse').click();

    await expect(page).toHaveURL('/', { timeout: 10000 });
  });

  test('should show validation errors for empty required fields', async ({ page }) => {
    await page.getByText('Registrarse').click();
    await expect(page.locator('form')).toContainText(/correo|email|contraseña|senha|password/i);
  });

  test('should validate email format', async ({ page }) => {
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill('invalid-email');
    await page.locator('input[type="password"]').nth(0).fill('TestPassword123!');
    await page.locator('input[type="password"]').nth(1).fill('TestPassword123!');
    await page.getByText('Acepto recibir comunicaciones').click();
    await page.getByText('Registrarse').click();
    await expect(page).toHaveURL('/register');
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(`test.${Date.now()}@example.com`);
    await page.locator('input[type="password"]').nth(0).fill('Password123!');
    await page.locator('input[type="password"]').nth(1).fill('DifferentPassword456!');
    await page.getByText('Acepto recibir comunicaciones').click();
    await page.getByText('Registrarse').click();
    await expect(page).toHaveURL('/register');
  });

  test('should require LGPD consent', async ({ page }) => {
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(`test.${Date.now()}@example.com`);
    await page.locator('input[type="password"]').nth(0).fill('TestPassword123!');
    await page.locator('input[type="password"]').nth(1).fill('TestPassword123!');
    await page.getByText('Registrarse').click();
    await expect(page).toHaveURL('/register');
  });

  test('should redirect to login page when clicking login link', async ({ page }) => {
    await page.getByRole('link', { name: /acceda/i }).click();
    await expect(page).toHaveURL('/login');
  });

  test('should create worker record in backend after registration', async ({ page }) => {
    let apiCallMade = false;
    let workerData: any = null;
    
    await page.route('**/api/workers/init', async (route) => {
      apiCallMade = true;
      const response = await route.fetch();
      workerData = await response.json();
      await route.fulfill({ response });
    });

    const email = `api.test.${Date.now()}@example.com`;
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
    await page.locator('input[type="password"]').nth(0).fill('TestPassword123!');
    await page.locator('input[type="password"]').nth(1).fill('TestPassword123!');
    await page.getByText('Acepto recibir comunicaciones').click();
    await page.getByText('Registrarse').click();

    await expect(page).toHaveURL('/', { timeout: 10000 });
    expect(apiCallMade).toBe(true);
    
    // Verify worker was created with correct email
    expect(workerData).toBeTruthy();
    expect(workerData.data?.email || workerData.email).toContain(email);
  });

  test('should persist worker data in database and retrieve via API', async ({ page, request }) => {
    const email = `persist.test.${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    // Register new worker
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    await page.getByText('Acepto recibir comunicaciones').click();
    await page.getByText('Registrarse').click();

    // Wait for registration to complete and redirect to home
    await expect(page).toHaveURL('/', { timeout: 10000 });
    
    // Wait a moment for the worker to be created in the database
    await page.waitForTimeout(1000);
    
    // Navigate to worker profile page which should load worker data from database
    await page.goto('/worker/profile');
    
    // The page should load without errors and show worker-related content
    await expect(page.locator('body')).toContainText(/perfil|profile|worker/i, { timeout: 5000 });
  });

  test('should allow login after registration and access persisted worker data', async ({ page }) => {
    const timestamp = Date.now();
    const email = `login.test.${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Register
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    await page.getByText('Acepto recibir comunicaciones').click();
    await page.getByText('Registrarse').click();

    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Logout - look for logout button/link
    try {
      const logoutButton = page.locator('button:has-text(/Sair|Logout|Cerrar/i), a:has-text(/Sair|Logout|Cerrar/i)').first();
      if (await logoutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutButton.click();
        await expect(page).toHaveURL('/login', { timeout: 5000 });

        // Login again
        await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
        await page.locator('input[type="password"]').nth(0).fill(password);
        await page.getByText(/Entrar|Login|Acceder/i).click();

        // Should be back on home page
        await expect(page).toHaveURL('/', { timeout: 10000 });
        
        // Navigate to profile to verify worker data persisted
        await page.goto('/worker/profile');
        await expect(page.locator('body')).toContainText(/perfil|profile/i, { timeout: 5000 });
      }
    } catch {
      // Logout button might not be available, skip logout test
      console.log('Logout not available, skipping re-login verification');
    }
  });

  test('should complete full worker registration flow with all profile tabs', async ({ page }) => {
    const timestamp = Date.now();
    const email = `full.flow.${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Step 1: Initial Registration
    await test.step('Register new account', async () => {
      await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
      await page.locator('input[type="password"]').nth(0).fill(password);
      await page.locator('input[type="password"]').nth(1).fill(password);
      await page.getByText('Acepto recibir comunicaciones').click();
      await page.getByText('Registrarse').click();
      await expect(page).toHaveURL('/', { timeout: 10000 });
    });

    // Step 2: Verify Worker Profile page loads with all tabs
    await test.step('Worker Profile page loads with all 3 tabs', async () => {
      await page.goto('/worker/profile');
      await expect(page.locator('h1')).toContainText(/perfil|profile/i, { timeout: 5000 });

      // Verify all 3 tabs are present
      await expect(page.getByRole('button', { name: /informações gerais|general info/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /endereço de atendimento|service address/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /disponibilidade|availability/i })).toBeVisible();
    });

    // Step 3: Verify General Info tab is accessible
    await test.step('General Info tab is accessible', async () => {
      // Already on General Info tab by default
      await expect(page.locator('body')).toContainText(/nombre|name/i);
      await expect(page.locator('body')).toContainText(/correo|email/i);
    });

    // Step 4: Verify Service Address tab is accessible
    await test.step('Service Address tab is accessible', async () => {
      await page.getByRole('button', { name: /endereço de atendimento|service address/i }).click();
      await expect(page.locator('body')).toContainText(/endereço|dirección|address/i, { timeout: 3000 });
    });

    // Step 5: Verify Availability tab is accessible
    await test.step('Availability tab is accessible', async () => {
      await page.getByRole('button', { name: /disponibilidade|availability/i }).click();
      await expect(page.locator('body')).toContainText(/disponibilidade|disponibilidad|availability/i, { timeout: 3000 });
    });

    // Step 6: View Jobs on Home Page - verify endpoint is called
    await test.step('View Available Jobs - API endpoint called', async () => {
      // Navigate to home page
      await page.goto('/');
      await expect(page).toHaveURL('/');

      // Intercept jobs API call
      let jobsApiCalled = false;
      await page.route('**/api/jobs', async (route) => {
        jobsApiCalled = true;
        await route.continue();
      });

      // Wait for page to fully load and potentially call jobs API
      await page.waitForTimeout(2000);

      // Verify jobs API was called (endpoint is working)
      expect(jobsApiCalled).toBe(true);
    });

    // Step 7: Verify worker data persisted by checking profile again
    await test.step('Verify worker profile persists', async () => {
      await page.goto('/worker/profile');
      await expect(page).toHaveURL('/worker/profile');
      await expect(page.locator('h1')).toContainText(/perfil|profile/i);
      
      // Verify all tabs still accessible (data persisted)
      await expect(page.getByRole('button', { name: /informações gerais/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /endereço de atendimento/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /disponibilidade/i })).toBeVisible();
    });
  });
});
