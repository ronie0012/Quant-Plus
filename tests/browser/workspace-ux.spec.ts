import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { WORKSPACE_ROUTES } from "../../src/components/app/workspace-routes";

type Row = Record<string, unknown>;

// All API traffic stays in this browser fixture; no real workspace, provider,
// model, funding or paper-order request is forwarded to the server.
async function workspaceFixture(page: Page) {
  const errors: string[] = [];
  const writes: string[] = [];
  const tables: Record<string, Row[]> = {
    accounts: [
      {
        id: "ux-account",
        onboarded: true,
        currency: "INR",
        wallet_balance: 100000,
        total_funds: 100000,
        available_cash: 100000,
        reserved_cash: 0,
        settled_cash: 100000,
        unsettled_cash: 0,
        total_deposits: 100000,
        total_withdrawals: 0,
        initial_capital: 100000,
        funds_used: 0,
        profit: 0,
        profit_pct: 0,
      },
    ],
    trading_preferences: [
      {
        id: "ux-preferences",
        display_name: "Researcher",
        density: "COMFORTABLE",
        calm_mode: true,
        learning: { onboarding: "DONE" },
      },
    ],
    watchlist_items: [],
    research_items: [],
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem("quant-plus:welcome-dismissed", "true"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4179") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname !== "/api/local") {
      // This status endpoint uses POST but only reads worker state + book_report.
      if (route.request().method() !== "GET" && url.pathname !== "/api/paper/worker")
        writes.push(url.pathname);
      return route.fulfill({ status: 503, json: { error: "Unavailable in UX fixture" } });
    }
    const body = route.request().postDataJSON();
    if (body.rpc) {
      if (body.rpc === "conversation_list") return route.fulfill({ json: [] });
      if (/fund|order|trade|settle/.test(body.rpc)) writes.push(body.rpc);
      return route.fulfill({
        json:
          body.rpc === "risk_status"
            ? {
                blocked: false,
                stale_marks: [],
                available_cash: 100000,
                daily_loss: 0,
                daily_loss_limit: 50000,
                day_loss: 0,
                day_pnl: 0,
                anchor_equity: 100000,
                anchor_source: "SESSION_OPEN",
                marked_equity: 100000,
                cash_flows: 0,
                session_date: "2026-10-19",
                blocked_reason: null,
                valuation_policy: "Fixture account with no holdings",
              }
            : { events: [], latest_seq: 0 },
      });
    }
    const rows = tables[body.table] ?? [];
    if (body.operation === "insert") {
      const row = { ...body.values, id: `ux-${rows.length}`, created_at: new Date().toISOString() };
      rows.push(row);
      tables[body.table] = rows;
      return route.fulfill({ json: row });
    }
    const filtered = rows.filter((row) =>
      (body.filters ?? []).every(([key, value]: [string, unknown]) => row[key] === value),
    );
    return route.fulfill({
      json: body.singular
        ? (filtered[0] ?? null)
        : body.count
          ? { rows: filtered, total: filtered.length, offset: 0, limit: 50 }
          : filtered,
    });
  });
  return { errors, writes, tables };
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.content, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

for (const width of [1440, 375]) {
  for (const route of [...WORKSPACE_ROUTES, { section: "stocks/RELIANCE" }]) {
    test(`${width}px /app/${route.section}: hierarchy, layout and accessible controls`, async ({
      page,
    }) => {
      const fixture = await workspaceFixture(page);
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      await page.goto(`/app/${route.section}`);
      await expect
        .poll(
          async () => ({
            headings: await page.locator("main h1:visible").count(),
            errors: fixture.errors,
          }),
          { timeout: 15000 },
        )
        .toEqual({ headings: 1, errors: [] });
      await expectNoOverflow(page);
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = audit.violations
        .filter((issue) => issue.impact === "serious" || issue.impact === "critical")
        .map((issue) => ({ id: issue.id, targets: issue.nodes.map((node) => node.target) }));
      expect(serious).toEqual([]);
      expect(fixture.errors).toEqual([]);
      expect(fixture.writes.filter((path) => /fund|paper|orders|chat/.test(path))).toEqual([]);
    });
  }
}

test("mobile workspace navigation traps focus, restores it on Escape and resets after resizing", async ({
  page,
}) => {
  const fixture = await workspaceFixture(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/dashboard");
  const trigger = page.getByRole("button", { name: "Open menu", exact: true, includeHidden: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.locator('ul[aria-label="Primary areas"] a')).toHaveCount(5);
  const first = dialog.getByRole("link", { name: "Quant Plus home" });
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Leave local terminal" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Learn & practise" }).click();
  await expect(page).toHaveURL(/\/app\/learn$/);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("navigation", { name: "Learn tools" })).toBeVisible();
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(dialog).not.toBeVisible();
  await expectNoOverflow(page);
  expect(fixture.errors).toEqual([]);
});

