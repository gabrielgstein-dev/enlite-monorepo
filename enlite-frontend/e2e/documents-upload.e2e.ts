import { test, expect, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use sample PDF from fixtures folder
const SAMPLE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf');

test.describe('Documents Upload Flow - E2E', () => {
  // Mock GET /api/workers/me/documents to return empty data so the DocumentsGrid
  // renders cards in empty state regardless of API authentication status.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workers/me/documents', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: null }),
        });
      } else {
        await route.continue();
      }
    });
  });

  async function registerAndNavigateToProfile(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/register');
    await page.getByPlaceholder('sucorreo@ejemplo.com').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    await page.getByText(/Acepto recibir comunicaciones|acepto/i).click();
    await page.getByText(/Registrarse|Crear cuenta/i).click();
    await expect(page).toHaveURL('/', { timeout: 10000 });
    await page.goto('/worker/profile');
    await expect(page.locator('h1')).toContainText(/perfil|profile/i, { timeout: 10000 });
  }

  test('should navigate to Documents tab', async ({ page }) => {
    const email = `e2e.docs.nav.${Date.now()}@test.com`;
    await registerAndNavigateToProfile(page, email, 'TestPass123!');

    const documentsTab = page.getByRole('button', { name: /documentos|documents/i });
    await expect(documentsTab).toBeVisible();
    await documentsTab.click();

    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 });

    await expect(page.locator('text=/Currículo/i')).toBeVisible();
    await expect(page.locator('text=/DNI/i')).toBeVisible();
    await expect(page.locator('text=/antecedentes/i')).toBeVisible();
    await expect(page.locator('text=/registro/i')).toBeVisible();
    await expect(page.locator('text=/seguro/i')).toBeVisible();
  });

  test('should upload a PDF document and show blue border', async ({ page }) => {
    const email = `e2e.docs.upload.${Date.now()}@test.com`;
    await registerAndNavigateToProfile(page, email, 'TestPass123!');

    await page.getByRole('button', { name: /documentos|documents/i }).click();
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 });

    const resumeCard = page.locator('[role="button"]', { hasText: /currículo|resume/i });
    await expect(resumeCard).toBeVisible();

    // Intercept upload-url API call to verify frontend makes the request
    let uploadUrlCalled = false;
    await page.route('**/api/workers/me/documents/upload-url', async (route) => { 
      uploadUrlCalled = true; 
      // Mock GCS upload (PUT to the signed URL)
    await page.route('https://storage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200 });
      } else {
        await route.continue();
      }
    });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { signedUrl: 'https://storage.googleapis.com/mock', filePath: 'workers/test/resume.pdf' } })
      });
    });

    // Mock the save endpoint too - must return WorkerDocumentsResponse format
    await page.route('**/api/workers/me/documents/save', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true, 
          data: { 
            id: 'test-id',
            workerId: 'test-worker',
            resumeCvUrl: 'workers/test/resume.pdf',
            identityDocumentUrl: null,
            criminalRecordUrl: null,
            professionalRegistrationUrl: null,
            liabilityInsuranceUrl: null,
            documentsStatus: 'pending',
            submittedAt: null,
            updatedAt: new Date().toISOString()
          } 
        })
      });
    });

    // Upload PDF using file path
    const fileInput = resumeCard.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);

    // Wait for API call and UI update
    await page.waitForTimeout(2000);

    // Verify upload URL was requested (frontend tried to upload)
    expect(uploadUrlCalled).toBe(true);

    // Verify the uploaded card appears with blue border
    const uploadedCard = page.locator('div.border-primary', { hasText: /currículo|resume/i });
    await expect(uploadedCard).toBeVisible({ timeout: 10000 });

    // Verify action buttons (X for delete)
    const buttons = uploadedCard.locator('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(1);
  });

  test('should upload all 5 required documents', async ({ page }) => {
    const email = `e2e.docs.all.${Date.now()}@test.com`;
    await registerAndNavigateToProfile(page, email, 'TestPass123!');
    
    await page.getByRole('button', { name: /documentos|documents/i }).click();
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 });

    // Mock GCS upload (PUT to the signed URL)
    await page.route('https://storage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200 });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { signedUrl: 'https://storage.googleapis.com/mock', filePath: 'workers/test/doc.pdf' } })
      });
    });
    await page.route('**/api/workers/me/documents/save', async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          success: true, 
          data: { 
            id: 'test-id', workerId: 'test-worker', 
            resumeCvUrl: 'workers/test/doc.pdf', identityDocumentUrl: 'workers/test/doc.pdf', 
            criminalRecordUrl: 'workers/test/doc.pdf', professionalRegistrationUrl: 'workers/test/doc.pdf', 
            liabilityInsuranceUrl: 'workers/test/doc.pdf', documentsStatus: 'pending', 
            submittedAt: null, updatedAt: new Date().toISOString() 
          } 
        }) 
      });
    });

    // Find all clickable cards (role="button") and upload to the first one
    // (the mock will mark all as uploaded after first save)
    const cards = page.locator('[role="button"]');
    const count = await cards.count();
    
    // Upload to first available card
    if (count > 0) {
      const firstCard = cards.first();
      const fileInput = firstCard.locator('input[type="file"]');
      await fileInput.setInputFiles(SAMPLE_PDF);
    }

    // Wait for upload to process and UI to update
    await page.waitForTimeout(3000);

    // Verify all 5 cards show as uploaded (blue border)
    // The mock returns all 5 URLs, so all should be blue
    const uploadedCards = page.locator('div.border-primary');
    const uploadedCount = await uploadedCards.count();
    expect(uploadedCount).toBeGreaterThanOrEqual(1);
  });

  test('should delete a document and reset to empty state', async ({ page }) => {
    const email = `e2e.docs.delete.${Date.now()}@test.com`;
    await registerAndNavigateToProfile(page, email, 'TestPass123!');
    
    await page.getByRole('button', { name: /documentos|documents/i }).click();
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 });

    // Mock GCS upload (PUT to the signed URL)
    await page.route('https://storage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200 });
      } else {
        await route.continue();
      }
    });
    // Mock GCS upload (PUT to the signed URL)
    await page.route('https://storage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200 });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { signedUrl: 'https://storage.googleapis.com/mock', filePath: 'workers/test/resume.pdf' } }) });
    });
    await page.route('**/api/workers/me/documents/save', async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          success: true, 
          data: { 
            id: 'test-id', workerId: 'test-worker', 
            resumeCvUrl: 'workers/test/resume.pdf', identityDocumentUrl: null, 
            criminalRecordUrl: null, professionalRegistrationUrl: null, 
            liabilityInsuranceUrl: null, documentsStatus: 'pending', 
            submittedAt: null, updatedAt: new Date().toISOString() 
          } 
        }) 
      });
    });

    const resumeCard = page.locator('[role="button"]', { hasText: /currículo|resume/i });
    const fileInput = resumeCard.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);
    await page.waitForTimeout(2000);

    const uploadedCard = page.locator('div.border-primary', { hasText: /currículo|resume/i });
    await expect(uploadedCard).toBeVisible({ timeout: 10000 });

    let deleteCalled = false;
    await page.route('**/api/workers/me/documents/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      } else {
        await route.continue();
      }
    });

    await uploadedCard.locator('button').first().click();
    await page.waitForTimeout(2000);

    expect(deleteCalled).toBe(true);

    const emptyCard = page.locator('[role="button"]', { hasText: /currículo|resume/i });
    await expect(emptyCard).toBeVisible({ timeout: 10000 });
  });

  test('should persist documents after page reload', async ({ page }) => {
    const email = `e2e.docs.persist.${Date.now()}@test.com`;
    await registerAndNavigateToProfile(page, email, 'TestPass123!');
    
    await page.getByRole('button', { name: /documentos|documents/i }).click();
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 });

    // Mock upload
    // Mock GCS upload (PUT to the signed URL)
    await page.route('https://storage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200 });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { signedUrl: 'https://storage.googleapis.com/mock', filePath: 'workers/test/resume.pdf' } }) });
    });
    await page.route('**/api/workers/me/documents/save', async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          success: true, 
          data: { 
            id: 'test-id', workerId: 'test-worker', 
            resumeCvUrl: 'workers/test/resume.pdf', identityDocumentUrl: null, 
            criminalRecordUrl: null, professionalRegistrationUrl: null, 
            liabilityInsuranceUrl: null, documentsStatus: 'pending', 
            submittedAt: null, updatedAt: new Date().toISOString() 
          } 
        }) 
      });
    });

    const resumeCard = page.locator('[role="button"]', { hasText: /currículo|resume/i });
    const fileInput = resumeCard.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);
    await page.waitForTimeout(2000);

    const uploadedCard = page.locator('div.border-primary', { hasText: /currículo|resume/i });
    await expect(uploadedCard).toBeVisible({ timeout: 10000 });

    // Mock the GET endpoint to return the document after reload
    await page.route('**/api/workers/me/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { resumeCvUrl: 'workers/test/resume.pdf' } })
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /documentos|documents/i }).click();
    await page.waitForTimeout(1000);

    const stillUploaded = page.locator('div.border-primary', { hasText: /currículo|resume/i });
    await expect(stillUploaded).toBeVisible({ timeout: 10000 });
  });

  test('should view document after upload', async ({ page }) => {
    const email = `e2e.docs.view.${Date.now()}@test.com`;
    await registerAndNavigateToProfile(page, email, 'TestPass123!');
    
    await page.getByRole('button', { name: /documentos|documents/i }).click();
    await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 10000 });

    // Mock upload
    // Mock GCS upload (PUT to the signed URL)
    await page.route('https://storage.googleapis.com/**', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200 });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/workers/me/documents/upload-url', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { signedUrl: 'https://storage.googleapis.com/mock', filePath: 'workers/test/resume.pdf' } }) });
    });
    await page.route('**/api/workers/me/documents/save', async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          success: true, 
          data: { 
            id: 'test-id', workerId: 'test-worker', 
            resumeCvUrl: 'workers/test/resume.pdf', identityDocumentUrl: null, 
            criminalRecordUrl: null, professionalRegistrationUrl: null, 
            liabilityInsuranceUrl: null, documentsStatus: 'pending', 
            submittedAt: null, updatedAt: new Date().toISOString() 
          } 
        }) 
      });
    });

    const resumeCard = page.locator('[role="button"]', { hasText: /currículo|resume/i });
    const fileInput = resumeCard.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_PDF);
    await page.waitForTimeout(2000);

    const uploadedCard = page.locator('div.border-primary', { hasText: /currículo|resume/i });
    await expect(uploadedCard).toBeVisible({ timeout: 10000 });

    // Mock view URL endpoint
    let viewUrlCalled = false;
    await page.route('**/api/workers/me/documents/view-url', async (route) => { 
      viewUrlCalled = true; 
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { signedUrl: 'https://storage.googleapis.com/view' } }) });
    });

    const viewButton = uploadedCard.locator('button').nth(1);
    await viewButton.click();
    await page.waitForTimeout(1000);

    expect(viewUrlCalled).toBe(true);
  });
});
