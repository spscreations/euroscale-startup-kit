# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-nav.spec.ts >> Auth & Navigation Flows >> Login Flow >> should login successfully and show dashboard
- Location: e2e/auth-nav.spec.ts:74:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - img "EuroScale" [ref=e5]
        - paragraph [ref=e7]: EuroScale
      - navigation [ref=e8]:
        - link "Databases" [ref=e9] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e10]
          - text: Databases
        - link "Backups" [ref=e14] [cursor=pointer]:
          - /url: /dashboard/backups
          - img [ref=e15]
          - text: Backups
        - link "Browse Data" [ref=e18] [cursor=pointer]:
          - /url: /dashboard/browse
          - img [ref=e19]
          - text: Browse Data
        - link "New database" [ref=e22] [cursor=pointer]:
          - /url: /dashboard/create
          - img [ref=e23]
          - text: New database
        - link "Billing" [ref=e24] [cursor=pointer]:
          - /url: /dashboard/billing
          - img [ref=e25]
          - text: Billing
        - link "Settings" [ref=e27] [cursor=pointer]:
          - /url: /dashboard/settings
          - img [ref=e28]
          - text: Settings
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: U
          - generic [ref=e34]:
            - paragraph [ref=e36]: User
            - paragraph [ref=e37]: j.doe@company.com
        - button "Sign out" [ref=e38]:
          - img [ref=e39]
          - text: Sign out
    - main [ref=e42]:
      - generic [ref=e43]:
        - generic [ref=e45]:
          - heading "Databases" [level=1] [ref=e47]
          - generic [ref=e48]:
            - button "Refresh databases" [ref=e49]:
              - img [ref=e50]
              - text: Refresh
            - button "New database" [ref=e55]:
              - img [ref=e56]
              - text: New database
        - main [ref=e57]:
          - generic [ref=e58]:
            - generic [ref=e59]:
              - generic [ref=e60]:
                - generic [ref=e61]: Total Databases
                - img [ref=e62]
              - paragraph [ref=e66]: "0"
            - generic [ref=e67]:
              - generic [ref=e68]:
                - generic [ref=e69]: Active Connections
                - img [ref=e70]
              - paragraph [ref=e72]: "0"
            - generic [ref=e73]:
              - generic [ref=e74]:
                - generic [ref=e75]: Storage Used
                - img [ref=e76]
              - paragraph [ref=e78]: —
          - generic [ref=e79]:
            - img [ref=e80]
            - generic [ref=e87]:
              - paragraph [ref=e88]: Could not load databases
              - paragraph [ref=e89]: "[unauthenticated] invalid or missing API key"
            - button "Retry" [ref=e90]:
              - img [ref=e91]
              - text: Retry
  - alert [ref=e96]
```

# Test source

```ts
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
  45  |   await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
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
> 106 |       expect(hasSession).toBe(true);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
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
  146 |           clicked = true;
  147 |           console.log('[Logout] Clicked Sign out');
  148 |           break;
  149 |         }
  150 |       }
  151 | 
  152 |       if (!clicked) {
  153 |         // Try to find any element containing "Sign out" or "Log out"
  154 |         const anyLogout = page.locator('a, button, span, div').filter({ hasText: /sign out|log out/i }).first();
  155 |         if (await anyLogout.isVisible({ timeout: 3000 }).catch(() => false)) {
  156 |           await anyLogout.click();
  157 |           clicked = true;
  158 |           console.log('[Logout] Clicked Sign out via fallback selector');
  159 |         }
  160 |       }
  161 | 
  162 |       if (clicked) {
  163 |         // Wait for redirect away from dashboard
  164 |         await page.waitForTimeout(3000);
  165 |         const url = page.url();
  166 |         console.log(`[Logout] URL after sign out: ${url}`);
  167 | 
  168 |         // Should be on landing or login page
  169 |         const isRedirected = !url.includes('/dashboard');
  170 |         console.log(`[Logout] Redirected away from dashboard: ${isRedirected}`);
  171 | 
  172 |         // Verify session removed from localStorage
  173 |         const authKeysAfter = await page.evaluate(() => {
  174 |           const keys: string[] = [];
  175 |           for (let i = 0; i < localStorage.length; i++) {
  176 |             const k = localStorage.key(i);
  177 |             if (k && /auth|session|token|supabase/i.test(k)) keys.push(k);
  178 |           }
  179 |           return keys;
  180 |         });
  181 |         console.log(`[Logout] Auth keys after logout: ${authKeysAfter.join(', ') || '(none)'}`);
  182 |         expect(authKeysAfter.length).toBe(0);
  183 |       } else {
  184 |         console.warn('[Logout] Could not find Sign out element — skipping logout assertion');
  185 |       }
  186 | 
  187 |       if (jsErrors.length > 0) {
  188 |         console.warn(`[Logout] JS errors: ${jsErrors.join('; ')}`);
  189 |       }
  190 |     });
  191 |   });
  192 | 
  193 |   test.describe('Sidebar Navigation', () => {
  194 |     test('should navigate to all sidebar destinations', async ({ page }) => {
  195 |       const jsErrors: string[] = [];
  196 |       page.on('pageerror', (err) => jsErrors.push(err.message));
  197 | 
  198 |       // Login
  199 |       await login(page, jsErrors, []);
  200 |       await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });
  201 | 
  202 |       // Helper: find and click a nav item by text, then verify URL
  203 |       async function clickNav(navText: string | RegExp, expectedUrlPattern: RegExp): Promise<boolean> {
  204 |         const navItem = page.locator('nav a, nav button, aside a, aside button, [role="navigation"] a').filter({ hasText: navText }).first();
  205 | 
  206 |         if (!(await navItem.isVisible({ timeout: 3000 }).catch(() => false))) {
```