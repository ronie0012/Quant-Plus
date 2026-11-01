import { expect, test, type Page } from "@playwright/test";
import { marketFixture } from "./market-fixture";

const at = "2026-10-20T05:00:00.000Z";
const boardUrl = "**/api/agent/terminal/structure-board?*";
const structureUrl = "**/api/agent/terminal/structure/RELIANCE?*";

function structure(symbol = "RELIANCE", label = "choppy") {
  const unavailable = label === "unavailable";
  return {
    symbol,
    source: "fyers",
    as_of: unavailable ? null : at,
    data_cutoff: unavailable ? null : at,
    methodology_version: "quantplus.market_structure.v1",
    quality: unavailable ? "UNAVAILABLE" : "GOOD",
    quality_reasons: [],
    classification: { label, reason: "Fixture completed candles", evidence: [] },
    order_blocks: [],
    price_liquidity_proxies: [],
    liquidity_sweeps: [],
    depth_imbalance: null,
    volume: null,
    diagnostics: {
      input_candles: unavailable ? 0 : 20,
      valid_candles: unavailable ? 0 : 20,
      invalid_candles: 0,
      incomplete_candles_excluded: 0,
      future_candles_excluded: 0,
      duplicate_timestamps: 0,
      gap_count: 0,
      missing_volume_candles: 0,
      expected_interval_seconds: 86400,
    },
    live_price: unavailable ? null : 100,
    quote: null,
    history: { source: "fyers", as_of: unavailable ? null : at, interval: "1d", delayed: false },
    rank: { score: unavailable ? null : 0, label, components: {} },
  };
}

function board(rows = [structure()]) {
  return {
    rows,
    universe: "NIFTY_50",
    requested: rows.length,
    observed: rows.filter((row) => row.quality !== "UNAVAILABLE").length,
    source: "fixture",
    market_session: "open",
    updated_at: at,
  };
}

const sector = (available = true) => ({
  score: 0,
  available,
  label: "BEARISH",
  trend: "FALLING",
  data_quality: available ? "GOOD" : "DEGRADED",
  confidence: available ? 1 : 0,
  as_of: available ? at : null,
  updated_at: at,
});
const marketData = {
  score: 0,
  label: "BEARISH",
  data_quality: "GOOD",
  market_session: "open",
  updated_at: at,
  components: { market_breadth: { available: true, advancing: 0, coverage: 1 } },
};
const sectorData = { sectors: { IT: sector() }, data_quality: "GOOD", updated_at: at };

async function xray(page: Page) {
  await page.goto("/app/markets");
  await page.getByRole("button", { name: "Market X-Ray", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Market X-Ray", exact: true })).toBeVisible();
}

function metric(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("..").locator("dd");
}

test("Discover structure views remain reachable when the index feed is unavailable", async ({
  page,
}) => {
  await marketFixture(page);
  await page.route("**/api/agent/market/overview**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Index feed unavailable" } }),
  );
  await page.goto("/app/markets");
  await expect(page.getByRole("button", { name: "Liquidity Board", exact: true })).toBeVisible();
  // The existing index query exhausts its bounded retry backoff before erroring.
  await expect(page.getByText("No index feed", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Liquidity Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Liquidity board", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Market X-Ray", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Market X-Ray", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stocks", exact: true }).click();
  await expect(page.getByText("No index feed", { exact: true })).toBeVisible();
});

