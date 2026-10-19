import { test, expect } from "@playwright/test";

test("public product overview switches tabs without fabricated prices", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/platform");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const overview = page.getByRole("tablist", { name: "Workspace overview" }).first();
  await expect(page.locator('[data-dashboard-hydrated="true"]').first()).toBeVisible();
  const marketsTab = overview.getByRole("tab", { name: "Markets", exact: true });
  await marketsTab.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await marketsTab.click();
  await expect(overview.getByRole("tab", { name: "Markets", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("tabpanel").getByText("Provider required", { exact: false }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("landing page stays usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => undefined);

  await expect(
    page.getByRole("heading", { name: "Understand the market. Practise your decisions." }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await expect(
    page
      .getByRole("navigation", { name: "Footer workspace" })
      .getByRole("link", { name: "Start learning", exact: true }),
  ).toHaveAttribute("href", "/app/learn");

  const menuToggle = page.getByRole("button", { name: "Open menu" });
  await menuToggle.focus();
  await menuToggle.press("Enter");
  const menu = page.getByRole("dialog", { name: "Explore Quant Plus" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("link", { name: "Open paper terminal", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menuToggle).toBeFocused();
});

for (const [route, text] of [
  ["options", "Options unavailable"],
  ["replay", "Replay"],
  ["orders", "Orders"],
  ["screener", "Find the setups that fit."],
  ["settings", "Settings"],
] as const) {
  test(`local ${route} renders with unavailable providers`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/app/${route}`);
    await expect(page.getByRole("heading", { name: text, exact: true }).first()).toBeVisible();
    if (route === "screener") {
      await page.getByRole("slider", { name: /Max volatility/ }).press("Home");
      await expect(page.getByText("No matches", { exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("local funding replay persists once and foreign origins are denied", async ({ request }) => {
  const values = { p_amount: 1234, p_kind: "DEPOSIT", p_intent_id: "browser-funding-intent" };
  const headers = { Authorization: "Bearer quant-plus-local-workspace" };
  const deposits = async () =>
    (
      (await (
        await request.post("/api/local", {
          headers,
          data: { table: "wallet_transactions", operation: "select" },
        })
      ).json()) as { kind: string; amount: number }[]
    ).filter((row) => row.kind === "DEPOSIT" && row.amount === 1234).length;
  const before = await deposits();
  const first = await request.post("/api/local", { headers, data: { rpc: "fund_wallet", values } });
  expect(first.status()).toBe(200);
  const replay = await request.post("/api/local", {
    headers,
    data: { rpc: "fund_wallet", values },
  });
  expect(await replay.json()).toEqual(await first.json());
  // The same intent settles at most once, however many times it is sent.
  expect(await deposits()).toBe(Math.max(before, 1));
  const foreign = await request.post("/api/local", {
    headers: { ...headers, Origin: "https://foreign.example" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
});
