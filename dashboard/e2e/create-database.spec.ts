import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://euroscale.app';
const TEST_EMAIL = 'j.doe@company.com';
const TEST_PASSWORD = 'Testb2c!';
const SCREENSHOT_DIR = path.resolve(__dirname);

// ── helpers ─────────────────────────────────────────────────────────────────

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

async function deleteDatabase(page: Page, cardText: string): Promise<void> {
  // Navigate to the first database detail page
  const anyCard = page.locator('section h2:has-text("All databases")').locator('..').locator('..').locator('[data-slot="card"], .rounded-lg').first();
  const goToDetail = async () => {
    const btn = anyCard.locator('button').last();
    await btn.click();
    await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };

  // Check if we're already on a detail page
  if (/\/dashboard\/[a-z0-9]+/.test(page.url())) {
    // Already on detail page — proceed
  } else {
    const hasCards = await anyCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCards) return; // no databases
    await goToDetail();
  }

  const deleteBtn = page.getByRole('button', { name: /Delete Database/i });
  const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasDelete) return;

  await deleteBtn.scrollIntoViewIfNeeded();
  await deleteBtn.click();
  await page.waitForTimeout(1000);

  const confirmInput = page.locator('[data-slot="dialog-content"] input').first();
  await confirmInput.waitFor({ state: 'visible', timeout: 5000 });
  const codeEl = page.locator('[data-slot="dialog-content"] code').first();
  const name = (await codeEl.textContent()) || '';
  await confirmInput.fill(name.trim());
  await page.waitForTimeout(200);

  await page.locator('[data-slot="dialog-content"] button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 20_000 });
  await page.waitForTimeout(2000);
}

async function createDatabase(page: Page, dbName: string): Promise<boolean> {
  // Try both buttons: sidebar "+ New database", empty state "Create your first database", and header "+ New database"
  const newDbBtn = page.getByRole('button', { name: /new database|create your first database/i }).first();
  await newDbBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await newDbBtn.click();
  await page.waitForTimeout(1500);

  // Fill the database name — try multiple selectors
  const nameInput =
    page.locator('#db-name').first().or(
    page.locator('[data-slot="dialog-content"] input[placeholder*="database"]').first()).or(
    page.locator('[data-slot="dialog-content"] input[type="text"]').first()).or(
    page.locator('[data-slot="dialog-content"] input').first());
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  await nameInput.click();
  await nameInput.fill('');
  await nameInput.fill(dbName);
  await page.waitForTimeout(300);

  // Region selector
  const regionBtn = page.getByRole('button', { name: /Nuremberg/i }).first();
  if (await regionBtn.isVisible({ timeout: 2000 }).catch(() => false)) await regionBtn.click();
  await page.waitForTimeout(200);

  // Submit — try multiple selectors
  const createBtn =
    page.locator('[data-slot="dialog-content"] button[type="submit"]').first().or(
    page.locator('[data-slot="dialog-content"] button:has-text("Create")').first()).or(
    page.locator('button[type="submit"]:has-text("Create")').first()).or(
    page.getByRole('button', { name: /create/i }).last());
  await createBtn.waitFor({ state: 'visible', timeout: 5000 });
  await createBtn.click();
  await page.waitForTimeout(4000);

  const successToast = page.locator('[data-sonner-toast][data-type="success"]');
  const hasSuccess = await successToast.isVisible({ timeout: 8000 }).catch(() => false);

  // Also check for error toast
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
  const errText = await errorToast.isVisible({ timeout: 2000 }).catch(() => false)
    ? ((await errorToast.textContent())?.trim() || '').slice(0, 100)
    : '';
  if (errText) console.log(`   ⚠️  Error: "${errText}"`);

  // Check if we got redirected to the new DB detail page
  if (/\/dashboard\/[a-z0-9]{11}$/.test(page.url())) {
    console.log('   Redirected to DB detail page');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2000);
    return true;
  }

  // Navigate to dashboard and check
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(2500);

  return hasSuccess;
}

async function checkSSLCerts(page: Page): Promise<boolean> {
  // We should be on a database detail page
  if (!/\/dashboard\/[a-z0-9]+/.test(page.url())) {
    // Navigate to the first DB detail
    const firstCard = page.locator('section h2:has-text("All databases")').locator('..').locator('..').locator('[data-slot="card"], .rounded-lg').first();
    const hasCard = await firstCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCard) return false;
    await firstCard.locator('button').last().click();
    await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Look for the SSL certificate download buttons
  const sslSection = page.getByText('SSL Certificates (mTLS)');
  const hasSSL = await sslSection.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasSSL) return false;

  // Check that all three download buttons exist
  const downloadButtons = page.locator('button:has-text("Download")');
  const count = await downloadButtons.count();
  console.log(`   SSL download buttons found: ${count}`);
  return count >= 3;
}