test("Review separates workspaces while keeping an unfinished decision draft", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/journal");
  const thesis = page.getByPlaceholder("What must be true for this trade to work?");
  await thesis.fill("A draft I am still evaluating");
  await page.getByRole("button", { name: "Review overview", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Turn outcomes into better decisions.",
  );
  await expect(thesis).not.toBeVisible();
  await page.getByRole("button", { name: "Execution review", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Execution review");
  await page.getByRole("button", { name: "Decision plans", exact: true }).click();
  await expect(thesis).toHaveValue("A draft I am still evaluating");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Decision journal");
  await expectNoOverflow(page);
  expect(fixture.errors).toEqual([]);
});

test("the tool catalog searches by task and recovers from no matching results", async ({
  page,
}) => {
  await workspaceFixture(page);
  await page.goto("/app/more");
  const search = page.getByLabel("Find workspace tools");
  await search.fill("tolerance");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Investor DNA Reflect/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Basket Prepare/ })).toHaveCount(0);
  await search.fill("no-such-workspace-tool");
  await expect(page.getByText("No matching tools", { exact: true })).toBeVisible();
  await search.fill("");
  await main.getByRole("link", { name: /Investor DNA Reflect/ }).click();
  await expect(page).toHaveURL(/\/app\/investor-dna$/);
  await expect(page.getByRole("navigation", { name: "Learn tools" })).toBeVisible();
});

test("an existing local session resumes the intended workspace but never an external destination", async ({
  page,
}) => {
  const fixture = await workspaceFixture(page);
  await page.goto(`/auth?redirect=${encodeURIComponent("/app/journal?symbol=HDFCBANK")}`);
  await expect(page).toHaveURL(/\/app\/journal\?symbol=HDFCBANK$/);
  await page.goto(`/auth?redirect=${encodeURIComponent("https://example.com/app/journal")}`);
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  expect(fixture.errors).toEqual([]);
});

test("watchlist requires an explicit company, retains a failed selection and reads it back after reload", async ({
  page,
}) => {
  const fixture = await workspaceFixture(page);
  let failNext = true;
  await page.route("**/api/local", async (route) => {
    const call = route.request().postDataJSON();
    if (failNext && call.table === "watchlist_items" && call.operation === "insert") {
      failNext = false;
      return route.fulfill({ status: 503, body: "Fixture save failed" });
    }
    return route.fallback();
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/watchlist");
  await page.getByRole("button", { name: "Add company", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to your watchlist" });
  await expect(
    dialog.getByRole("button", { name: "Choose a company", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Find a company to watch").fill("HDFCBANK");
  await dialog.getByRole("button", { name: /HDFCBANK HDFC Bank/ }).click();
  const save = dialog.getByRole("button", { name: "Add HDFCBANK", exact: true });
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("Your choice is preserved");
  await expect(dialog.getByRole("button", { name: /HDFCBANK HDFC Bank/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await save.click();
  await expect(dialog).not.toBeVisible();
  expect(fixture.tables["watchlist_items"]).toHaveLength(1);
  expect(fixture.tables["watchlist_items"]?.[0]?.["symbol"]).toBe("HDFCBANK");
  await page.reload();
  await expect(
    page.getByRole("main").getByRole("button", { name: /HDFCBANK HDFC Bank/ }),
  ).toBeVisible();
  await expectNoOverflow(page);
  expect(fixture.errors).toEqual([]);
  expect(fixture.writes).toEqual([]);
});

test("basket starts empty and requires deliberate selection and an estimate before submission", async ({
  page,
}) => {
  const fixture = await workspaceFixture(page);
  const checks: Row[] = [];
  await page.route("**/api/paper/baskets/preflight", async (route) => {
    const body = route.request().postDataJSON();
    checks.push(body);
    return route.fulfill({
      json: {
        complete: true,
        available_cash_before: 100000,
        available_cash_after: 90000,
        quote_snapshot_note: "Fixture estimate only",
        legs: body.legs.map((leg: Row) => ({
          intent_id: leg["intent_id"],
          status: "WOULD_FILL",
          error: null,
          estimate: {
            price: 100,
            filled_quantity: leg["quantity"],
            charges: 1,
            cash_change: -1000,
          },
        })),
      },
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/basket");
  const check = page.getByRole("button", { name: "Check basket", exact: true });
  const submit = page.getByRole("button", { name: "Execute basket", exact: true });
  await expect(page.getByRole("heading", { name: "Empty basket" })).toBeVisible();
  await expect(check).toBeDisabled();
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Add stock" }).click();
  await expect(page.getByLabel("Leg 1 stock")).toHaveValue("");
  await expect(check).toBeDisabled();
  await page.getByLabel("Leg 1 stock").selectOption("HDFCBANK");
  const quantity = page.getByLabel("Leg 1 quantity");
  await quantity.fill("12");
  await expect(quantity).toBeFocused();
  await quantity.press("3");
  await expect(quantity).toHaveValue("123");
  await expect(submit).toBeDisabled();
  await check.click();
  await expect(submit).toBeEnabled();
  expect(checks).toHaveLength(1);
  expect(checks[0]?.["legs"]).toMatchObject([{ symbol: "HDFCBANK", quantity: 123 }]);
  await quantity.fill("2");
  await expect(submit).toBeDisabled();
  await expectNoOverflow(page);
  expect(fixture.writes).toEqual([]);
  expect(fixture.errors).toEqual([]);
});
