# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard-interactions.spec.ts >> EuroScale Dashboard Interactions >> TierCard renders Free Plan, Upgrade button, UsageBars, and Add-ons
- Location: e2e/dashboard-interactions.spec.ts:75:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Free Plan' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Free Plan' })

```

```yaml
- complementary:
  - img "EuroScale"
  - paragraph: EuroScale
  - navigation:
    - link "Databases":
      - /url: /dashboard
      - img
      - text: Databases
    - link "Backups":
      - /url: /dashboard/backups
      - img
      - text: Backups
    - link "Browse Data":
      - /url: /dashboard/browse
      - img
      - text: Browse Data
    - link "New database":
      - /url: /dashboard/create
      - img
      - text: New database
    - link "Billing":
      - /url: /dashboard/billing
      - img
      - text: Billing
    - link "Settings":
      - /url: /dashboard/settings
      - img
      - text: Settings
  - text: U
  - paragraph: User
  - paragraph: j.doe@company.com
  - button "Sign out":
    - img
    - text: Sign out
- main:
  - heading "Databases" [level=1]
  - button "Refresh databases":
    - img
    - text: Refresh
  - button "New database":
    - img
    - text: New database
  - main:
    - text: Total Databases
    - img
    - paragraph: "0"
    - text: Active Connections
    - img
    - paragraph: "0"
    - text: Storage Used
    - img
    - paragraph: —
    - img
    - paragraph: Could not load databases
    - paragraph: "[unauthenticated] invalid or missing API key"
    - button "Retry":
      - img
      - text: Retry
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import path from 'path';
  3   | 
  4   | const SCREENSHOT_DIR = path.resolve(__dirname);
  5   | 
  6   | const CREDS = {
  7   |   email: 'j.doe@company.com',
  8   |   password: 'Testb2c!',
  9   | };
  10  | 
  11  | /**
  12  |  * Shared login helper — logs in and returns the authenticated page
  13  |  * positioned on /dashboard with network idle.
  14  |  */
  15  | async function loginToDashboard(page: import('@playwright/test').Page): Promise<string[]> {
  16  |   const pageErrors: string[] = [];
  17  |   page.on('pageerror', (err) => pageErrors.push(err.message));
  18  | 
  19  |   // Navigate to landing page
  20  |   await page.goto('https://euroscale.app', { waitUntil: 'networkidle' });
  21  | 
  22  |   // Click "Sign in"
  23  |   const signInLink = page
  24  |     .locator('a[href*="login"], button:has-text("Sign in"), a:has-text("Sign in")')
  25  |     .first();
  26  |   await signInLink.waitFor({ state: 'visible', timeout: 10_000 });
  27  |   await signInLink.click();
  28  | 
  29  |   // Wait for login page
  30  |   await page.waitForURL(/\/login/, { timeout: 10_000 });
  31  | 
  32  |   // Fill credentials
  33  |   const emailInput = page.locator(
  34  |     'input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email"]'
  35  |   );
  36  |   await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  37  |   await emailInput.fill(CREDS.email);
  38  | 
  39  |   const passwordInput = page.locator('input[type="password"], input[name="password"]');
  40  |   await passwordInput.waitFor({ state: 'visible', timeout: 5_000 });
  41  |   await passwordInput.fill(CREDS.password);
  42  | 
  43  |   // Submit
  44  |   const submitBtn = page
  45  |     .locator(
  46  |       'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in"), button:has-text("Continue")'
  47  |     )
  48  |     .first();
  49  |   await submitBtn.waitFor({ state: 'visible', timeout: 5_000 });
  50  |   await submitBtn.click();
  51  | 
  52  |   // Wait for dashboard redirect
  53  |   await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  54  |   await page.waitForLoadState('networkidle', { timeout: 15_000 });
  55  | 
  56  |   // Wait for dashboard content to render
  57  |   const dashboardContent = page
  58  |     .locator('h1, h2, button, p, span')
  59  |     .filter({ hasText: /Databases|New database|Free Plan/i })
  60  |     .first();
  61  |   await dashboardContent.waitFor({ state: 'visible', timeout: 10_000 });
  62  | 
  63  |   // Allow React hydration / skeleton loaders to settle
  64  |   await page.waitForTimeout(2000);
  65  | 
  66  |   return pageErrors;
  67  | }
  68  | 
  69  | test.describe('EuroScale Dashboard Interactions', () => {
  70  |   test.describe.configure({ mode: 'serial' });
  71  | 
  72  |   // ====================================================================
  73  |   // TEST 1: TierCard rendering — Free Plan, Upgrade, UsageBars, Add-ons
  74  |   // ====================================================================
  75  |   test('TierCard renders Free Plan, Upgrade button, UsageBars, and Add-ons', async ({ page }) => {
  76  |     const pageErrors = await loginToDashboard(page);
  77  | 
  78  |     // --- Verify Free Plan text (heading, not the autoscale "not available" text) ---
  79  |     const freePlanText = page.getByRole('heading', { name: 'Free Plan' });
> 80  |     await expect(freePlanText).toBeVisible({ timeout: 10_000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  81  | 
  82  |     // --- Verify Upgrade button ---
  83  |     const upgradeBtn = page.locator('button:has-text("Upgrade")');
  84  |     await expect(upgradeBtn).toBeVisible({ timeout: 5_000 });
  85  | 
  86  |     // --- Verify UsageBar labels ---
  87  |     const usageBarLabels = ['Databases', 'Storage', 'Read Units', 'Write Units'];
  88  |     for (const label of usageBarLabels) {
  89  |       await expect(
  90  |         page.getByText(label, { exact: true }).first()
  91  |       ).toBeVisible({ timeout: 5_000 });
  92  |     }
  93  | 
  94  |     // --- Verify Add-ons section ---
  95  |     const addonsHeading = page.getByText('Add-ons');
  96  |     await expect(addonsHeading).toBeVisible({ timeout: 5_000 });
  97  | 
  98  |     // --- Verify Additional Storage input exists with default 10 ---
  99  |     const storageInput = page.locator('input[type="number"]');
  100 |     await expect(storageInput).toBeVisible({ timeout: 5_000 });
  101 |     await expect(storageInput).toHaveValue('10');
  102 | 
  103 |     // --- Verify Apply Changes button ---
  104 |     const applyBtn = page.getByText('Apply Changes');
  105 |     await expect(applyBtn).toBeVisible({ timeout: 5_000 });
  106 | 
  107 |     // --- Verify Autoscale not available on Free plan ---
  108 |     const autoscaleMsg = page.getByText('Autoscale not available');
  109 |     await expect(autoscaleMsg).toBeVisible({ timeout: 5_000 });
  110 | 
  111 |     // --- Verify no error page ---
  112 |     const errorTexts = [
  113 |       'This page couldn',
  114 |       'Something went wrong',
  115 |       'Application error',
  116 |       'An error occurred',
  117 |     ];
  118 |     for (const errorText of errorTexts) {
  119 |       await expect(
  120 |         page.getByText(errorText),
  121 |         `Page should not contain "${errorText}"`
  122 |       ).toHaveCount(0, { timeout: 3_000 });
  123 |     }
  124 | 
  125 |     // Still on /dashboard
  126 |     await expect(page).toHaveURL(/\/dashboard/);
  127 | 
  128 |     // Log JS errors
  129 |     if (pageErrors.length > 0) {
  130 |       console.warn(`⚠️  ${pageErrors.length} JS page error(s):`);
  131 |       pageErrors.forEach((e) => console.warn(`   - ${e}`));
  132 |     }
  133 | 
  134 |     await page.screenshot({
  135 |       path: path.join(SCREENSHOT_DIR, 'tiercard-rendering.png'),
  136 |       fullPage: false,
  137 |     });
  138 |     console.log('✅ TierCard rendering verified');
  139 |   });
  140 | 
  141 |   // ====================================================================
  142 |   // TEST 2: Upgrade button click → Mollie checkout redirect
  143 |   // ====================================================================
  144 |   test('Upgrade button redirects to Mollie hosted checkout page', async ({ page }) => {
  145 |     const pageErrors = await loginToDashboard(page);
  146 | 
  147 |     // Click Upgrade button and wait for Mollie redirect
  148 |     const upgradeBtn = page.locator('button:has-text("Upgrade")');
  149 |     await upgradeBtn.waitFor({ state: 'visible', timeout: 5_000 });
  150 | 
  151 |     // The upgrade button triggers an API call then does window.location redirect.
  152 |     // Use Promise.all to capture the navigation.
  153 |     try {
  154 |       await Promise.all([
  155 |         page.waitForURL((url) => url.hostname.includes('mollie.com'), { timeout: 30_000 }),
  156 |         upgradeBtn.click(),
  157 |       ]);
  158 |     } catch {
  159 |       // If the redirect didn't happen, log the current URL for debugging
  160 |       console.warn(`⚠️  Did not redirect to Mollie. Current URL: ${page.url()}`);
  161 |       // Try navigating directly if there was a delay
  162 |       await page.waitForTimeout(3000);
  163 |     }
  164 | 
  165 |     const currentUrl = page.url();
  166 |     console.log(`   Current URL: ${currentUrl}`);
  167 | 
  168 |     // If we're on Mollie, verify checkout page content
  169 |     if (currentUrl.includes('mollie.com')) {
  170 |       await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
  171 |         console.warn('⚠️  Mollie page did not reach networkidle');
  172 |       });
  173 |       await page.waitForTimeout(2000);
  174 | 
  175 |       // Verify Mollie page is showing — look for common Mollie checkout elements
  176 |       const mollieContent = await page.locator('body').innerText().catch(() => '');
  177 |       console.log(`   Mollie page snippet: ${mollieContent.slice(0, 300)}`);
  178 | 
  179 |       // Check for EuroScale or tier text on the Mollie page
  180 |       const hasEuroScaleText = mollieContent.includes('EuroScale') || mollieContent.includes('Scale tier');
```