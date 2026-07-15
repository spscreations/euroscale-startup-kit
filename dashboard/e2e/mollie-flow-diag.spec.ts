import { test, Page } from "@playwright/test";

const BILLING_URL = "/dashboard/billing";
const DASHBOARD_URL = "/dashboard";
const DIAG_EMAIL = "j.doe@company.com";
const DIAG_PASSWORD = "Testb2c!";
const TEST_CARD_NUMBER = "4917610000000000";
const TEST_CARD_EXPIRY = "12/28";
const TEST_CARD_CVC = "123";

async function diagnosticLogin(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const passwordInput = page.locator('input[type="password"], input[name="password"]');

  if ((await emailInput.count()) > 0) await emailInput.first().fill(DIAG_EMAIL);
  if ((await passwordInput.count()) > 0) await passwordInput.first().fill(DIAG_PASSWORD);

  const submitBtn = page.getByRole("button", { name: /sign in|login|continue|submit/i });
  if ((await submitBtn.count()) > 0) await submitBtn.first().click();

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  } catch {
    console.log("⚠️ Did not redirect to /dashboard after login");
  }
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

test.describe("UPGRADE PERSISTENCE DIAGNOSTIC", () => {
  // Diagnostic-only: Mollie card fields live in a secure iframe; full card fill is flaky.
  // Keep for manual investigation — skip in default suite runs.
  test.skip("DIAGNOSTIC: Complete Mollie payment flow with card", async ({ page }) => {
    // Track confirm-payment requests
    const confirmPaymentResults: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("confirm-payment")) {
        try {
          const body = await response.text();
          const cookies = await page.context().cookies();
          const sessionCookie = cookies.find(c => c.name.includes("session") || c.name.includes("auth"));
          confirmPaymentResults.push(`[${response.status()}] ${response.url()} => ${body}`);
          console.log(`[CONFIRM-PAYMENT] Status: ${response.status()} Body: ${body}`);
          if (sessionCookie) console.log(`  Session cookie: ${sessionCookie.name}=${sessionCookie.value.slice(0, 30)}...`);
        } catch {
          confirmPaymentResults.push(`[${response.status()}] ${response.url()}`);
        }
      }
    });

    // Login
    console.log("══════════════════════════════════════════════");
    console.log("  COMPLETE MOLLIE PAYMENT FLOW DIAGNOSTIC");
    console.log("══════════════════════════════════════════════");

    console.log("\n[STEP 1] Logging in...");
    await diagnosticLogin(page);

    // Extract cookies for later API calls
    const cookies = await page.context().cookies();
    console.log("  Session cookies:");
    cookies.forEach(c => {
      if (c.name.includes("session") || c.name.includes("auth") || c.name.includes("token")) {
        console.log(`    ${c.name}=${c.value.slice(0, 40)}...`);
      }
    });

    // Navigate to billing
    console.log("\n[STEP 2] Navigating to billing...");
    await page.goto(BILLING_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/diag-flow-01-billing-before.png", fullPage: true });

    // Check current plan
    const billingBody = await page.locator("body").innerText();
    const planMatch = billingBody.match(/Current Plan:\s*(\w+)/i);
    if (planMatch) {
      console.log(`  Current plan before upgrade: ${planMatch[1]}`);
    }

    // Click the first Upgrade button (should be Scale)
    console.log("\n[STEP 3] Clicking Scale upgrade button...");
    const upgradeButtons = page.getByRole("button", { name: /upgrade/i });
    const upgradeCount = await upgradeButtons.count();
    console.log(`  Upgrade buttons: ${upgradeCount}`);

    if (upgradeCount === 0) {
      console.log("  No upgrade buttons - user already on max tier");
      return;
    }

    try {
      await Promise.all([
        page.waitForURL((url) => url.hostname.includes("mollie.com"), { timeout: 30_000 }),
        upgradeButtons.first().click(),
      ]);
      console.log("  ✅ Redirected to Mollie!");
    } catch (err: any) {
      console.log(`  ❌ Mollie redirect failed: ${err.message?.slice(0, 150)}`);
      console.log(`  Current URL: ${page.url()}`);
      return;
    }

    // Mollie checkout page
    console.log("\n[STEP 4] On Mollie checkout...");
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/diag-flow-02-mollie-method-select.png", fullPage: true });

    console.log(`  Mollie URL: ${page.url()}`);

    // Click "Card" payment method
    const cardOption = page.locator("text=Card").first();
    if ((await cardOption.count()) > 0) {
      console.log("  Clicking 'Card' payment method...");
      await cardOption.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } else {
      console.log("  ⚠️ 'Card' option not found. Page body:");
      const body = await page.locator("body").innerText();
      console.log(`  ${body.slice(0, 300)}`);
    }

    await page.screenshot({ path: "e2e/diag-flow-03-mollie-card-form.png", fullPage: true });

    // Fill card details
    console.log("\n[STEP 5] Filling card details...");
    const cardNumberInput = page.locator('input[name="cardNumber"]');
    if ((await cardNumberInput.count()) > 0) {
      await cardNumberInput.fill(TEST_CARD_NUMBER);
      console.log("  Filled card number");
    } else {
      // Try iframe approach - Mollie might load card fields in an iframe
      const frames = page.frames();
      console.log(`  Found ${frames.length} frames`);
      let filledInFrame = false;
      for (const frame of frames) {
        const frameCard = frame.locator('input[name="cardNumber"]');
        if ((await frameCard.count()) > 0) {
          await frameCard.fill(TEST_CARD_NUMBER);
          console.log("  Filled card number in iframe");
          filledInFrame = true;
        }
      }
      if (!filledInFrame) {
        console.log("  ⚠️ Could not find card number input anywhere");
        // Take a screenshot of the current page
        await page.screenshot({ path: "e2e/diag-flow-03b-card-form-debug.png", fullPage: true });
      }
    }

    // Fill expiry
    const expiryInput = page.locator('input[name="cardExpiry"]');
    if ((await expiryInput.count()) > 0) {
      await expiryInput.fill(TEST_CARD_EXPIRY);
    }

    // Fill CVC
    const cvcInput = page.locator('input[name="cardCvc"]');
    if ((await cvcInput.count()) > 0) {
      await cvcInput.fill(TEST_CARD_CVC);
    }

    await page.screenshot({ path: "e2e/diag-flow-04-card-filled.png", fullPage: true });

    // Click pay
    console.log("\n[STEP 6] Clicking Pay...");
    const payBtn = page.getByRole("button", { name: /pay|place order|confirm/i });
    if ((await payBtn.count()) > 0) {
      await payBtn.first().click();
      console.log("  Pay button clicked!");

      // Wait for redirect
      try {
        await page.waitForURL(/dashboard/, { timeout: 30_000 });
        console.log("  ✅ Redirected back to dashboard!");
      } catch {
        console.log("  ⚠️ No redirect back to dashboard");
        console.log(`  Current URL: ${page.url()}`);
      }
    } else {
      console.log("  ⚠️ Pay button not found");
    }

    await page.waitForTimeout(5000);

    // Check post-payment state
    console.log("\n[STEP 7] Checking post-payment state...");
    await page.screenshot({ path: "e2e/diag-flow-05-post-payment.png", fullPage: true });

    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    // Navigate to billing
    await page.goto(BILLING_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/diag-flow-06-billing-after.png", fullPage: true });

    const afterBody = await page.locator("body").innerText();
    const afterPlanMatch = afterBody.match(/Current Plan:\s*(\w+)/i);
    if (afterPlanMatch) {
      console.log(`  Current plan AFTER payment: ${afterPlanMatch[1]}`);
    }

    // Check toast
    const toastEl = page.locator('[data-sonner-toast]');
    const toastCount = await toastEl.count();
    if (toastCount > 0) {
      const toastText = await toastEl.first().innerText();
      console.log(`  Toast: ${toastText}`);
    } else {
      console.log("  No toast visible");
    }

    // Navigate to dashboard
    await page.goto(DASHBOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/diag-flow-07-dashboard-after.png", fullPage: true });

    const dashAfterBody = await page.locator("body").innerText();
    console.log(`  Dashboard after: ${dashAfterBody.slice(0, 300).replace(/\n/g, " | ")}`);

    // Summary
    console.log("\n══════════════════════════════════════════════");
    console.log("  FLOW DIAGNOSTIC RESULTS");
    console.log("══════════════════════════════════════════════");
    console.log(`  Confirm-payment calls detected: ${confirmPaymentResults.length}`);
    confirmPaymentResults.forEach(r => console.log(`    ${r}`));
    console.log(`  Plan before: ${planMatch?.[1] ?? "unknown"}`);
    console.log(`  Plan after: ${afterPlanMatch?.[1] ?? "unknown"}`);

    // Now do API-level check
    console.log("\n[API CHECK] Calling confirm-payment with test ID...");
    const apiCheck = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/rest/api/v1/invoices?user_id=fNIzI6vnOf1yyPHi6FRy06z904x3IFFX");
        const text = await r.text();
        return { status: r.status, body: text };
      } catch (e: any) {
        return { error: e.message };
      }
    });
    console.log(`  Invoices API response: ${JSON.stringify(apiCheck).slice(0, 500)}`);
  });
});
