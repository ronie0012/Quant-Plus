import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Every app section plus the dashboard, a stock page and the public pages.
const SECTIONS = [
  "markets",
  "portfolio",
  "watchlist",
  "orders",
  "wallet",
  "risk",
  "alerts",
  "journal",
  "replay",
  "screener",
  "options",
  "basket",
  "xray",
  "research",
  "decisions",
  "history",
  "quant-ai",
  "committee",
  "agent-activity",
  "settings",
  "data-sources",
  "help",
  "more",
  "review",
  "ripple",
];
const ROUTES = [
  "/",
  "/markets",
  "/platform",
  "/research",
  "/ai",
  "/app/dashboard",
  "/app/stocks/RELIANCE",
  ...SECTIONS.map((s) => `/app/${s}`),
];

async function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

for (const route of ROUTES) {
  test(`${route} renders without errors and without serious accessibility violations`, async ({
    page,
  }) => {
    const errors = await watchErrors(page);
    await page.goto(route);
    await expect(page.locator("main, #terminal-content, body").first()).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      // Colour contrast of the decorative terminal palette is reviewed separately.
      .disableRules(["color-contrast"])
      .analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.length} node(s) e.g. ${v.nodes[0]?.target.join(" ")}`);
    expect(serious, serious.join("\n")).toEqual([]);
    expect(errors).toEqual([]);
  });
}

const headers = { Authorization: "Bearer quant-plus-local-workspace" };

// Workflow tests use a funded account; an unfunded account correctly shows the onboarding gate.
test.beforeEach(async ({ request }, testInfo) => {
  if (!testInfo.title.includes("renders without errors"))
    await request.post("/api/local", {
      headers,
      data: {
        rpc: "fund_wallet",
        values: { p_amount: 100000, p_intent_id: "browser-onboarding-fund" },
      },
    });
});

test("wallet funding, practice funds and the ledger page through the UI", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/app/wallet");
  await page.getByRole("button", { name: "Add ₹1,00,000", exact: true }).click();
  await expect(page.getByText(/added to your wallet/)).toBeVisible();
  await page.getByRole("button", { name: "Add ₹1,00,000 practice funds" }).click();
  await expect(page.getByText("Added ₹1,00,000 of practice funds")).toBeVisible();
  await expect(page.getByRole("button", { name: "Older" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("alerts are created, listed and deleted", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/app/alerts");
  await page.getByRole("button", { name: "Create alert" }).click();
  await expect(page.getByText("Alert created")).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete RELIANCE alert/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /Delete RELIANCE alert/ })
    .first()
    .click();
  expect(errors).toEqual([]);
});

test("journal entries save with structured fields", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/app/journal");
  await page
    .getByPlaceholder("What must be true for this trade to work?")
    .fill("Browser test thesis");
  await page.getByPlaceholder("What could make the thesis wrong?").fill("Risk one\nRisk two");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Journal entry saved")).toBeVisible();
  await expect(page.getByText("Browser test thesis").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("settings persist through the server and survive reload", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/app/settings");
  await page.getByLabel("Your name", { exact: false }).fill("Browser Tester");
  await page.getByRole("button", { name: "LIMIT", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "LIMIT", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Your name", { exact: false })).toHaveValue("Browser Tester");
  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /Browser/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("unavailable providers produce honest states, not invented prices", async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto("/app/stocks/RELIANCE");
  // With the market-data service unreachable no price can be shown or traded.
  await expect(page.getByRole("button", { name: /Paper trade · buy/ })).toBeDisabled();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Connecting|unavailable|Waiting/i })
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("primary navigation exposes the five-area information architecture", async ({ page }) => {
  await page.goto("/app/dashboard");
  const nav = page.getByRole("navigation", { name: "Primary areas" });
  const primaryLinks = nav.locator('ul[aria-label="Primary areas"] a');
  await expect(primaryLinks).toHaveCount(5);
  await expect(primaryLinks.allTextContents()).resolves.toEqual([
    "Home",
    "Discover",
    "Portfolio",
    "Review",
    "More",
  ]);
  await expect(nav.getByText("Options", { exact: true })).toHaveCount(0);
  await page.goto("/app/review");
  await expect(
    page.getByRole("heading", { name: "Turn outcomes into better decisions." }),
  ).toBeVisible();
  await page.goto("/app/more");
  await expect(page.getByRole("heading", { name: "Advanced workspace tools" })).toBeVisible();
});

test("paper API refuses execution without an eligible quote and keeps the book reconciled", async ({
  request,
}) => {
  const order = await request.post("/api/paper/orders", {
    headers,
    data: {
      symbol: "RELIANCE",
      side: "BUY",
      order_type: "MARKET",
      quantity: 1,
      intent_id: "browser-order-1",
    },
  });
  expect([409, 503]).toContain(order.status());
  const worker = await request.post("/api/paper/worker", { headers, data: {} });
  expect(worker.status()).toBe(200);
  expect((await worker.json()).book.reconciliation).toEqual([]);
});
