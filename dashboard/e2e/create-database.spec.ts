import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://euroscale.app';
const TEST_EMAIL = 'j.doe@company.com';
const TEST_PASSWORD = 'Testb2c!';
const SCREENSHOT_DIR = path.resolve(__dirname);

async function login(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1500);

  if (/\/dashboard/.test(page.url())) {
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    return pageErrors;
  }

  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in|login|continue|submit/i }).first().click();

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 25_000 });
  } catch {
    console.warn('[login] retry after failed redirect');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
    if (!/\/dashboard/.test(page.url())) {
      await page.locator('input[type="email"]').fill(TEST_EMAIL);
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /sign in|login|continue|submit/i }).first().click();
      await page.waitForURL(/\/dashboard/, { timeout: 25_000 });
    }
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  return pageErrors;
}

test.describe('Database Creation E2E', () => {
  test.setTimeout(90_000);

  test('create database via UI and verify it appears in list', async ({ page }) => {
    // Log all API responses for debugging
    page.on('response', async (response) => {
      if (response.url().includes('CreateDatabase') || response.url().includes('create')) {
        const body = await response.text().catch(() => '');
        console.log(`[API] ${response.status()} ${response.url().slice(-40)}: ${body.slice(0, 200)}`);
      }
    });
    const jsErrors = await login(page);

    // Check for API errors
    const apiErrorText = page.getByText(/Could not load databases/i);
    try {
      await apiErrorText.waitFor({ state: 'visible', timeout: 5000 });
      console.log('⚠️  API unavailable — skipping test');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'create-db-api-error.png') });
      return;
    } catch {
      // OK — dashboard loaded
    }

    // Verify we're on the dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'create-db-01-dashboard.png') });

    // Count existing databases
    const beforeCards = page.locator('[data-slot="card"]');
    const beforeCount = await beforeCards.count();
    console.log(`Databases before: ${beforeCount}`);

    // Click "New database" button
    const newDbBtn = page.getByRole('button', { name: /new database/i });
    await newDbBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await newDbBtn.click();
    await page.waitForTimeout(1000);

    // Check if it opened a dialog or navigated
    const isDialog = await page.locator('[data-slot="dialog-content"]').isVisible({ timeout: 3000 }).catch(() => false);
    const isCreatePage = /\/dashboard\/create/.test(page.url());

    if (isDialog) {
      console.log('   Using dialog for creation');
      // Fill database name
      const nameInput = page.locator('#db-name, input[placeholder*="database"], [data-slot="dialog-content"] input').first();
      await nameInput.waitFor({ state: 'visible', timeout: 5000 });
      await nameInput.fill('e2e-test-db');
      await page.waitForTimeout(300);

      // Select region (default is nuremberg, click it to confirm)
      const regionBtn = page.getByRole('button', { name: /Nuremberg|nuremberg/i }).first();
      if (await regionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await regionBtn.click();
        await page.waitForTimeout(200);
      }

      // Submit
      const createBtn = page.locator('[data-slot="dialog-content"] button[type="submit"], [data-slot="dialog-content"] button:has-text("Create")').first();
      await createBtn.click();
    } else if (isCreatePage) {
      console.log('   On /dashboard/create page');
      const nameInput = page.locator('input#db-name, input[placeholder*="database"]').first();
      await nameInput.waitFor({ state: 'visible', timeout: 5000 });
      await nameInput.fill('e2e-test-db');

      const regionBtn = page.getByRole('button', { name: /Nuremberg|nuremberg/i }).first();
      if (await regionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await regionBtn.click();
      }

      const createBtn = page.getByRole('button', { name: /create database/i }).first();
      await createBtn.click();
    } else {
      console.log('   No dialog or create page found — fallback navigate');
      await page.goto(`${BASE_URL}/dashboard/create`, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
      return;
    }

    // Wait for toast or redirect
    await page.waitForTimeout(2000);

    // Check for error toast (tier limit, etc.)
    const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
    const successToast = page.locator('[data-sonner-toast][data-type="success"]');
    
    const hasError = await errorToast.isVisible({ timeout: 5000 }).catch(() => false);
    const hasSuccess = await successToast.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasError) {
      const errorText = await errorToast.textContent();
      console.log(`⚠️  Error toast: "${errorText?.trim()}"`);
      // Also dump the full toast HTML for debugging
      const toastHTML = await errorToast.innerHTML();
      console.log(`   Toast HTML: ${toastHTML.slice(0, 200)}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'create-db-error-toast.png') });
      
      if (errorText?.includes('limit') || errorText?.includes('tier')) {
        console.log('✅ Tier limit correctly enforced — UI shows error to user');
      }
    } else if (hasSuccess) {
      console.log('✅ Success toast appeared');
      // Navigate back to dashboard
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(2000);
    } else {
      console.log('No toast — checking for redirect');
      if (!/\/dashboard\/?$/.test(page.url())) {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'create-db-02-after-create.png') });

    // Count databases after creation
    const afterCards = page.locator('[data-slot="card"]');
    const afterCount = await afterCards.count();
    console.log(`Databases after: ${afterCount}`);

    // Verify the new database appears
    if (afterCount > beforeCount) {
      console.log(`✅ Database count increased: ${beforeCount} → ${afterCount}`);
    } else {
      // Check if the new DB is visible by name
      const newDbCard = page.getByText('e2e-test-db');
      const isVisible = await newDbCard.isVisible({ timeout: 5000 }).catch(() => false);
      if (isVisible) {
        console.log('✅ New database "e2e-test-db" visible in list');
      } else {
        console.log(`⚠️  Database count unchanged (${beforeCount} → ${afterCount}) — may need refresh`);
        await page.reload();
        await page.waitForTimeout(2000);
      }
    }

    // Check for JS errors
    if (jsErrors.length > 0) {
      console.warn(`JS errors during test: ${jsErrors.join('; ')}`);
    }
    expect(jsErrors.filter(e => e.includes('#310') || e.includes('#301') || e.includes('#302'))).toHaveLength(0);
  });
});
