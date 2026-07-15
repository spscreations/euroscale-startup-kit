import { test, expect, type Page } from '@playwright/test';

test.describe('EuroScale Bug Reproduction', () => {
  async function checkApiError(page: Page): Promise<boolean> {
    const apiError = page.getByText('Could not load databases');
    try {
      await apiError.waitFor({ state: 'visible', timeout: 8000 });
      console.log('⚠️  API unavailable — test skipped');
      return true;
    } catch {
      return false;
    }
  }

  /** Resilient login — retries once under parallel suite load. */
  async function login(page: Page): Promise<void> {
    await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(500);

    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    await email.waitFor({ state: 'visible', timeout: 10_000 });
    await email.fill('j.doe@company.com');
    await password.fill('Testb2c!');
    await page.locator('button[type="submit"]').click();

    try {
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    } catch {
      console.log('Login redirect slow — retrying...');
      await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(500);
      await page.locator('input[type="email"]').fill('j.doe@company.com');
      await page.locator('input[type="password"]').fill('Testb2c!');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);
  }

  test('Bug 1: Upgrade button shows "unknown tier free"', async ({ page }) => {
    await login(page);

    if (await checkApiError(page)) return;

    // Look for Upgrade button (shadcn/ui Button component, data-slot="button")
    const upgradeBtn = page.locator('button:has-text("Upgrade")');
    const upgradeVisible = await upgradeBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!upgradeVisible) {
      console.log('Bug 1 - No Upgrade button visible (user likely on paid tier)');
      console.log('Bug 1 reproduced: ❌ (not applicable)');
      return;
    }

    page.on('dialog', async (dialog) => {
      console.log(`Dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    await upgradeBtn.click();
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    console.log(`Bug 1 - Body after Upgrade click: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);

    const sonnerToast = page
      .locator('[data-sonner-toast], [role="status"]')
      .filter({ hasText: /unknown tier|Failed|error/i })
      .first();
    const toastVisible = await sonnerToast.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Bug 1 - Error toast visible: ${toastVisible ? '✅' : '❌ (checking body)'}`);

    const hasError = body.includes('unknown tier') || body.includes('Failed') || toastVisible;
    console.log(`Bug 1 reproduced: ${hasError ? '✅' : '❌'}`);
  });

  test('Bug 2: Apply Changes shows "Storage resized to 0 GB"', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(2000);

    if (await checkApiError(page)) return;

    const applyBtn = page.locator('button:has-text("Apply Changes")');
    if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
      const body = await page.locator('body').innerText();
      console.log(`Bug 2 - Body after Apply: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);

      const resizeToast = page
        .locator('[data-sonner-toast], [role="status"]')
        .filter({ hasText: /Storage resized|resized to 0|0 GB/i })
        .first();
      const toastVisible = await resizeToast.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Bug 2 - Resize toast visible: ${toastVisible ? '✅' : '❌'}`);

      const hasResized0 =
        body.includes('Storage resized to 0GB') ||
        body.includes('resized to 0 GB') ||
        toastVisible;
      console.log(`Bug 2 reproduced: ${hasResized0 ? '✅' : '❌'}`);
    } else {
      console.log('Bug 2 - Apply Changes button not visible (add-ons section not rendered)');
    }
  });

  test('Bug 3: Browse Data shows error', async ({ page }) => {
    await login(page);

    const browseLink = page
      .locator('a[href*="browse"], a:has-text("Browse Data"), button:has-text("Browse Data")')
      .first();
    await browseLink.waitFor({ state: 'visible', timeout: 5000 });
    await browseLink.click();
    await page.waitForURL(/\/browse/, { timeout: 10000 });
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    console.log(`Bug 3 - Browse page: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);

    const errorToast = page
      .locator('[data-sonner-toast], [role="status"]')
      .filter({ hasText: /Failed to load|no valid credentials|error/i })
      .first();
    const toastVisible = await errorToast.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Bug 3 - Error toast visible: ${toastVisible ? '✅' : '❌'}`);

    const hasError =
      body.includes('Failed to load databases') ||
      body.includes('no valid credentials') ||
      toastVisible;
    console.log(`Bug 3 reproduced: ${hasError ? '✅' : '❌'}`);
  });

  test('Bug 4: Billing page redirects to wrong domain', async ({ page }) => {
    await login(page);

    await page.goto('https://euroscale.app/dashboard/billing?payment=success', {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);

    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    console.log(`Bug 4 - URL: ${url}`);
    console.log(`Bug 4 - Body: ${body.slice(0, 200).replace(/\n/g, ' | ')}`);

    const hasWrongDomain = url.includes('dashboard.euroscale.app');
    console.log(`Bug 4 reproduced (wrong domain): ${hasWrongDomain ? '✅' : '❌'}`);
    // Soft assert: stay on euroscale.app (not wrong subdomain)
    expect(url).toMatch(/euroscale\.app/);
    expect(hasWrongDomain).toBe(false);
  });
});
