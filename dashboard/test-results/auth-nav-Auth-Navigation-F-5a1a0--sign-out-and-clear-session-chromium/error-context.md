# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-nav.spec.ts >> Auth & Navigation Flows >> Logout Flow >> should sign out and clear session
- Location: e2e/auth-nav.spec.ts:119:9

# Error details

```
TimeoutError: page.waitForURL: Timeout 20000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - img "EuroScale" [ref=e5]
        - heading "EuroScale" [level=1] [ref=e6]
        - paragraph [ref=e7]: Sign in to your account
      - generic [ref=e8]:
        - alert [ref=e9]:
          - img [ref=e10]
          - generic [ref=e12]: Login failed
        - generic [ref=e13]:
          - generic [ref=e14]:
            - generic [ref=e15]: Email address
            - generic [ref=e16]:
              - img
              - textbox "Email address" [ref=e17]:
                - /placeholder: you@company.com
                - text: j.doe@company.com
          - generic [ref=e18]:
            - generic [ref=e19]: Password
            - generic [ref=e20]:
              - img
              - textbox "Password" [ref=e21]:
                - /placeholder: ••••••••
                - text: Testb2c!
              - button "Show password" [ref=e22]:
                - img [ref=e23]
          - button "Sign in" [ref=e26]:
            - text: Sign in
            - img [ref=e27]
        - paragraph [ref=e29]:
          - text: Don't have an account?
          - link "Create one" [ref=e30] [cursor=pointer]:
            - /url: /signup
      - paragraph [ref=e31]: EU sovereign infrastructure · GDPR by architecture
  - alert [ref=e32]
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
  12  |   page: ReturnType<typeof test['info'] extends () => infer I ? never : never>,
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
  31  |     await fallback.click();
  32  |   }
  33  | 
  34  |   await page.waitForURL(/\/login/, { timeout: 15_000 });
  35  |   await page.waitForLoadState('networkidle', { timeout: 15_000 });
  36  |   await page.waitForTimeout(1000);
  37  | 
  38  |   // Fill credentials
  39  |   await page.locator('input[type="email"]').fill(TEST_EMAIL);
  40  |   await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  41  | 
  42  |   // Submit
  43  |   await page.locator('button[type="submit"]').click();
  44  | 
> 45  |   await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      |              ^ TimeoutError: page.waitForURL: Timeout 20000ms exceeded.
  46  |   await page.waitForLoadState('networkidle', { timeout: 15_000 });
  47  |   await page.waitForTimeout(3000);
  48  | }
  49  | 
  50  | test.describe('Auth & Navigation Flows', () => {
  51  |   test.describe('Login Flow', () => {
  52  |     test('should show landing page with Sign in link', async ({ page }) => {
  53  |       const jsErrors: string[] = [];
  54  |       page.on('pageerror', (err) => jsErrors.push(err.message));
  55  | 
  56  |       await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  57  |       await page.waitForTimeout(2000);
  58  | 
  59  |       // Should be on landing page (not login, not dashboard)
  60  |       const url = page.url();
  61  |       expect(url).not.toMatch(/\/login/);
  62  |       expect(url).not.toMatch(/\/dashboard/);
  63  | 
  64  |       // Should have a Sign in link
  65  |       const signIn = page.getByText(/sign in/i).first();
  66  |       await expect(signIn).toBeVisible({ timeout: 10_000 });
  67  | 
  68  |       // Report any JS errors
  69  |       if (jsErrors.length > 0) {
  70  |         console.warn(`[Landing page] JS errors: ${jsErrors.join('; ')}`);
  71  |       }
  72  |     });
  73  | 
  74  |     test('should login successfully and show dashboard', async ({ page }) => {
  75  |       const jsErrors: string[] = [];
  76  |       page.on('pageerror', (err) => jsErrors.push(err.message));
  77  |       const consoleErrors: string[] = [];
  78  |       page.on('console', (msg) => {
  79  |         if (msg.type() === 'error') consoleErrors.push(msg.text());
  80  |       });
  81  | 
  82  |       await login(page, jsErrors, consoleErrors);
  83  | 
  84  |       // Verify URL is /dashboard
  85  |       expect(page.url()).toMatch(/\/dashboard/);
  86  | 
  87  |       // Verify "Databases" heading is visible
  88  |       await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });
  89  | 
  90  |       // Verify sidebar shows user email
  91  |       await expect(page.getByText(TEST_EMAIL)).toBeVisible({ timeout: 5_000 });
  92  | 
  93  |       // Verify session exists in localStorage
  94  |       const hasSession = await page.evaluate(() => {
  95  |         for (let i = 0; i < localStorage.length; i++) {
  96  |           const key = localStorage.key(i);
  97  |           if (key && key.includes('supabase')) return true;
  98  |         }
  99  |         // Also check for any auth token pattern
  100 |         const allKeys = [];
  101 |         for (let i = 0; i < localStorage.length; i++) {
  102 |           allKeys.push(localStorage.key(i));
  103 |         }
  104 |         return allKeys.some((k) => k && /auth|session|token|supabase/i.test(k));
  105 |       });
  106 |       expect(hasSession).toBe(true);
  107 | 
  108 |       // Report errors
  109 |       if (jsErrors.length > 0) {
  110 |         console.warn(`[Login] JS errors: ${jsErrors.join('; ')}`);
  111 |       }
  112 |       if (consoleErrors.length > 0) {
  113 |         console.warn(`[Login] Console errors: ${consoleErrors.join('; ')}`);
  114 |       }
  115 |     });
  116 |   });
  117 | 
  118 |   test.describe('Logout Flow', () => {
  119 |     test('should sign out and clear session', async ({ page }) => {
  120 |       const jsErrors: string[] = [];
  121 |       page.on('pageerror', (err) => jsErrors.push(err.message));
  122 | 
  123 |       // Login first
  124 |       await login(page, jsErrors, []);
  125 |       await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });
  126 | 
  127 |       // Record session keys before logout
  128 |       const keysBefore = await page.evaluate(() => {
  129 |         const keys: string[] = [];
  130 |         for (let i = 0; i < localStorage.length; i++) {
  131 |           keys.push(localStorage.key(i) || '');
  132 |         }
  133 |         return keys;
  134 |       });
  135 |       console.log(`[Logout] localStorage keys before: ${keysBefore.join(', ')}`);
  136 | 
  137 |       // Find and click "Sign out" — try multiple selectors
  138 |       const signOutLink = page.getByRole('link', { name: /sign out/i });
  139 |       const signOutButton = page.getByRole('button', { name: /sign out/i });
  140 |       const signOutText = page.getByText(/sign out/i).first();
  141 | 
  142 |       let clicked = false;
  143 |       for (const el of [signOutLink, signOutButton, signOutText]) {
  144 |         if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
  145 |           await el.click();
```