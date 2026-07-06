import { test, expect } from '@playwright/test';

test.describe('EuroScale Bug Reproduction', () => {
  test('Bug 1: Upgrade button shows "unknown tier free"', async ({ page }) => {
    await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });

    // shadcn/ui inputs use data-slot="input"
    await page.fill('input[type="email"]', 'j.doe@company.com');
    await page.fill('input[type="password"]', 'Testb2c!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Check if API error is shown (TierCard won't render)
    const apiError = page.getByText('Could not load databases');
    if (await apiError.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠️  API unavailable — Bug 1 test skipped');
      return;
    }

    // Look for Upgrade button (shadcn/ui Button component, data-slot="button")
    const upgradeBtn = page.locator('button:has-text("Upgrade")');
    await upgradeBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    // Accept the dialog that may appear
    page.on('dialog', async dialog => {
      console.log(`Dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    // Click Upgrade
    await upgradeBtn.click();
    await page.waitForTimeout(3000);
    
    // Check for error toast — sonner Toast uses data-sonner-toast with role="status"
    // Also check body text as fallback
    const body = await page.locator('body').innerText();
    console.log(`Bug 1 - Body after Upgrade click: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);

    // Also check sonner toast for error messages
    const sonnerToast = page.locator('[data-sonner-toast], [role="status"]')
      .filter({ hasText: /unknown tier|Failed|error/i })
      .first();
    const toastVisible = await sonnerToast.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Bug 1 - Error toast visible: ${toastVisible ? '✅' : '❌ (checking body)'}`);
    
    const hasError = body.includes('unknown tier') || body.includes('Failed') || toastVisible;
    console.log(`Bug 1 reproduced: ${hasError ? '✅' : '❌'}`);
  });

  test('Bug 2: Apply Changes shows "Storage resized to 0 GB"', async ({ page }) => {
    await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });

    // shadcn/ui inputs use data-slot="input"
    await page.fill('input[type="email"]', 'j.doe@company.com');
    await page.fill('input[type="password"]', 'Testb2c!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForTimeout(5000);

    // Check if API error is shown (Add-ons section won't render)
    const apiError = page.getByText('Could not load databases');
    if (await apiError.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠️  API unavailable — Bug 2 test skipped');
      return;
    }

    // Find and click "Apply Changes" button (shadcn/ui Button, data-slot="button")
    const applyBtn = page.locator('button:has-text("Apply Changes")');
    if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(3000);
      const body = await page.locator('body').innerText();
      console.log(`Bug 2 - Body after Apply: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);
      
      // Also check sonner toast (data-sonner-toast) for the resize message
      const resizeToast = page.locator('[data-sonner-toast], [role="status"]')
        .filter({ hasText: /Storage resized|resized to 0|0 GB/i })
        .first();
      const toastVisible = await resizeToast.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Bug 2 - Resize toast visible: ${toastVisible ? '✅' : '❌'}`);
      
      const hasResized0 = body.includes('Storage resized to 0GB') || body.includes('resized to 0 GB') || toastVisible;
      console.log(`Bug 2 reproduced: ${hasResized0 ? '✅' : '❌'}`);
    } else {
      console.log('Bug 2 - Apply Changes button not visible (add-ons section not rendered)');
    }
  });

  test('Bug 3: Browse Data shows error', async ({ page }) => {
    await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });

    // shadcn/ui inputs use data-slot="input"
    await page.fill('input[type="email"]', 'j.doe@company.com');
    await page.fill('input[type="password"]', 'Testb2c!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Click Browse Data link — sidebar nav now uses shadcn/ui Button components (data-slot="button"),
    // so we need both <a> and <button> selectors for robustness
    const browseLink = page.locator('a[href*="browse"], a:has-text("Browse Data"), button:has-text("Browse Data")').first();
    await browseLink.waitFor({ state: 'visible', timeout: 5000 });
    await browseLink.click();
    await page.waitForURL(/\/browse/, { timeout: 10000 });
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    console.log(`Bug 3 - Browse page: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);
    
    // Also check sonner toast for error
    const errorToast = page.locator('[data-sonner-toast], [role="status"]')
      .filter({ hasText: /Failed to load|no valid credentials|error/i })
      .first();
    const toastVisible = await errorToast.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Bug 3 - Error toast visible: ${toastVisible ? '✅' : '❌'}`);
    
    const hasError = body.includes('Failed to load databases') || body.includes('no valid credentials') || toastVisible;
    console.log(`Bug 3 reproduced: ${hasError ? '✅' : '❌'}`);
  });

  test('Bug 4: Billing page redirects to wrong domain', async ({ page }) => {
    await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });

    // shadcn/ui inputs use data-slot="input"
    await page.fill('input[type="email"]', 'j.doe@company.com');
    await page.fill('input[type="password"]', 'Testb2c!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Navigate to billing page with payment=success
    await page.goto('https://euroscale.app/dashboard/billing?payment=success', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    
    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    console.log(`Bug 4 - URL: ${url}`);
    console.log(`Bug 4 - Body: ${body.slice(0, 200).replace(/\n/g, ' | ')}`);
    
    const hasWrongDomain = url.includes('dashboard.euroscale.app');
    console.log(`Bug 4 reproduced (wrong domain): ${hasWrongDomain ? '✅' : '❌'}`);
  });
});
