# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-nav.spec.ts >> Auth & Navigation Flows >> Logout Flow >> should sign out and clear session
- Location: e2e/auth-nav.spec.ts:109:9

# Error details

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('text=Sign in').first()

```

```
Error: write EPIPE
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'https://euroscale.app';
  4   | const TEST_EMAIL = 'j.doe@company.com';
  5   | const TEST_PASSWORD = 'Testb2c!';
  6   | 
  7   | /**
  8   |  * Helper: login and return the page, ready for dashboard assertions.
  9   |  * Collects JS errors and console errors along the way.
  10  |  */
  11  | async function login(
  12  |   page: import('@playwright/test').Page,
  13  |   jsErrors: string[],
  14  |   consoleErrors: string[],
  15  | ) {
  16  |   // Navigate to landing page
  17  |   await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  18  |   await page.waitForTimeout(2000);
  19  | 
  20  |   // Click "Sign in" — look for link or button
  21  |   const signInLink = page.getByRole('link', { name: /sign in/i });
  22  |   const signInButton = page.getByRole('button', { name: /sign in/i });
  23  | 
  24  |   if (await signInLink.isVisible({ timeout: 3000 }).catch(() => false)) {
  25  |     await signInLink.click();
  26  |   } else if (await signInButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  27  |     await signInButton.click();
  28  |   } else {
  29  |     // Try text-based fallback
  30  |     const fallback = page.locator('text=Sign in').first();
> 31  |     await fallback.click();
      |     ^ Error: write EPIPE
  32  |   }
  33  | 
  34  |   await page.waitForURL(/\/login/, { timeout: 15_000 });
  35  |   await page.waitForLoadState('networkidle', { timeout: 15_000 });
  36  |   await page.waitForTimeout(1000);
  37  | 
  38  |   // Fill credentials
  39  |   // shadcn/ui inputs use data-slot="input" attribute
  40  |   await page.locator('input[type="email"]').fill(TEST_EMAIL);
  41  |   await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  42  | 
  43  |   // Submit
  44  |   await page.locator('button[type="submit"]').click();
  45  | 
  46  |   await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  47  |   await page.waitForLoadState('networkidle', { timeout: 15_000 });
  48  |   await page.waitForTimeout(3000);
  49  | }
  50  | 
  51  | test.describe('Auth & Navigation Flows', () => {
  52  |   test.describe('Login Flow', () => {
  53  |     test('should show landing page with Sign in link', async ({ page }) => {
  54  |       const jsErrors: string[] = [];
  55  |       page.on('pageerror', (err) => jsErrors.push(err.message));
  56  | 
  57  |       await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  58  |       await page.waitForTimeout(2000);
  59  | 
  60  |       // Should be on landing page (not login, not dashboard)
  61  |       const url = page.url();
  62  |       expect(url).not.toMatch(/\/login/);
  63  |       expect(url).not.toMatch(/\/dashboard/);
  64  | 
  65  |       // Should have a Sign in link
  66  |       const signIn = page.getByText(/sign in/i).first();
  67  |       await expect(signIn).toBeVisible({ timeout: 10_000 });
  68  | 
  69  |       // Report any JS errors
  70  |       if (jsErrors.length > 0) {
  71  |         console.warn(`[Landing page] JS errors: ${jsErrors.join('; ')}`);
  72  |       }
  73  |     });
  74  | 
  75  |     test('should login successfully and show dashboard', async ({ page }) => {
  76  |       const jsErrors: string[] = [];
  77  |       page.on('pageerror', (err) => jsErrors.push(err.message));
  78  |       const consoleErrors: string[] = [];
  79  |       page.on('console', (msg) => {
  80  |         if (msg.type() === 'error') consoleErrors.push(msg.text());
  81  |       });
  82  | 
  83  |       await login(page, jsErrors, consoleErrors);
  84  | 
  85  |       // Verify URL is /dashboard
  86  |       expect(page.url()).toMatch(/\/dashboard/);
  87  | 
  88  |       // Verify "Databases" heading is visible
  89  |       await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });
  90  | 
  91  |       // Verify sidebar shows user email (if visible — dashboard content may
  92  |       // be limited if API key isn't configured)
  93  |       const emailVisible = await page.getByText(TEST_EMAIL).isVisible({ timeout: 3000 }).catch(() => false);
  94  |       if (emailVisible) {
  95  |         console.log('[Login] User email visible in sidebar');
  96  |       }
  97  | 
  98  |       // Report errors
  99  |       if (jsErrors.length > 0) {
  100 |         console.warn(`[Login] JS errors: ${jsErrors.join('; ')}`);
  101 |       }
  102 |       if (consoleErrors.length > 0) {
  103 |         console.warn(`[Login] Console errors: ${consoleErrors.join('; ')}`);
  104 |       }
  105 |     });
  106 |   });
  107 | 
  108 |   test.describe('Logout Flow', () => {
  109 |     test('should sign out and clear session', async ({ page }) => {
  110 |       const jsErrors: string[] = [];
  111 |       page.on('pageerror', (err) => jsErrors.push(err.message));
  112 | 
  113 |       // Login first
  114 |       await login(page, jsErrors, []);
  115 |       await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });
  116 | 
  117 |       // Record session keys before logout
  118 |       const keysBefore = await page.evaluate(() => {
  119 |         const keys: string[] = [];
  120 |         for (let i = 0; i < localStorage.length; i++) {
  121 |           keys.push(localStorage.key(i) || '');
  122 |         }
  123 |         return keys;
  124 |       });
  125 |       console.log(`[Logout] localStorage keys before: ${keysBefore.join(', ')}`);
  126 | 
  127 |       // Find and click "Sign out" — try multiple selectors
  128 |       // shadcn/ui sidebar now renders nav items as <button> elements with data-slot="button"
  129 |       const signOutLink = page.getByRole('link', { name: /sign out/i });
  130 |       const signOutButton = page.getByRole('button', { name: /sign out/i });
  131 |       const signOutText = page.getByText(/sign out/i).first();
```