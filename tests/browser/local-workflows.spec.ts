import { test, expect } from "@playwright/test";

test("public product overview switches panels without fabricated prices", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const overview = page.getByRole("group", { name: "Workspace overview" }).first();
  await overview.getByRole("button", { name: "Markets", exact: true }).click();
  await expect(overview.getByRole("button", { name: "Markets", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByText("Market observations require a connected provider.", { exact: false }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
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
