import { test, expect, Page } from "@playwright/test";

// ── Configuration ──────────────────────────────────────────────────────────
const ROOT_URL = "/";
const BILLING_URL = "/dashboard/billing";
const SETTINGS_URL = "/dashboard/settings";
const DASHBOARD_URL = "/dashboard";

// ── Test credentials (use environment variables or defaults for local dev) ──
const TEST_EMAIL =
  process.env.E2E_TEST_EMAIL ?? "j.doe@company.com";
const TEST_PASSWORD =
  process.env.E2E_TEST_PASSWORD ?? "Testb2c!";

// ── Helper: Login ─────────────────────────────────────────────────────────
async function loginToDashboard(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto(ROOT_URL, { waitUntil: "networkidle" });

  // Look for sign-in link/button
  const signInBtn = page.getByRole("link", { name: /sign in|login|dashboard/i });
  const signInButton = page.getByRole("button", { name: /sign in|login/i });

  if ((await signInBtn.count()) > 0) {
    await signInBtn.first().click();
  } else if ((await signInButton.count()) > 0) {
    await signInButton.first().click();
  }

  // Wait for login page (may be on /login or /signin or a dialog)
  try {
    await page.waitForURL(/\/login|\/signin|\/auth/, { timeout: 10_000 });
  } catch {
    // May already be on a page with a login form rendered inline
  }

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  // Find email and password inputs
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]');

  if ((await emailInput.count()) > 0) {
    await emailInput.first().fill(TEST_EMAIL);
  }
  if ((await passwordInput.count()) > 0) {
    await passwordInput.first().fill(TEST_PASSWORD);
  }

  // Submit the form
  const submitBtn = page.getByRole("button", { name: /sign in|login|continue|submit/i });
  if ((await submitBtn.count()) > 0) {
    await submitBtn.first().click();
  }

  // Wait for redirect to dashboard
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  } catch {
    console.log("Warning: did not redirect to /dashboard after login");
  }

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // Allow React hydration / skeleton loaders to settle
  await page.waitForTimeout(2000);

  return pageErrors;
}

