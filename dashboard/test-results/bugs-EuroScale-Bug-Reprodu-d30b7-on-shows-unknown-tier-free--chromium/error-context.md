# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bugs.spec.ts >> EuroScale Bug Reproduction >> Bug 1: Upgrade button shows "unknown tier free"
- Location: e2e/bugs.spec.ts:4:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('button:has-text("Upgrade")') to be visible

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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('EuroScale Bug Reproduction', () => {
  4   |   test('Bug 1: Upgrade button shows "unknown tier free"', async ({ page }) => {
  5   |     await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });
  6   |     await page.fill('input[type="email"]', 'j.doe@company.com');
  7   |     await page.fill('input[type="password"]', 'Testb2c!');
  8   |     await page.click('button[type="submit"]');
  9   |     await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  10  |     await page.waitForTimeout(3000);
  11  | 
  12  |     // Look for Upgrade button
  13  |     const upgradeBtn = page.locator('button:has-text("Upgrade")');
> 14  |     await upgradeBtn.waitFor({ state: 'visible', timeout: 10000 });
      |                      ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  15  |     
  16  |     // Accept the dialog that may appear
  17  |     page.on('dialog', async dialog => {
  18  |       console.log(`Dialog: ${dialog.message()}`);
  19  |       await dialog.accept();
  20  |     });
  21  | 
  22  |     // Click Upgrade
  23  |     await upgradeBtn.click();
  24  |     await page.waitForTimeout(3000);
  25  |     
  26  |     // Check for error toast
  27  |     const body = await page.locator('body').innerText();
  28  |     console.log(`Bug 1 - Body after Upgrade click: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);
  29  |     
  30  |     const hasError = body.includes('unknown tier') || body.includes('Failed');
  31  |     console.log(`Bug 1 reproduced: ${hasError ? '✅' : '❌'}`);
  32  |   });
  33  | 
  34  |   test('Bug 2: Apply Changes shows "Storage resized to 0 GB"', async ({ page }) => {
  35  |     await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });
  36  |     await page.fill('input[type="email"]', 'j.doe@company.com');
  37  |     await page.fill('input[type="password"]', 'Testb2c!');
  38  |     await page.click('button[type="submit"]');
  39  |     await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  40  |     await page.waitForTimeout(5000);
  41  | 
  42  |     // Find and click "Apply Changes" button
  43  |     const applyBtn = page.locator('button:has-text("Apply Changes")');
  44  |     if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  45  |       await applyBtn.click();
  46  |       await page.waitForTimeout(3000);
  47  |       const body = await page.locator('body').innerText();
  48  |       console.log(`Bug 2 - Body after Apply: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);
  49  |       
  50  |       const hasResized0 = body.includes('Storage resized to 0GB') || body.includes('resized to 0 GB');
  51  |       console.log(`Bug 2 reproduced: ${hasResized0 ? '✅' : '❌'}`);
  52  |     } else {
  53  |       console.log('Bug 2 - Apply Changes button not visible (add-ons section not rendered)');
  54  |     }
  55  |   });
  56  | 
  57  |   test('Bug 3: Browse Data shows error', async ({ page }) => {
  58  |     await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });
  59  |     await page.fill('input[type="email"]', 'j.doe@company.com');
  60  |     await page.fill('input[type="password"]', 'Testb2c!');
  61  |     await page.click('button[type="submit"]');
  62  |     await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  63  |     await page.waitForTimeout(3000);
  64  | 
  65  |     // Click Browse Data link
  66  |     const browseLink = page.locator('a[href*="browse"], a:has-text("Browse Data")').first();
  67  |     await browseLink.waitFor({ state: 'visible', timeout: 5000 });
  68  |     await browseLink.click();
  69  |     await page.waitForURL(/\/browse/, { timeout: 10000 });
  70  |     await page.waitForTimeout(3000);
  71  | 
  72  |     const body = await page.locator('body').innerText();
  73  |     console.log(`Bug 3 - Browse page: ${body.slice(0, 300).replace(/\n/g, ' | ')}`);
  74  |     
  75  |     const hasError = body.includes('Failed to load databases') || body.includes('no valid credentials');
  76  |     console.log(`Bug 3 reproduced: ${hasError ? '✅' : '❌'}`);
  77  |   });
  78  | 
  79  |   test('Bug 4: Billing page redirects to wrong domain', async ({ page }) => {
  80  |     await page.goto('https://euroscale.app/login', { waitUntil: 'load', timeout: 20000 });
  81  |     await page.fill('input[type="email"]', 'j.doe@company.com');
  82  |     await page.fill('input[type="password"]', 'Testb2c!');
  83  |     await page.click('button[type="submit"]');
  84  |     await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  85  |     await page.waitForTimeout(3000);
  86  | 
  87  |     // Navigate to billing page with payment=success
  88  |     await page.goto('https://euroscale.app/dashboard/billing?payment=success', { waitUntil: 'networkidle', timeout: 20000 });
  89  |     await page.waitForTimeout(3000);
  90  |     
  91  |     const url = page.url();
  92  |     const body = await page.locator('body').innerText().catch(() => '');
  93  |     console.log(`Bug 4 - URL: ${url}`);
  94  |     console.log(`Bug 4 - Body: ${body.slice(0, 200).replace(/\n/g, ' | ')}`);
  95  |     
  96  |     const hasWrongDomain = url.includes('dashboard.euroscale.app');
  97  |     console.log(`Bug 4 reproduced (wrong domain): ${hasWrongDomain ? '✅' : '❌'}`);
  98  |   });
  99  | });
  100 | 
```