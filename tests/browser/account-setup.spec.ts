import { test, expect } from "@playwright/test";

test("account verification setup preserves the active local workspace", async ({ page }) => {
  let registration: Record<string, string> | null = null;
  await page.route("**/api/auth/sign-up", async (route) => {
    registration = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({ json: { requireEmailVerification: true, verifyEmailMethod: "code" } });
  });
  let attempts = 0;
  let resends = 0;
  await page.route("**/api/auth/verify-email", async (route) => {
    attempts++;
    expect(route.request().postDataJSON()).toMatchObject({
      email: "fixture@example.com",
      otp: "000123",
    });
    await route.fulfill(
      attempts === 1
        ? { status: 400, json: { error: "Code expired" } }
        : { json: { verified: true } },
    );
  });
  await page.route("**/api/auth/resend-verification", async (route) => {
    resends++;
    await route.fulfill({ json: { ok: true } });
  });
  const funded = await page.request.post("/api/local", {
    headers: { Authorization: "Bearer quant-plus-local-workspace" },
    data: {
      rpc: "fund_wallet",
      values: { p_amount: 100000, p_intent_id: `account-setup-${crypto.randomUUID()}` },
    },
  });
  expect(funded.ok()).toBeTruthy();
  await page.goto("/app/settings");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Register account", exact: true }) });
  await form.getByLabel("Name", { exact: true }).fill("Setup Test");
  await form.getByLabel("Account email").fill("fixture@example.com");
  await form.getByLabel("Password").fill("Test-fixture-only-123");
  await form.getByRole("button", { name: "Register account", exact: true }).click();
  expect(registration).toMatchObject({ name: "Setup Test", email: "fixture@example.com" });
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Verification email")).toHaveValue("fixture@example.com");
  await page.getByLabel("Verification code").fill("000123");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Code expired");
  await page.getByRole("button", { name: "Resend verification", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "new verification email" }),
  ).toBeVisible();
  expect(resends).toBe(1);
  await page.getByLabel("Verification code").fill("000123");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Email verified" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Sign in to connect", exact: true })).toBeVisible();
  await page.route("**/api/auth/book-check", (route) =>
    route.fulfill({
      json: { verified: true, cash_paise: 99291050, holdings: 1, orders: 1, fills: 1 },
    }),
  );
  await page.getByRole("button", { name: "Check imported portfolio", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Imported portfolio verified through your account" }),
  ).toContainText("9,92,910.50 cash, 1 holdings, 1 orders, 1 fills");
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/app\/dashboard/);
});