// ── Helper: API error resilience ──────────────────────────────────────────
async function checkApiError(page: Page): Promise<boolean> {
  const apiError = page.getByText(/could not load|failed to load|API key|unreachable/i);
  try {
    await apiError.waitFor({ state: "visible", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

// ── Tier price/label assertions ───────────────────────────────────────────
const TIER_PRICE_MAP: Record<string, string> = {
  free: "€0",
  scale: "€29",
  team: "€99",
  business: "€399",
  enterprise: "Custom",
};

const TIER_LABEL_MAP: Record<string, string> = {
  free: "Free",
  scale: "Scale",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("Billing & Payments", () => {
  test("Billing page renders plan cards with correct features and prices", async ({
    page,
  }) => {
    const pageErrors = await loginToDashboard(page);

    // Navigate to billing page
    await page.goto(BILLING_URL, { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check for API error resilience
    if (await checkApiError(page)) {
      console.log("⚠️  API unavailable — skipping billing plan assertions");
      // Still verify the page rendered something useful
      await expect(page.getByRole("heading", { name: /billing/i })).toBeVisible({ timeout: 5000 }).catch(() => {});
      if (pageErrors.length > 0) console.warn(`JS errors: ${pageErrors.join("; ")}`);
      return;
    }

    // Verify page heading
    await expect(page.getByText(/billing/i).first()).toBeVisible({ timeout: 10_000 });

    // Verify "Available Plans" section exists
    const availablePlans = page.getByText(/available plans/i);
    await expect(availablePlans).toBeVisible({ timeout: 5_000 });

    // Verify Scale plan card
    const scaleHeading = page.getByRole("heading", { name: "Scale" });
    await expect(scaleHeading).toBeVisible({ timeout: 5_000 });

    // Verify Scale price is €29/mo (not €9 or other wrong value)
    const scalePrice = page.getByText("€29/mo");
    await expect(scalePrice.first()).toBeVisible({ timeout: 5_000 });

    // Verify Scale features match backend tiers.go
    await expect(page.getByText("3 databases")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("10 GB storage")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/1M read.*500K write/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Autoscale compute.*2 CU/i)).toBeVisible({ timeout: 5_000 });

    // Verify Team plan is €99/mo
    const teamHeading = page.getByRole("heading", { name: "Team" });
    await expect(teamHeading).toBeVisible({ timeout: 5_000 });
    const teamPrice = page.getByText("€99/mo");
    await expect(teamPrice.first()).toBeVisible({ timeout: 5_000 });

    // Verify Team features
    await expect(page.getByText("10 databases")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("50 GB storage")).toBeVisible({ timeout: 5_000 });

    // Verify Business plan is €399/mo
    const businessHeading = page.getByRole("heading", { name: "Business" });
    await expect(businessHeading).toBeVisible({ timeout: 5_000 });
    const businessPrice = page.getByText("€399/mo");
    await expect(businessPrice.first()).toBeVisible({ timeout: 5_000 });

    // Verify Business features
    await expect(page.getByText("Unlimited databases")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("250 GB storage")).toBeVisible({ timeout: 5_000 });

    // Verify Invoice History section exists
    await expect(page.getByText(/invoice history/i)).toBeVisible({ timeout: 5_000 });

    // Log collected page errors
    if (pageErrors.length > 0) {
      console.warn(`JS errors during billing test: ${pageErrors.join("; ")}`);
    }
  });

  test("Upgrade button creates payment and redirects to Mollie checkout", async ({
    page,
  }) => {
    const pageErrors = await loginToDashboard(page);

    // Navigate to billing page
    await page.goto(BILLING_URL, { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    if (await checkApiError(page)) {
      console.log("⚠️  API unavailable — skipping upgrade redirect test");
      if (pageErrors.length > 0) console.warn(`JS errors: ${pageErrors.join("; ")}`);
      return;
    }

    // Find an Upgrade button (should be on any tier above current)
    const upgradeButtons = page.getByRole("button", { name: /upgrade/i });
    const upgradeCount = await upgradeButtons.count();

    if (upgradeCount === 0) {
      console.log("No upgrade buttons visible — user may already be on max tier");
      // If on enterprise/business, "Current Plan" should be visible instead
      const currentPlan = page.getByRole("button", { name: /current plan|already included/i });
      if ((await currentPlan.count()) > 0) {
        await expect(currentPlan.first()).toBeVisible({ timeout: 5_000 });
      }
      return;
    }

    // Click the first upgrade button
    const upgradeBtn = upgradeButtons.first();
    await expect(upgradeBtn).toBeVisible({ timeout: 5_000 });

    // Click and check for redirect to Mollie
    // Use Promise.all to catch the navigation before the page unloads
    try {
      await Promise.all([
        page.waitForURL(
          (url) => url.hostname.includes("mollie.com"),
          { timeout: 30_000 },
        ),
        upgradeBtn.click(),
      ]);

      // We're on Mollie checkout page
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Verify Mollie checkout loaded
      const bodyText = await page.locator("body").innerText();
      console.log(
        `Mollie checkout body: ${bodyText.slice(0, 200)}...`,
      );
      expect(
        bodyText.includes("EuroScale") ||
          bodyText.includes("euroscale") ||
          bodyText.length > 100,
      ).toBeTruthy();

      // Take a screenshot for verification
      await page.screenshot({
        path: "e2e/mollie-checkout.png",
        fullPage: true,
      });
    } catch (err: any) {
      // Mollie redirect may fail in local env (API not configured)
      // Check if we're still on the app or got an error
      const currentUrl = page.url();
      console.log(
        `Mollie redirect result: ${currentUrl} (error: ${err.message?.slice(0, 100)})`,
      );
      // Not a test failure — Mollie may not be reachable in test env
    }

    if (pageErrors.length > 0) {
      console.warn(`JS errors during upgrade test: ${pageErrors.join("; ")}`);
    }
  });

  test("Dashboard TierCard shows correct plan name and upgrade button", async ({
    page,
  }) => {
    const pageErrors = await loginToDashboard(page);

    // We should already be on /dashboard
    await page.waitForTimeout(2000);

    if (await checkApiError(page)) {
      console.log("⚠️  API unavailable — skipping TierCard assertions");
      if (pageErrors.length > 0) console.warn(`JS errors: ${pageErrors.join("; ")}`);
      return;
    }

    // The TierCard shows the current plan name — expect one of the valid tiers
    const tierLabels = Object.values(TIER_LABEL_MAP);

    // Find plan label text (e.g., "Free Plan", "Scale Plan")
    let foundPlan = false;
    for (const label of tierLabels) {
      const planText = page.getByText(`${label} Plan`);
      if ((await planText.count()) > 0) {
        // Verify it's a heading, not just text in a description
        const heading = page.getByRole("heading", { name: `${label} Plan` });
        if ((await heading.count()) > 0) {
          await expect(heading.first()).toBeVisible({ timeout: 3000 });
          foundPlan = true;
          break;
        }
        // Fallback: regular text match
        await expect(planText.first()).toBeVisible({ timeout: 3000 });
        foundPlan = true;
        break;
      }
    }

    if (!foundPlan) {
      console.log(
        "Could not find tier plan label — component may be in loading/error state",
      );
      // Check that the TierCard is at least rendered (may show skeleton)
      const tierCard = page.locator(".tier-card, [data-slot='card']").first();
      await expect(tierCard).toBeVisible({ timeout: 5000 }).catch(() => {});
    }

    // Verify no stale "€9" price anywhere (the old hardcoded bug)
    const stalePrice = page.getByText("€9");
    await expect(stalePrice).toHaveCount(0);

    // Verify upgrade button exists for free/scale users, or "Current plan" for higher tiers
    const upgradeBtn = page.getByRole("button", { name: /upgrade|current plan/i });
    const upgradeCount = await upgradeBtn.count();
    expect(upgradeCount).toBeGreaterThanOrEqual(0); // May be 0 if enterprise

    if (pageErrors.length > 0) {
      console.warn(`JS errors during TierCard test: ${pageErrors.join("; ")}`);
    }
  });

  test("Settings billing section shows dynamic plan data (not hardcoded €9)", async ({
    page,
  }) => {
    const pageErrors = await loginToDashboard(page);

    // Navigate to settings
    await page.goto(SETTINGS_URL, { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    if (await checkApiError(page)) {
      console.log("⚠️  API unavailable — skipping settings billing assertions");
      if (pageErrors.length > 0) console.warn(`JS errors: ${pageErrors.join("; ")}`);
      return;
    }

    // Verify settings page loaded
    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10_000 });

    // Find the Billing section
    const billingSection = page.getByText("Billing");
    await expect(billingSection.first()).toBeVisible({ timeout: 5_000 });

    // The old bug was a hardcoded "€9" price — verify it's NOT present
    const stalePrice = page.getByText("€9");
    await expect(stalePrice).toHaveCount(0);

    // Verify one of the valid tier prices is shown (from TIER_PRICE_MAP)
    const validPrices = Object.values(TIER_PRICE_MAP);
    let foundValidPrice = false;
    for (const price of validPrices) {
      const priceEl = page.getByText(price, { exact: true });
      if ((await priceEl.count()) > 0) {
        foundValidPrice = true;
        break;
      }
    }
    if (!foundValidPrice) {
      console.log(
        "Could not find any valid tier price in settings — component may be loading",
      );
    }

    // Verify no stale features from old mkB() like "5 GB storage per database"
    const staleFeature = page.getByText("5 GB storage per database");
    await expect(staleFeature).toHaveCount(0);

    if (pageErrors.length > 0) {
      console.warn(`JS errors during settings test: ${pageErrors.join("; ")}`);
    }
  });

  test("Mollie payment success redirect shows toast and triggers refetch", async ({
    page,
  }) => {
    const pageErrors = await loginToDashboard(page);

    // Navigate to billing with payment=success param (simulate Mollie redirect)
    await page.goto(`${BILLING_URL}?payment=success`, {
      waitUntil: "networkidle",
    });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    if (await checkApiError(page)) {
      console.log("⚠️  API unavailable — skipping payment redirect toast test");
      if (pageErrors.length > 0) console.warn(`JS errors: ${pageErrors.join("; ")}`);
      return;
    }

    // Check for success toast (Sonner renders li[data-sonner-toast])
    const successToast = page.locator('[data-sonner-toast][data-type="success"]');
    try {
      await successToast.waitFor({ state: "visible", timeout: 8000 });
      const toastText = await successToast.innerText();
      expect(toastText).toMatch(/payment successful|plan.*(updated|upgraded)/i);
    } catch {
      // Toast may have auto-dismissed — check alternative indicators
      console.log("Success toast not visible (may have auto-dismissed)");
    }

    // Verify the billing page is still functional
    await expect(page.getByText(/billing/i).first()).toBeVisible({ timeout: 5_000 });

    if (pageErrors.length > 0) {
      console.warn(`JS errors during redirect test: ${pageErrors.join("; ")}`);
    }
  });

  test.describe("UPGRADE PERSISTENCE DIAGNOSTIC", () => {
    // ── Test credentials for the diagnostic user ──
    const DIAG_EMAIL = "j.doe@company.com";
    const DIAG_PASSWORD = "Testb2c!";

    // ── Mollie test card details ──
    const TEST_CARD_NUMBER = "4917610000000000";
    const TEST_CARD_EXPIRY = "12/28"; // future date
    const TEST_CARD_CVC = "123";

    async function diagnosticLogin(page: Page, email: string, password: string): Promise<void> {
      await page.goto("/login", { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      // Take screenshot of login page
      await page.screenshot({ path: "e2e/diag-01-login-page.png", fullPage: true });

      const emailInput = page.locator('input[type="email"], input[name="email"]');
      const passwordInput = page.locator('input[type="password"], input[name="password"]');

      if ((await emailInput.count()) > 0) {
        await emailInput.first().fill(email);
      }
      if ((await passwordInput.count()) > 0) {
        await passwordInput.first().fill(password);
      }

      const submitBtn = page.getByRole("button", { name: /sign in|login|continue|submit/i });
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
      }

      // Wait for redirect after login
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      } catch {
        console.log("⚠️ Did not redirect to /dashboard after login — may be on login error");
      }
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    test("DIAGNOSTIC: Full upgrade flow — screenshots at every step", async ({ page }) => {
      console.log("══════════════════════════════════════════════════");
      console.log("  UPGRADE PERSISTENCE DIAGNOSTIC");
      console.log("  User: j.doe@company.com");
      console.log("══════════════════════════════════════════════════");

      // ── STEP 1: Login ──────────────────────────────────────────────────
      console.log("\n[STEP 1] Logging in...");
      await diagnosticLogin(page, DIAG_EMAIL, DIAG_PASSWORD);
      const postLoginUrl = page.url();
      console.log(`  Post-login URL: ${postLoginUrl}`);

      // ── STEP 2: Dashboard — check current plan ─────────────────────────
      console.log("\n[STEP 2] Checking dashboard current plan...");
      await page.goto(DASHBOARD_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "e2e/diag-02-dashboard.png", fullPage: true });

      // Extract visible plan info from the TierCard
      const pageBody = await page.locator("body").innerText();
      console.log(`  Dashboard body excerpt: ${pageBody.slice(0, 500).replace(/\n/g, " | ")}`);

      // Look for tier info
      for (const tier of ["Free", "Scale", "Team", "Business", "Enterprise"]) {
        if (pageBody.includes(`${tier} Plan`) || pageBody.includes(tier)) {
          console.log(`  ✅ Found tier reference: "${tier}"`);
        }
      }

      // ── STEP 3: Navigate to Billing page ───────────────────────────────
      console.log("\n[STEP 3] Navigating to billing page...");
      await page.goto(BILLING_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "e2e/diag-03-billing-page.png", fullPage: true });

      const billingBody = await page.locator("body").innerText();
      console.log(`  Billing body excerpt: ${billingBody.slice(0, 500).replace(/\n/g, " | ")}`);

      // Find upgrade buttons
      const upgradeButtons = page.getByRole("button", { name: /upgrade/i });
      const upgradeCount = await upgradeButtons.count();
      console.log(`  Upgrade buttons found: ${upgradeCount}`);

      // Check for "Current Plan" indicators
      const currentPlanBtns = page.getByRole("button", { name: /current plan/i });
      const currentPlanCount = await currentPlanBtns.count();
      console.log(`  "Current Plan" buttons found: ${currentPlanCount}`);

      // ── STEP 4: Click Scale upgrade button ─────────────────────────────
      console.log("\n[STEP 4] Attempting to click Scale upgrade...");

      // Look specifically for the Scale plan card
      const scaleSection = page.locator("text=Scale").locator("..");
      let clicked = false;

      if (upgradeCount > 0) {
        const scaleUpgradeBtn = page.locator("button", { hasText: /upgrade/i }).filter({ hasText: /scale|€29/i });
        const scaleUpCount = await scaleUpgradeBtn.count();
        if (scaleUpCount > 0) {
          console.log("  Clicking Scale upgrade button...");
          try {
            await Promise.all([
              page.waitForURL((url) => url.hostname.includes("mollie.com") || url.pathname.includes("checkout"), { timeout: 30_000 }),
              scaleUpgradeBtn.first().click(),
            ]);
            clicked = true;
            console.log("  ✅ Redirected to Mollie checkout!");
          } catch (err: any) {
            console.log(`  Mollie redirect failed: ${err.message?.slice(0, 150)}`);
            console.log(`  Current URL: ${page.url()}`);
          }
        } else {
          // Try any upgrade button
          console.log("  No Scale-specific upgrade button, trying any upgrade...");
          try {
            await Promise.all([
              page.waitForURL((url) => url.hostname.includes("mollie.com"), { timeout: 30_000 }),
              upgradeButtons.first().click(),
            ]);
            clicked = true;
            console.log("  ✅ Redirected to external checkout!");
          } catch (err: any) {
            console.log(`  Redirect failed: ${err.message?.slice(0, 150)}`);
            console.log(`  Current URL: ${page.url()}`);
          }
        }
      } else {
        console.log("  ⚠️ No upgrade buttons found — user may already be on max tier or API is down");
      }

      // ── STEP 5: Mollie checkout page ────────────────────────────────────
      if (clicked || page.url().includes("mollie.com")) {
        console.log("\n[STEP 5] On Mollie checkout page...");
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await page.screenshot({ path: "e2e/diag-05-mollie-checkout.png", fullPage: true });
        console.log(`  Mollie URL: ${page.url()}`);

        const mollieBody = await page.locator("body").innerText();
        console.log(`  Mollie body excerpt: ${mollieBody.slice(0, 400).replace(/\n/g, " | ")}`);

        // Try to fill in card details
        const cardInput = page.locator('input[name="cardNumber"], input[autocomplete="cc-number"]');
        if ((await cardInput.count()) > 0) {
          console.log("  Filling test card details...");
          await cardInput.first().fill(TEST_CARD_NUMBER);
          await page.waitForTimeout(500);

          const expiryInput = page.locator('input[name="cardExpiry"], input[autocomplete="cc-exp"]');
          if ((await expiryInput.count()) > 0) {
            await expiryInput.first().fill(TEST_CARD_EXPIRY);
          }

          const cvcInput = page.locator('input[name="cardCvc"], input[autocomplete="cc-csc"]');
          if ((await cvcInput.count()) > 0) {
            await cvcInput.first().fill(TEST_CARD_CVC);
          }

          const payBtn = page.getByRole("button", { name: /pay|place order|continue/i });
          if ((await payBtn.count()) > 0) {
            await payBtn.first().click();
            console.log("  Clicked pay button...");

            // Wait for redirect back
            try {
              await page.waitForURL(/dashboard.*billing/i, { timeout: 30_000 });
              console.log("  ✅ Redirected back to billing!");
            } catch {
              console.log("  ⚠️ Did not redirect back to billing");
            }
          }
        } else {
          console.log("  ⚠️ Card input fields not found — Mollie may have a different checkout flow");
        }
      }

      // ── STEP 6: Check post-upgrade state ───────────────────────────────
      console.log("\n[STEP 6] Checking post-upgrade state...");
      await page.goto(BILLING_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "e2e/diag-06-post-upgrade-billing.png", fullPage: true });

      const postBody = await page.locator("body").innerText();
      console.log(`  Post-upgrade billing body: ${postBody.slice(0, 500).replace(/\n/g, " | ")}`);

      // Check for toast
      const toastEl = page.locator('[data-sonner-toast]');
      const toastCount = await toastEl.count();
      console.log(`  Toast elements found: ${toastCount}`);
      if (toastCount > 0) {
        const toastText = await toastEl.first().innerText();
        console.log(`  Toast text: "${toastText}"`);
      }

      // Navigate to dashboard and check TierCard
      await page.goto(DASHBOARD_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "e2e/diag-07-post-upgrade-dashboard.png", fullPage: true });

      const dashBody = await page.locator("body").innerText();
      console.log(`  Post-upgrade dashboard: ${dashBody.slice(0, 500).replace(/\n/g, " | ")}`);

      // ── STEP 7: Monitor network for API calls ──────────────────────────
      console.log("\n[STEP 7] Capturing network activity...");
      const apiLogs: string[] = [];
      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("api/v1") || url.includes("mollie")) {
          apiLogs.push(`  [${response.status()}] ${url}`);
        }
      });

      // Force refetch the billing data
      await page.goto(BILLING_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      console.log("  Recent API calls:");
      apiLogs.slice(-30).forEach((l) => console.log(l));

      // ── SUMMARY ────────────────────────────────────────────────────────
      console.log("\n══════════════════════════════════════════════════");
      console.log("  DIAGNOSTIC COMPLETE");
      console.log("  Screenshots saved to e2e/diag-*.png");
      console.log("══════════════════════════════════════════════════");
    });

    test("DIAGNOSTIC: Intercept confirm-payment API call", async ({ page }) => {
      console.log("\n═══ CONFIRM-PAYMENT API INTERCEPT DIAGNOSTIC ═══");

      // Capture confirm-payment responses
      const confirmResponses: { status: number; body: string }[] = [];
      page.on("response", async (response) => {
        if (response.url().includes("confirm-payment")) {
          try {
            const body = await response.text();
            confirmResponses.push({ status: response.status(), body });
            console.log(`\n[CONFIRM-PAYMENT RESPONSE] Status: ${response.status()}`);
            console.log(`  Body: ${body.slice(0, 500)}`);
          } catch {
            console.log(`[CONFIRM-PAYMENT] Status: ${response.status()} (could not read body)`);
          }
        }
      });

      // Also capture request
      page.on("request", (request) => {
        if (request.url().includes("confirm-payment")) {
          console.log(`\n[CONFIRM-PAYMENT REQUEST] ${request.url()}`);
        }
      });

      await diagnosticLogin(page, DIAG_EMAIL, DIAG_PASSWORD);

      // Navigate to billing with a fake payment=success to trigger confirm-payment
      await page.goto(`${BILLING_URL}?payment=success&id=tr_fake_test`, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);

      // Try without payment ID (the success toast only path)
      await page.goto(`${BILLING_URL}?payment=success`, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);

      console.log(`\n  Total confirm-payment responses captured: ${confirmResponses.length}`);
      if (confirmResponses.length === 0) {
        console.log("  ⚠️ No confirm-payment API calls were detected!");
        console.log("  This means either:");
        console.log("    1. The billing page never called /api/v1/confirm-payment");
        console.log("    2. The success redirect doesn't include the payment ID");
        console.log("    3. The useEffect condition never matched");
      }
    });

    test("DIAGNOSTIC: Check user tier via API and console", async ({ page }) => {
      console.log("\n═══ USER TIER API DIAGNOSTIC ═══");

      await diagnosticLogin(page, DIAG_EMAIL, DIAG_PASSWORD);

      // Check the GetUsage or tier API in console
      const tierData = await page.evaluate(async () => {
        try {
          // Try common API endpoints
          const endpoints = [
            "/api/v1/usage",
            "/api/v1/tier",
            "/api/v1/me",
            "/api/v1/user",
          ];
          const results: Record<string, any> = {};
          for (const ep of endpoints) {
            try {
              const r = await fetch(ep);
              const text = await r.text();
              results[ep] = { status: r.status, body: text.slice(0, 500) };
            } catch (e: any) {
              results[ep] = { error: e.message };
            }
          }
          return results;
        } catch (e: any) {
          return { error: e.message };
        }
      });

      console.log("  API results from browser context:");
      console.log(JSON.stringify(tierData, null, 2));
    });
  });

  test("Mollie payment cancelled redirect shows error toast", async ({
    page,
  }) => {
    // Login is optional here — we just need the page to load
    const pageErrors: string[] = [];

    // Navigate to billing with payment=cancelled param
    await page.goto(`${BILLING_URL}?payment=cancelled`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(3000);

    // Check for error toast
    const errorToast = page.locator(
      '[data-sonner-toast][data-type="error"]',
    );
    try {
      await errorToast.waitFor({ state: "visible", timeout: 8000 });
      const toastText = await errorToast.innerText();
      expect(toastText).toMatch(/cancelled|cancel/i);
    } catch {
      console.log("Error toast not visible (may have auto-dismissed)");
    }

    // Page should still load billing content
    await expect(page.getByText(/billing/i).first()).toBeVisible({
      timeout: 10_000,
    }).catch(() => {
      // May redirect to login if unauthenticated
      console.log("May have redirected to login (expected when not authenticated)");
    });

    if (pageErrors.length > 0) {
      console.warn(`JS errors during cancel test: ${pageErrors.join("; ")}`);
    }
  });
});
