# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-nav.spec.ts >> Auth & Navigation Flows >> Logout Flow >> should sign out and clear session
- Location: e2e/auth-nav.spec.ts:119:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1
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
        - generic [ref=e9]:
          - generic [ref=e10]:
            - generic [ref=e11]: Email address
            - generic [ref=e12]:
              - img
              - textbox "Email address" [ref=e13]:
                - /placeholder: you@company.com
          - generic [ref=e14]:
            - generic [ref=e15]: Password
            - generic [ref=e16]:
              - img
              - textbox "Password" [ref=e17]:
                - /placeholder: ••••••••
              - button "Show password" [ref=e18]:
                - img [ref=e19]
          - button "Sign in" [ref=e22]:
            - text: Sign in
            - img [ref=e23]
        - paragraph [ref=e25]:
          - text: Don't have an account?
          - link "Create one" [ref=e26] [cursor=pointer]:
            - /url: /signup
      - paragraph [ref=e27]: EU sovereign infrastructure · GDPR by architecture
  - alert [ref=e28]
```

# Test source

```ts
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
> 182 |         expect(authKeysAfter.length).toBe(0);
      |                                      ^ Error: expect(received).toBe(expected) // Object.is equality
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
  207 |           console.warn(`[Nav] "${navText}" not found in nav`);
  208 |           return false;
  209 |         }
  210 | 
  211 |         await navItem.click();
  212 |         await page.waitForTimeout(2000);
  213 | 
  214 |         const url = page.url();
  215 |         const matches = expectedUrlPattern.test(url);
  216 |         console.log(`[Nav] Clicked "${navText}" → URL: ${url} (expected: ${expectedUrlPattern}) ${matches ? '✅' : '❌'}`);
  217 |         return matches;
  218 |       }
  219 | 
  220 |       // 1. Databases → /dashboard
  221 |       const dbOk = await clickNav(/databases/i, /\/dashboard$/);
  222 | 
  223 |       // 2. Backups → /dashboard/backups
  224 |       const backupsOk = await clickNav(/backups/i, /\/dashboard\/backups/);
  225 | 
  226 |       // 3. Browse Data → /dashboard/browse
  227 |       const browseOk = await clickNav(/browse data/i, /\/dashboard\/browse/);
  228 | 
  229 |       // 4. Billing → /dashboard/billing
  230 |       const billingOk = await clickNav(/billing/i, /\/dashboard\/billing/);
  231 | 
  232 |       // 5. Settings → /dashboard/settings
  233 |       const settingsOk = await clickNav(/settings/i, /\/dashboard\/settings/);
  234 | 
  235 |       // Report results
  236 |       console.log(`\n[Nav results] Databases: ${dbOk}, Backups: ${backupsOk}, Browse Data: ${browseOk}, Billing: ${billingOk}, Settings: ${settingsOk}`);
  237 | 
  238 |       if (jsErrors.length > 0) {
  239 |         console.warn(`[Navigation] JS errors: ${jsErrors.join('; ')}`);
  240 |       }
  241 |     });
  242 | 
  243 |     test('New database nav item should show create dialog', async ({ page }) => {
  244 |       const jsErrors: string[] = [];
  245 |       page.on('pageerror', (err) => jsErrors.push(err.message));
  246 | 
  247 |       await login(page, jsErrors, []);
  248 |       await expect(page.getByText(/databases/i).first()).toBeVisible({ timeout: 10_000 });
  249 | 
  250 |       // Find "New database" or "Create" or "+" button
  251 |       const newDb = page.locator('nav a, nav button, aside a, aside button, button').filter({ hasText: /new database|create database|\+ new/i }).first();
  252 | 
  253 |       if (await newDb.isVisible({ timeout: 3000 }).catch(() => false)) {
  254 |         await newDb.click();
  255 |         await page.waitForTimeout(2000);
  256 | 
  257 |         // Check for dialog/modal content
  258 |         const dialogVisible = await page.locator('[role="dialog"], .modal, [role="alertdialog"]').isVisible({ timeout: 3000 }).catch(() => false);
  259 |         const hasCreateText = await page.getByText(/create|new database|database name/i).first().isVisible({ timeout: 2000 }).catch(() => false);
  260 | 
  261 |         console.log(`[New database] Dialog visible: ${dialogVisible}, Create text visible: ${hasCreateText}`);
  262 | 
  263 |         // Close dialog if open (Escape)
  264 |         if (dialogVisible) {
  265 |           await page.keyboard.press('Escape');
  266 |           await page.waitForTimeout(1000);
  267 |         }
  268 |       } else {
  269 |         console.warn('[New database] "New database" button not found in nav');
  270 |       }
  271 | 
  272 |       if (jsErrors.length > 0) {
  273 |         console.warn(`[New database nav] JS errors: ${jsErrors.join('; ')}`);
  274 |       }
  275 |     });
  276 |   });
  277 | 
  278 |   test.describe('Page Rendering', () => {
  279 |     test('Dashboard shows stats cards and usage bars', async ({ page }) => {
  280 |       const jsErrors: string[] = [];
  281 |       page.on('pageerror', (err) => jsErrors.push(err.message));
  282 |       const consoleErrors: string[] = [];
```