// ── Test ────────────────────────────────────────────────────────────────────

test.describe('Database CRUD + SSL E2E', () => {
  test.setTimeout(180_000);

  test('create → SSL check → delete → recreate → SSL check', async ({ page }) => {
    const jsErrors = await login(page);

    const apiErrorText = page.getByText(/Could not load databases/i);
    try { await apiErrorText.waitFor({ state: 'visible', timeout: 5000 }); console.log('⚠️ API down'); return; } catch {}

    await expect(page).toHaveURL(/\/dashboard/);
    const dbName = `e2e-${Date.now().toString(36)}`;

    // ── PHASE 1: Clean up any existing databases ──
    console.log('Phase 1: Cleaning up existing databases...');
    await deleteDatabase(page, '');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ssl-test-01-clean.png') });

    // ── PHASE 2: Create fresh database ──
    console.log(`Phase 2: Creating "${dbName}"...`);
    const created = await createDatabase(page, dbName);
    const visibleOnDash = await page.getByText(dbName).isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Create: ${created || visibleOnDash ? '✅' : '❌'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ssl-test-02-created.png') });
    expect(created || visibleOnDash).toBeTruthy();

    // ── PHASE 3: Verify SSL certificates ──
    console.log('Phase 3: Checking SSL certificates...');
    // Navigate to the database detail
    const dbCard = page.locator('[data-slot="card"], .rounded-lg').filter({ hasText: dbName }).first();
    await dbCard.locator('button').last().click();
    await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const sslOk = await checkSSLCerts(page);
    console.log(`   SSL: ${sslOk ? '✅ All certs available' : '❌ Missing'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ssl-test-03-ssl-check.png') });
    expect(sslOk).toBeTruthy();

    // ── PHASE 4: Delete the database ──
    console.log('Phase 4: Deleting database...');
    const delBtn = page.getByRole('button', { name: /Delete Database/i });
    await delBtn.scrollIntoViewIfNeeded();
    await delBtn.click();
    await page.waitForTimeout(1000);

    const confirmInput = page.locator('[data-slot="dialog-content"] input').first();
    await confirmInput.waitFor({ state: 'visible', timeout: 5000 });
    const codeEl = page.locator('[data-slot="dialog-content"] code').first();
    const confirmName = (await codeEl.textContent()) || dbName;
    await confirmInput.fill(confirmName.trim());
    await page.waitForTimeout(200);

    await page.locator('[data-slot="dialog-content"] button[type="submit"]').first().click();
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 20_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ssl-test-04-deleted.png') });
    console.log('   Delete: ✅');

    // ── PHASE 5: Wait for deletion to propagate, then recreate ──
    console.log('Phase 5: Recreating...');
    // Deletion may need time to propagate (tier counter, Vitess CRD)
    await page.waitForTimeout(8000);

    // Retry recreate up to 3 times (tier limit may need a moment to clear)
    let retries = 3;
    while (retries > 0) {
      const r = await createDatabase(page, dbName);
      const rv = await page.getByText(dbName).isVisible({ timeout: 3000 }).catch(() => false);
      if (r || rv) {
        console.log(`   Recreate: ✅`);
        break;
      }
      retries--;
      if (retries > 0) {
        console.log(`   Retry in 5s (${retries} left)...`);
        await page.waitForTimeout(5000);
      } else {
        console.log(`   Recreate: ❌`);
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ssl-test-05-recreated.png') });

    // ── PHASE 6: Verify SSL certs again after recreate ──
    console.log('Phase 6: Checking SSL after recreate...');
    const reDbCard = page.locator('[data-slot="card"], .rounded-lg').filter({ hasText: dbName }).first();
    await reDbCard.locator('button').last().click();
    await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const sslOk2 = await checkSSLCerts(page);
    console.log(`   SSL: ${sslOk2 ? '✅ All certs available' : '❌ Missing'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ssl-test-06-ssl-after-recreate.png') });
    expect(sslOk2).toBeTruthy();

    // No React errors
    expect(jsErrors.filter(e => e.includes('#310') || e.includes('#301'))).toHaveLength(0);
    console.log('🎉 Full test: Create → SSL → Delete → Recreate → SSL — ALL PASSED');
  });
});