test("structure filters: Unavailable overrides hidden rows and exposes pressed state", async ({
  page,
}) => {
  await marketFixture(page);
  await page.route(boardUrl, (route) =>
    route.fulfill({
      json: board([structure("RELIANCE", "bullish"), structure("TCS", "unavailable")]),
    }),
  );
  await page.goto("/app/markets");
  await page.getByRole("button", { name: "Liquidity Board", exact: true }).click();
  const unavailable = page.getByRole("button", { name: "Unavailable 1", exact: true });
  const bullish = page.getByRole("button", { name: "Bullish 1", exact: true });
  const tcs = page.getByRole("row").filter({ hasText: "TCS" });
  await expect(unavailable).toHaveAttribute("aria-pressed", "false");
  await expect(tcs).toHaveCount(0);
  await unavailable.click();
  await expect(unavailable).toHaveAttribute("aria-pressed", "true");
  await expect(tcs).toBeVisible();
  await expect(page.getByRole("button", { name: "Show unavailable", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await bullish.click();
  await expect(bullish).toHaveAttribute("aria-pressed", "true");
  await expect(unavailable).toHaveAttribute("aria-pressed", "false");
  await expect(tcs).toHaveCount(0);
  await bullish.click();
  await page.getByRole("button", { name: "Show unavailable", exact: true }).click();
  await expect(tcs).toBeVisible();
  await page.getByRole("button", { name: "Hide unavailable", exact: true }).click();
  await expect(tcs).toHaveCount(0);
});

for (const field of ["rank", "liquidity_sweeps"] as const) {
  test(`malformed board: missing ${field} renders an honest error, not a crash or zero`, async ({
    page,
  }) => {
    await marketFixture(page);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const malformed = { ...structure(), [field]: undefined };
    await page.route(boardUrl, (route) =>
      route.fulfill({ json: { ...board(), rows: [malformed] } }),
    );
    await page.goto("/app/markets");
    await page.getByRole("button", { name: "Liquidity Board", exact: true }).click();
    await expect(page.getByText("Liquidity board unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`malformed: rows.0.${field}`))).toBeVisible();
    await page.getByRole("button", { name: "Market X-Ray", exact: true }).click();
    await expect(metric(page, "Bullish structures")).toContainText("—");
    await expect(metric(page, "Bearish structures")).toContainText("Unavailable · load failed");
    expect(pageErrors).toEqual([]);
  });
}

test("X-Ray: loading then unavailable observations never become directional zeroes", async ({
  page,
}) => {
  await marketFixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(boardUrl, async (route) => {
    await pending;
    await route.fulfill({ json: board([structure("RELIANCE", "unavailable")]) });
  });
  await page.route("**/api/market/sentiment", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        ...marketData,
        score: null,
        label: "UNAVAILABLE",
        components: { market_breadth: { available: false, advancing: 0, coverage: 0 } },
      },
    });
  });
  await page.route("**/api/market/sectors", async (route) => {
    await pending;
    await route.fulfill({ json: { ...sectorData, sectors: { IT: sector(false) } } });
  });
  try {
    await xray(page);
    await expect(metric(page, "Bullish structures")).toHaveText(/—Loading structure/);
    await expect(metric(page, "Market state")).toHaveText(/—Loading market/);
    await expect(
      page.getByRole("status", { name: "" }).filter({ hasText: "Loading sector observations" }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(metric(page, "Bullish structures")).toHaveText(
    /—Unavailable · no classified observations/,
  );
  await expect(metric(page, "Bearish structures")).toHaveText(/—Unavailable/);
  await expect(metric(page, "Market state")).toHaveText(/—Unavailable/);
  await expect(metric(page, "Advancing")).toHaveText(/—Breadth unavailable/);
  const it = page.getByText("IT", { exact: true }).locator("..");
  await expect(it).toContainText("—");
  await expect(it).toContainText("Unavailable");
  await expect(it.locator("span[style]")).toHaveCount(0);
});

test("X-Ray: initial transport failure is unavailable and retry restores real zeroes", async ({
  page,
}) => {
  await marketFixture(page);
  let failed = true;
  for (const [url, json] of [
    [boardUrl, board()],
    ["**/api/market/sentiment", marketData],
    ["**/api/market/sectors", sectorData],
  ] as const) {
    await page.route(url, (route) =>
      route.fulfill(failed ? { status: 503, json: { detail: "Fixture offline" } } : { json }),
    );
  }
  await xray(page);
  await expect(metric(page, "Bullish structures")).toHaveText(/—Unavailable · load failed/);
  await expect(metric(page, "Market state")).toHaveText(/—Unavailable · load failed/);
  await expect(page.getByText("Sector view unavailable", { exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry structure", exact: true }).click();
  await page.getByRole("button", { name: "Retry market context", exact: true }).click();
  await page.getByRole("button", { name: "Retry sectors", exact: true }).click();
  await expect(metric(page, "Bullish structures")).toHaveText(/^0/);
  await expect(metric(page, "Bearish structures")).toHaveText(/^0/);
  await expect(metric(page, "Market state")).toContainText("0/100 descriptive index");
  await expect(metric(page, "Advancing")).toHaveText(/^0.*100% coverage/);
  await expect(page.getByText("IT", { exact: true }).locator("..")).toContainText("0");
});

test("X-Ray: failed background refresh marks cached structure, market and sectors stale", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(at) });
  await marketFixture(page);
  let failed = false;
  for (const [url, json] of [
    [boardUrl, board([structure("RELIANCE", "bullish")])],
    ["**/api/market/sentiment", marketData],
    ["**/api/market/sectors", sectorData],
  ] as const) {
    await page.route(url, (route) =>
      route.fulfill(
        failed ? { status: 503, json: { detail: "Fixture refresh failed" } } : { json },
      ),
    );
  }
  await xray(page);
  await expect(metric(page, "Bullish structures")).toHaveText(/^1/);
  await expect(metric(page, "Market state")).toContainText("0/100 descriptive index");
  await expect(page.getByText("IT", { exact: true })).toBeVisible();
  failed = true;
  // marketFixture freezes Date on an NSE holiday: sentiment polls every five
  // minutes, independently of the structure board's one-minute cadence.
  await page.clock.fastForward(301_000);
  await expect(metric(page, "Bullish structures")).toHaveText(/^1Stale · refresh failed/);
  await expect(metric(page, "Market state")).toHaveText(/^BEARISHStale · refresh failed/);
  await expect(metric(page, "Advancing")).toHaveText(/^0Stale · refresh failed/);
  await expect(page.getByText("IT", { exact: true }).locator("..")).toContainText("Stale");
  await expect(
    page.getByText(/Structure refresh failed; cached observations are stale/),
  ).toBeVisible();
});

test("board: missing provider timestamp is disclosed, not replaced with now", async ({ page }) => {
  await marketFixture(page);
  await page.route(boardUrl, (route) =>
    route.fulfill({ json: { ...board(), updated_at: undefined } }),
  );
  await page.goto("/app/markets");
  await page.getByRole("button", { name: "Liquidity Board", exact: true }).click();
  await expect(
    page.getByText("Provider timestamp unavailable · NIFTY_50", { exact: true }),
  ).toBeVisible();
});

test("stock structure: malformed responses and failed refresh hide opt-in overlays", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(at) });
  await marketFixture(page);
  let malformed = true;
  await page.route(structureUrl, (route) =>
    route.fulfill({
      json: {
        ...structure("RELIANCE", "bullish"),
        liquidity_sweeps: malformed ? [{ direction: "sideways", swept_at: "invalid" }] : [],
      },
    }),
  );
  await page.goto("/app/stocks/RELIANCE");
  await expect(page.getByRole("img", { name: /OHLC chart/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByText(/Structure unavailable; overlays hidden/)).toBeVisible();
  await expect(page.getByText(/bullish structure ·/)).toHaveCount(0);
  malformed = false;
  await page.clock.fastForward(61_000);
  await expect(page.getByText(/bullish structure ·/)).toBeVisible();
  malformed = true;
  await page.clock.fastForward(61_000);
  await expect(page.getByText(/Structure refresh failed; stale overlays hidden/)).toBeVisible();
  await expect(page.getByText(/bullish structure ·/)).toHaveCount(0);
});
