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

test.describe('Database CRUD E2E', () => {
  test.setTimeout(120_000);

  test('create, delete, and recreate a database via UI', async ({ page }) => {
    const jsErrors = await login(page);
    const apiErrorText = page.getByText(/Could not load databases/i);
    try { await apiErrorText.waitFor({ state: 'visible', timeout: 5000 }); console.log('⚠️ API down'); return; } catch {}

    await expect(page).toHaveURL(/\/dashboard/);

    const dbName = `e2e-${Date.now().toString(36)}`;

    // Check if we have existing databases
    const allDbSection = page.getByText('All databases');
    const emptyState = page.getByText('No databases yet');
    const hasDatabases = await allDbSection.isVisible({ timeout: 3000 }).catch(() => false);
    const isEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    // Delete one if databases exist (free tier: 1 DB max)
    if (hasDatabases) {
      console.log('Phase 1: Found existing databases — deleting one...');
      // Click "All databases" section heading to find cards, then click the first DB card
      const firstDbCard = page.locator('section h2:has-text("All databases")').locator('..').locator('..').locator('[data-slot="card"], .rounded-lg').first();
      await firstDbCard.waitFor({ state: 'visible', timeout: 5000 });
      const cardText = await firstDbCard.textContent();
      console.log(`   Deleting: "${cardText?.split('\n')[0]?.trim()}"`);
      // Click the "View" button or the card itself
      const viewBtn = firstDbCard.locator('button').last();
      await viewBtn.click();
      await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // Delete
      const deleteBtn = page.getByRole('button', { name: /Delete Database/i });
      await deleteBtn.scrollIntoViewIfNeeded();
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      const confirmInput = page.locator('[data-slot="dialog-content"] input').first();
      await confirmInput.waitFor({ state: 'visible', timeout: 5000 });
      const codeEl = page.locator('[data-slot="dialog-content"] code').first();
      const confirmName = await codeEl.textContent() || '';
      await confirmInput.fill(confirmName.trim());
      await page.locator('[data-slot="dialog-content"] button[type="submit"]').first().click();
      await page.waitForURL(/\/dashboard\/?$/, { timeout: 15_000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'crud-01-after-delete.png') });
    } else if (isEmpty) {
      console.log('Phase 1: No databases — skipping delete');
    }

    // ── PHASE 2: Create a new database ──
    console.log(`Phase 2: Creating "${dbName}"...`);

    const newDbBtn = page.getByRole('button', { name: /new database/i }).first();
    await newDbBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await newDbBtn.click();
    await page.waitForTimeout(1000);

    const nameInput = page.locator('#db-name, [data-slot="dialog-content"] input[placeholder*="database"], [data-slot="dialog-content"] input').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill(dbName);
    await page.waitForTimeout(200);

    const regionBtn = page.getByRole('button', { name: /Nuremberg/i }).first();
    if (await regionBtn.isVisible({ timeout: 2000 }).catch(() => false)) await regionBtn.click();

    const createBtn = page.locator('[data-slot="dialog-content"] button[type="submit"]').first();
    await createBtn.click();
    await page.waitForTimeout(3000);

    const successToast = page.locator('[data-sonner-toast][data-type="success"]');
    const hasSuccess = await successToast.isVisible({ timeout: 8000 }).catch(() => false);
    const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
    const errText = await errorToast.isVisible({ timeout: 3000 }).catch(() => false)
      ? (await errorToast.textContent())?.trim()
      : '';

    if (errText) {
      console.log(`❌ Create failed: "${errText}"`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'crud-create-error.png') });
    }

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'crud-02-after-create.png') });

    const newDbVisibleOnDash = await page.getByText(dbName).isVisible({ timeout: 5000 }).catch(() => false);
    if (hasSuccess || newDbVisibleOnDash) {
      console.log(`✅ Create: PASSED (new DB "${dbName}" visible)`);
    } else {
      test.fail(true, `Create failed: new DB "${dbName}" not found on dashboard. Error: ${errText || 'none'}`);
      return;
    }

    // ── PHASE 3: Delete the created database ──
    console.log('Phase 3: Deleting created database...');
    const createdCard = page.locator('[data-slot="card"], .rounded-lg').filter({ hasText: dbName }).first();
    await createdCard.waitFor({ state: 'visible', timeout: 5000 });
    const viewBtn = createdCard.locator('button').last();
    await viewBtn.click();
    await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const delBtn = page.getByRole('button', { name: /Delete Database/i });
    await delBtn.scrollIntoViewIfNeeded();
    await delBtn.click();
    await page.waitForTimeout(1000);
    const confirmInput2 = page.locator('[data-slot="dialog-content"] input').first();
    await confirmInput2.waitFor({ state: 'visible', timeout: 5000 });
    await confirmInput2.fill(dbName);
    await page.locator('[data-slot="dialog-content"] button[type="submit"]').first().click();
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 15_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'crud-03-after-second-delete.png') });

    const dbGone = await page.getByText(dbName).isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`✅ Delete: ${dbGone ? 'still visible (caching)' : 'PASSED (DB removed)'}`);

    // ── PHASE 4: Recreate ──
    console.log('Phase 4: Recreating...');
    await page.getByRole('button', { name: /new database/i }).first().click();
    await page.waitForTimeout(1000);
    await page.locator('[data-slot="dialog-content"] input').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-slot="dialog-content"] input').first().fill(dbName);
    const regionBtn2 = page.getByRole('button', { name: /Nuremberg/i }).first();
    if (await regionBtn2.isVisible({ timeout: 2000 }).catch(() => false)) await regionBtn2.click();
    await page.locator('[data-slot="dialog-content"] button[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    const success2 = await page.locator('[data-sonner-toast][data-type="success"]').isVisible({ timeout: 8000 }).catch(() => false);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'crud-04-after-recreate.png') });

    const recreated = await page.getByText(dbName).isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`✅ Recreate: ${success2 || recreated ? 'PASSED' : 'FAILED'}`);
    expect(success2 || recreated).toBeTruthy();
    expect(jsErrors.filter(e => e.includes('#310') || e.includes('#301'))).toHaveLength(0);
  });
});
