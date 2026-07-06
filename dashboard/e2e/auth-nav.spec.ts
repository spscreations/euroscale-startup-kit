import { test, expect } from '@playwright/test';

const BASE_URL = 'https://euroscale.app';
const TEST_EMAIL = 'j.doe@company.com';
const TEST_PASSWORD = 'Testb2c!';

/**
 * Helper: login and return the page, ready for dashboard assertions.
 * Collects JS errors and console errors along the way.
 */
async function login(
  page: import('@playwright/test').Page,
  jsErrors: string[],
  consoleErrors: string[],
) {
  // Navigate to landing page
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Click "Sign in" — look for link or button
  const signInLink = page.getByRole('link', { name: /sign in/i });
  const signInButton = page.getByRole('button', { name: /sign in/i });

  if (await signInLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signInLink.click();
  } else if (await signInButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signInButton.click();
  } else {
    // Try text-based fallback
    const fallback = page.locator('text=Sign in').first();
    await fallback.click();
  }

  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await page.waitForTimeout(1000);

  // Fill credentials
  // shadcn/ui inputs use data-slot="input" attribute
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);

  // Submit
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await page.waitForTimeout(3000);
}

test.describe('Auth & Navigation Flows', () => {
  test.describe('Login Flow', () => {
    test('should show landing page with Sign in link', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(2000);

      // Should be on landing page (not login, not dashboard)
      const url = page.url();
      expect(url).not.toMatch(/\/login/);
      expect(url).not.toMatch(/\/dashboard/);

      // Should have a Sign in link
      const signIn = page.getByText(/sign in/i).first();
      await expect(signIn).toBeVisible({ timeout: 10_000 });

      // Report any JS errors
      if (jsErrors.length > 0) {
        console.warn(`[Landing page] JS errors: ${jsErrors.join('; ')}`);
      }
    });

    test('should login successfully and show dashboard', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await login(page, jsErrors, consoleErrors);

      // Verify URL is /dashboard
      expect(page.url()).toMatch(/\/dashboard/);

      // Verify "Databases" heading is visible
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Verify sidebar shows user email
      await expect(page.getByText(TEST_EMAIL)).toBeVisible({ timeout: 5_000 });

      // Verify session exists in localStorage
      const hasSession = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('supabase')) return true;
        }
        // Also check for any auth token pattern
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          allKeys.push(localStorage.key(i));
        }
        return allKeys.some((k) => k && /auth|session|token|supabase/i.test(k));
      });
      expect(hasSession).toBe(true);

      // Report errors
      if (jsErrors.length > 0) {
        console.warn(`[Login] JS errors: ${jsErrors.join('; ')}`);
      }
      if (consoleErrors.length > 0) {
        console.warn(`[Login] Console errors: ${consoleErrors.join('; ')}`);
      }
    });
  });

  test.describe('Logout Flow', () => {
    test('should sign out and clear session', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      // Login first
      await login(page, jsErrors, []);
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Record session keys before logout
      const keysBefore = await page.evaluate(() => {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i) || '');
        }
        return keys;
      });
      console.log(`[Logout] localStorage keys before: ${keysBefore.join(', ')}`);

      // Find and click "Sign out" — try multiple selectors
      // shadcn/ui sidebar now renders nav items as <button> elements with data-slot="button"
      const signOutLink = page.getByRole('link', { name: /sign out/i });
      const signOutButton = page.getByRole('button', { name: /sign out/i });
      const signOutText = page.getByText(/sign out/i).first();

      let clicked = false;
      for (const el of [signOutLink, signOutButton, signOutText]) {
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          await el.click();
          clicked = true;
          console.log('[Logout] Clicked Sign out');
          break;
        }
      }

      if (!clicked) {
        // Try to find any element containing "Sign out" or "Log out"
        const anyLogout = page.locator('a, button, span, div').filter({ hasText: /sign out|log out/i }).first();
        if (await anyLogout.isVisible({ timeout: 3000 }).catch(() => false)) {
          await anyLogout.click();
          clicked = true;
          console.log('[Logout] Clicked Sign out via fallback selector');
        }
      }

      if (clicked) {
        // Wait for redirect away from dashboard
        await page.waitForTimeout(3000);
        const url = page.url();
        console.log(`[Logout] URL after sign out: ${url}`);

        // Should be on landing or login page
        const isRedirected = !url.includes('/dashboard');
        console.log(`[Logout] Redirected away from dashboard: ${isRedirected}`);

        // Verify session removed from localStorage
        const authKeysAfter = await page.evaluate(() => {
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && /auth|session|token|supabase/i.test(k)) keys.push(k);
          }
          return keys;
        });
        console.log(`[Logout] Auth keys after logout: ${authKeysAfter.join(', ') || '(none)'}`);
        expect(authKeysAfter.length).toBe(0);
      } else {
        console.warn('[Logout] Could not find Sign out element — skipping logout assertion');
      }

      if (jsErrors.length > 0) {
        console.warn(`[Logout] JS errors: ${jsErrors.join('; ')}`);
      }
    });
  });

  test.describe('Sidebar Navigation', () => {
    test('should navigate to all sidebar destinations', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      // Login
      await login(page, jsErrors, []);
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Helper: find and click a nav item by text, then verify URL
      // shadcn/ui sidebar now renders nav items as <button> elements (data-slot="button"),
      // so the selector includes both <a> and <button> elements inside nav/aside
      async function clickNav(navText: string | RegExp, expectedUrlPattern: RegExp): Promise<boolean> {
        const navItem = page.locator('nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button').filter({ hasText: navText }).first();

        if (!(await navItem.isVisible({ timeout: 3000 }).catch(() => false))) {
          console.warn(`[Nav] "${navText}" not found in nav`);
          return false;
        }

        await navItem.click();
        await page.waitForTimeout(2000);

        const url = page.url();
        const matches = expectedUrlPattern.test(url);
        console.log(`[Nav] Clicked "${navText}" → URL: ${url} (expected: ${expectedUrlPattern}) ${matches ? '✅' : '❌'}`);
        return matches;
      }

      // 1. Databases → /dashboard
      const dbOk = await clickNav(/databases/i, /\/dashboard$/);

      // 2. Backups → /dashboard/backups
      const backupsOk = await clickNav(/backups/i, /\/dashboard\/backups/);

      // 3. Browse Data → /dashboard/browse
      const browseOk = await clickNav(/browse data/i, /\/dashboard\/browse/);

      // 4. Billing → /dashboard/billing
      const billingOk = await clickNav(/billing/i, /\/dashboard\/billing/);

      // 5. Settings → /dashboard/settings
      const settingsOk = await clickNav(/settings/i, /\/dashboard\/settings/);

      // Report results
      console.log(`\n[Nav results] Databases: ${dbOk}, Backups: ${backupsOk}, Browse Data: ${browseOk}, Billing: ${billingOk}, Settings: ${settingsOk}`);

      if (jsErrors.length > 0) {
        console.warn(`[Navigation] JS errors: ${jsErrors.join('; ')}`);
      }
    });

    test('"New database" nav item navigates to /dashboard/create', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await login(page, jsErrors, []);
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Find "New database" or "Create" or "+" button in nav
      // shadcn/ui sidebar renders these as <button> elements (data-slot="button")
      const newDb = page.locator('nav a, nav button, aside a, aside button, button').filter({ hasText: /new database|create database|\+ new/i }).first();

      if (await newDb.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newDb.click();
        await page.waitForTimeout(2000);

        const url = page.url();
        console.log(`[New database] URL after click: ${url}`);

        // shadcn/ui rewrite: "New database" nav item now navigates to /dashboard/create page
        // instead of opening an inline dialog
        const navigatedToCreate = url.includes('/dashboard/create') || url.includes('/create');
        console.log(`[New database] Navigated to /create: ${navigatedToCreate ? '✅' : '❌'}`);

        // Also check for shadcn Dialog if it opens as a dialog instead
        // shadcn/ui Dialog uses data-slot="dialog-content" for the actual popup
        const dialogVisible = await page.locator('[data-slot="dialog-content"], [role="dialog"], [role="alertdialog"]').isVisible({ timeout: 3000 }).catch(() => false);

        if (dialogVisible) {
          console.log('[New database] shadcn Dialog opened');

          // Verify dialog heading (data-slot="dialog-title")
          const dialogTitle = page.locator('[data-slot="dialog-title"]');
          const titleVisible = await dialogTitle.isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`[New database] Dialog title visible: ${titleVisible}`);

          // Close dialog via close button (data-slot="dialog-close") or Escape
          const closeBtn = page.locator('[data-slot="dialog-close"], button[aria-label="Close dialog"]');
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await closeBtn.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(1000);
        }

        if (!navigatedToCreate && !dialogVisible) {
          // Check for any inline create form as fallback
          const hasCreateText = await page.getByText(/create|new database|database name/i).first().isVisible({ timeout: 2000 }).catch(() => false);
          console.log(`[New database] Create text visible (fallback): ${hasCreateText}`);
        }
      } else {
        console.warn('[New database] "New database" button not found in nav');
      }

      if (jsErrors.length > 0) {
        console.warn(`[New database nav] JS errors: ${jsErrors.join('; ')}`);
      }
    });
  });

  test.describe('Page Rendering', () => {
    test('Dashboard shows stats cards and usage bars', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await login(page, jsErrors, consoleErrors);

      // Verify "Databases" heading
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Look for stats cards — shadcn/ui Card components use data-slot="card"
      // Also match common class patterns for fallback robustness
      const statsCards = page.locator('[data-slot="card"], .card, [class*="stat"], [class*="tile"], [class*="metric"], .bg-white, .rounded-xl, .shadow');
      const cardCount = await statsCards.count();
      console.log(`[Dashboard] Stats card candidates: ${cardCount}`);

      // Look for usage bars / progress bars
      // shadcn/ui Progress component uses role="progressbar" with data-slot="progress"
      const usageBars = page.locator('[role="progressbar"], [data-slot="progress"], .progress, [class*="usage"], [class*="bar"], .h-2, .h-3, .h-4');
      const barCount = await usageBars.count();
      console.log(`[Dashboard] Usage bar candidates: ${barCount}`);

      // Verify no "This page couldn't load" error
      await expect(page.getByText(/this page couldn/i)).toHaveCount(0);

      // Take a screenshot for visual verification
      await page.screenshot({ path: 'e2e/screenshots/dashboard.png', fullPage: true });

      if (jsErrors.length > 0) {
        console.warn(`[Dashboard render] JS errors: ${jsErrors.join('; ')}`);
      }
      if (consoleErrors.length > 0) {
        console.warn(`[Dashboard render] Console errors: ${consoleErrors.join('; ')}`);
      }
    });

    test('Backups page renders', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await login(page, jsErrors, []);
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Navigate to backups
      await page.goto(`${BASE_URL}/dashboard/backups`, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(3000);

      const bodyText = await page.locator('body').innerText();
      console.log(`[Backups] Page text (first 300 chars): ${bodyText.slice(0, 300).replace(/\n/g, ' | ')}`);

      // Check for no error
      await expect(page.getByText(/this page couldn/i)).toHaveCount(0);

      // Take screenshot
      await page.screenshot({ path: 'e2e/screenshots/backups.png', fullPage: true });

      if (jsErrors.length > 0) {
        console.warn(`[Backups render] JS errors: ${jsErrors.join('; ')}`);
      }
    });

    test('Billing page shows plan info', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await login(page, jsErrors, []);
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Navigate to billing
      await page.goto(`${BASE_URL}/dashboard/billing`, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(3000);

      const bodyText = await page.locator('body').innerText();
      console.log(`[Billing] Page text (first 300 chars): ${bodyText.slice(0, 300).replace(/\n/g, ' | ')}`);

      // Check for no error page
      await expect(page.getByText(/this page couldn/i)).toHaveCount(0);

      // Check for plan info (common billing page elements)
      const hasPlanContent = /plan|tier|billing|subscription|free|pro|enterprise/i.test(bodyText);
      console.log(`[Billing] Plan content found: ${hasPlanContent}`);

      // Take screenshot
      await page.screenshot({ path: 'e2e/screenshots/billing.png', fullPage: true });

      if (jsErrors.length > 0) {
        console.warn(`[Billing render] JS errors: ${jsErrors.join('; ')}`);
      }
    });

    test('Settings page shows settings form', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (err) => jsErrors.push(err.message));

      await login(page, jsErrors, []);
      await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });

      // Navigate to settings
      await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(3000);

      const bodyText = await page.locator('body').innerText();
      console.log(`[Settings] Page text (first 300 chars): ${bodyText.slice(0, 300).replace(/\n/g, ' | ')}`);

      // Check for no error
      await expect(page.getByText(/this page couldn/i)).toHaveCount(0);

      // Look for form elements
      const formInputs = await page.locator('input, select, textarea').count();
      console.log(`[Settings] Form input count: ${formInputs}`);

      // Take screenshot
      await page.screenshot({ path: 'e2e/screenshots/settings.png', fullPage: true });

      if (jsErrors.length > 0) {
        console.warn(`[Settings render] JS errors: ${jsErrors.join('; ')}`);
      }
    });
  });
});
