import { test as base, expect, type Page } from "@playwright/test";

type Row = Record<string, unknown>;
type WorkspaceFixture = {
  newsStatus: "available" | "unavailable";
  staleNews: boolean;
  emptyNews: boolean;
  failLock: boolean;
  failWatchlist: boolean;
  failedResearch: boolean;
  historyRequests: string[];
  streamSymbols: string[];
  modelRequests: string[];
  orderWrites: string[];
  watchlist: Row[];
  locked: Row[];
};

const stamp = () => new Date().toISOString();
const headline = {
  id: "crude-event",
  symbol: "MARKET",
  company: "Market",
  title: "Crude oil prices rise sharply",
  source: "Fixture newswire",
  url: "https://example.com/crude-event",
  snippet: "",
  provider: "fixture",
  relevance_score: 90,
  sentiment: "positive",
  category: "commodity",
};

// Every API request is fulfilled in the browser. No provider/model call or real
// workspace mutation is needed, including when stock hooks auto-start research.
const test = base.extend<{ workspace: WorkspaceFixture }>({
  workspace: [
    async ({ page }, use) => {
      const workspace: WorkspaceFixture = {
        newsStatus: "available",
        staleNews: false,
        emptyNews: false,
        failLock: false,
        failWatchlist: false,
        failedResearch: false,
        historyRequests: [],
        streamSymbols: [],
        modelRequests: [],
        orderWrites: [],
        watchlist: [],
        locked: [],
      };
      await page.addInitScript(() =>
        sessionStorage.setItem("quant-plus:welcome-dismissed", "true"),
      );
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
        if (path === "/api/local") {
          const body = request.postDataJSON();
          if (body.rpc === "risk_status")
            return json({ blocked: false, stale_marks: [], available_cash: 100000 });
          if (body.rpc) return json({ events: [], latest_seq: 0 });
          if (body.table === "accounts")
            return json({
              currency: "INR",
              wallet_balance: 100000,
              total_funds: 100000,
              onboarded: true,
            });
          if (body.table === "trading_preferences" || body.table === "risk_limits")
            return json(null);
          const rows =
            body.table === "research_items"
              ? workspace.locked
              : body.table === "watchlist_items"
                ? workspace.watchlist
                : [];
          if (body.operation === "insert") {
            if (
              (body.table === "research_items" && workspace.failLock) ||
              (body.table === "watchlist_items" && workspace.failWatchlist)
            )
              return json({ error: "Fixture save failure" }, 503);
            const row = {
              ...body.values,
              id: `fixture-${rows.length}`,
              created_at: stamp(),
              updated_at: stamp(),
              version: 1,
              history: [],
            };
            rows.push(row);
            return json(row);
          }
          const filtered = rows.filter((row) =>
            (body.filters ?? []).every(([key, value]: [string, unknown]) => row[key] === value),
          );
          return json(
            body.singular
              ? (filtered[0] ?? null)
              : body.count
                ? { rows: filtered, total: filtered.length, limit: 100, offset: 0 }
                : filtered,
          );
        }
        if (path === "/api/market/news" || /^\/api\/stocks\/[^/]+\/news$/.test(path))
          return json({
            symbol: "MARKET",
            company: "Market",
            articles: workspace.emptyNews ? [] : [{ ...headline, published_at: stamp() }],
            provider_status: {
              provider: "fixture",
              status: workspace.newsStatus,
              queries_succeeded: 1,
              queries_total: 1,
            },
            data_quality: "PARTIAL",
            confidence: 0.5,
            updated_at: workspace.staleNews
              ? new Date(Date.now() - 21 * 60_000).toISOString()
              : stamp(),
            relevance_threshold: 55,
          });
        if (path === "/api/agent/market/stream") {
          const symbols = (url.searchParams.get("symbols") ?? "").split(",");
          workspace.streamSymbols.push(...symbols);
          return route.fulfill({
            contentType: "text/event-stream",
            body: symbols
              .map(
                (symbol) =>
                  `data: ${JSON.stringify({
                    symbol,
                    price: 1088,
                    change: 8,
                    change_pct: 0.74,
                    source: "fyers",
                    as_of: stamp(),
                    stale: false,
                    delayed: false,
                    market_session: "closed",
                    open: 1080,
                    low: 1075,
                    high: 1090,
                    volume: 1000000,
                    depth_as_of: stamp(),
                    depth: [{ bid: 1087, ask: 1089, bid_quantity: 500, ask_quantity: 400 }],
                  })}\n\n`,
              )
              .join(""),
          });
        }
        if (/\/history$/.test(path)) {
          workspace.historyRequests.push(`${path}${url.search}`);
          const day = 86400;
          const start = Math.floor(Date.now() / (day * 1000)) * day - 150 * day;
          const candles = Array.from({ length: 120 }, (_, i) => {
            const close = 1000 + i * 2 + Math.sin(i / 2) * 30;
            return {
              time: start + i * day,
              open: close - 5,
              high: close + 10,
              low: close - 10,
              close,
              volume: 1000000,
            };
          });
          return json({
            symbol: path.split("/").at(-2),
            source: "fixture-history",
            as_of: "2026-10-16T10:00:00Z",
            interval: "1d",
            delayed: true,
            candles,
          });
        }
        if (/\/prediction$/.test(path)) {
          const completed = {
            id: "fixture-research",
            instrument: path.split("/").at(-2),
            status: "done",
            as_of: stamp(),
            refresh_seconds: 900,
            analysis_interval: "1d",
            events: [],
            reports: {},
            decision: {
              action: "hold",
              rationale: "Fixture research: verify the counter-case before deciding.",
              authority: "RESEARCH_ONLY",
            },
            thesis: {
              direction: "flat",
              conviction: 0.5,
              key_evidence: [],
              key_risks: ["Demand may weaken."],
            },
            serving: {
              freshness: "stale",
              refresh_status: "paused",
              age_seconds: 7200,
              mode: "full_research",
            },
          };
          return json(
            workspace.failedResearch
              ? { ...completed, status: "failed_provider", previous_result: completed }
              : completed,
          );
        }
        if (path === "/api/chat") workspace.modelRequests.push(path);
        if (path === "/api/paper/orders" && request.method() !== "GET")
          workspace.orderWrites.push(path);
        if (/\/calendar$/.test(path))
          return json({ events: [], provider_status: { status: "available" } });
        // A hermetic unavailable response is intentional for supplementary APIs.
        return json({ detail: "Isolated UX fixture: supplementary data unavailable" }, 503);
      });
      await use(workspace);
      expect(workspace.orderWrites, "Research and navigation must never submit an order").toEqual(
        [],
      );
      expect(
        workspace.modelRequests,
        "Opening Ripple must not request a model explanation",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
test.use({ serviceWorkers: "block" });

const disclosure = (page: Page, name: string) =>
  page.locator("details").filter({ has: page.locator(":scope > summary", { hasText: name }) });
const explanation = (page: Page) =>
  page.getByLabel("Selected company explanation", { exact: true });
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

for (const width of [375, 1440]) {
  test(`${width}px: list-first selection leads to research, watchlist and symbol-specific planning`, async ({
    page,
    workspace,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/app/ripple");
    await expect(
      page.getByRole("heading", { name: "Affected companies", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const eventHeader = page
      .locator("header")
      .filter({ has: page.getByRole("heading", { name: "Choose an event", exact: true }) });
    expect((await eventHeader.boundingBox())!.height).toBeLessThan(200);
    const map = disclosure(page, "Explore the visual impact map");
    const validation = disclosure(page, "Validation & saved ripples");
    await expect(map).not.toHaveAttribute("open", "");
    await expect(validation).not.toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Lock for grading" })).not.toBeVisible();
    await page
      .getByRole("button", { name: "Explain ASIANPAINT, may fall, order 1", exact: true })
      .click();
    await expect(explanation(page).getByRole("heading", { name: /ASIANPAINT/ })).toBeVisible();
    await expect(
      explanation(page).getByRole("list", { name: "Impact reasoning chain" }),
    ).toContainText("crude");
    const research = explanation(page).getByRole("link", {
      name: "Research ASIANPAINT",
      exact: true,
    });
    await expect(research).toHaveAttribute("href", "/app/stocks/ASIANPAINT");
    await expect(
      explanation(page).getByRole("link", { name: "Create decision plan" }),
    ).toHaveAttribute("href", /journal\?symbol=ASIANPAINT/);
    await expect(explanation(page).getByRole("link", { name: /Read the source/ })).toHaveAttribute(
      "href",
      headline.url,
    );
    if (width === 375) await expect(explanation(page)).toBeFocused();
    else {
      const listBox = await page.getByRole("list", { name: "Affected companies" }).boundingBox();
      const detailBox = await explanation(page).boundingBox();
      expect(detailBox!.x).toBeGreaterThan(listBox!.x + listBox!.width);
    }
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("ripple-selected.png"), fullPage: true });

    workspace.failWatchlist = true;
    await explanation(page).getByRole("button", { name: "Add to watchlist" }).click();
    await expect(explanation(page).getByRole("alert")).toContainText("Could not save ASIANPAINT");
    workspace.failWatchlist = false;
    await explanation(page).getByRole("button", { name: "Add to watchlist" }).click();
    await expect(explanation(page).getByRole("button", { name: "In watchlist" })).toBeDisabled();
    expect(workspace.watchlist).toMatchObject([{ symbol: "ASIANPAINT" }]);
    await research.click();
    await expect(page.getByRole("heading", { name: "ASIANPAINT", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ASIANPAINT price action" })).toBeVisible();
    await expect.poll(() => workspace.streamSymbols.includes("ASIANPAINT")).toBe(true);
    await expect(page.getByText("₹1,088.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "In watchlist" })).toBeDisabled();
    const priceBox = await page.locator("#stock-price").boundingBox();
    const researchBox = await page.locator("#stock-research").boundingBox();
    const decisionBox = await page.locator("#stock-decision").boundingBox();
    expect(priceBox!.y).toBeLessThan(researchBox!.y);
    expect(researchBox!.y).toBeLessThan(decisionBox!.y);
    await page.screenshot({ path: testInfo.outputPath("stock-research.png"), fullPage: true });
    await page
      .getByRole("group", { name: "Chart range" })
      .getByRole("button", { name: "1W", exact: true })
      .click();
    await expect
      .poll(() =>
        workspace.historyRequests.some((path) => path.includes("ASIANPAINT/history?range=1W")),
      )
      .toBe(true);
    await page
      .getByRole("navigation", { name: "Stock workspace sections" })
      .getByRole("link", { name: "3. Decision plan" })
      .click();
    await expect(page.getByRole("heading", { name: "Decision canvas" })).toBeInViewport();
    await expect(
      page.locator("#stock-decision").getByRole("link", { name: "Create decision plan" }),
    ).toHaveAttribute("href", /journal\?symbol=ASIANPAINT/);
    for (const name of [
      "Market depth & session detail",
      "Key statistics & 52-week range",
      "Paper order ticket",
    ]) {
      const section = disclosure(page, name);
      await expect(section).not.toHaveAttribute("open", "");
      await section.locator(":scope > summary").click();
      await expect(section).toHaveAttribute("open", "");
      await noOverflow(page);
    }
    await expect(page.getByRole("heading", { name: "Market depth", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Key statistics", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Paper trade · buy/ })).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test("375px: news and scenarios stay distinct; graph and list selection agree without a pointer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/app/ripple");
  await page
    .getByRole("group", { name: "Event source" })
    .getByRole("button", { name: "What-if", exact: true })
    .click();
  await expect(page.getByText(/Hypothetical scenario — choose an assumption/)).toBeVisible();
  await expect(page.getByText("Scenario assumption", { exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "Scenario direction" })
    .getByRole("button", { name: "Falls", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explain ASIANPAINT, may rise, order 1", exact: true })
    .click();
  await expect(explanation(page).getByRole("link", { name: /Read the source/ })).toHaveCount(0);
  const map = disclosure(page, "Explore the visual impact map");
  await map.locator(":scope > summary").click();
  const graph = page.getByRole("group", { name: /^Ripple from/ });
  const node = graph.getByRole("button", { name: "INDIGO, may rise", exact: true });
  await node.focus();
  await node.press("Enter");
  await expect(node).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Explain INDIGO, may rise, order 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(explanation(page).getByRole("link", { name: "Research INDIGO" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Show all 12 companies", exact: true }).click();
  const lastCompany = page
    .getByRole("list", { name: "Affected companies" })
    .getByRole("button")
    .last();
  const selectionLabel = (await lastCompany.getAttribute("aria-label"))!;
  await lastCompany.click();
  const selectedHeading = await explanation(page).getByRole("heading", { level: 2 }).innerText();
  await page.getByRole("button", { name: "Show fewer companies", exact: true }).click();
  await expect(page.getByRole("button", { name: selectionLabel, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(explanation(page).getByRole("heading", { level: 2 })).toHaveText(selectedHeading);
  await expect(
    page.getByText("Showing the strongest eight links and your selected company."),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Event source" })
    .getByRole("button", { name: "Recent news", exact: true })
    .click();
  await expect(
    page.getByText("Mapped interpretation of the headline", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Hypothetical scenario — choose an assumption/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Explain ASIANPAINT, may fall/ })).toBeVisible();
});

for (const state of ["unavailable", "stale", "empty"] as const) {
  test(`news ${state}: honest state and recovery preserve the research flow`, async ({
    page,
    workspace,
  }) => {
    workspace.newsStatus = state === "unavailable" ? "unavailable" : "available";
    workspace.staleNews = state === "stale";
    workspace.emptyNews = state === "empty";
    await page.goto("/app/ripple");
    if (state === "empty") {
      await expect(page.getByText(/No dated headline from the last 24 hours/)).toBeVisible();
      await page.getByRole("button", { name: "Try a what-if scenario" }).click();
      await expect(page.getByText("Scenario assumption", { exact: true })).toBeVisible();
    } else {
      await expect(
        page.getByText(state === "stale" ? "News snapshot is stale" : "News is unavailable", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Affected companies", exact: true }),
      ).toHaveCount(0);
      workspace.newsStatus = "available";
      workspace.staleNews = false;
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(
        page.getByRole("button", { name: /Crude oil prices rise sharply/ }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Affected companies", exact: true }),
    ).toBeVisible();
  });
}

test("historical validation is opt-in and retains history source, cutoff and delayed provenance", async ({
  page,
  workspace,
}) => {
  await page.goto("/app/ripple");
  await page
    .getByRole("group", { name: "Event source" })
    .getByRole("button", { name: "What-if", exact: true })
    .click();
  await page.getByLabel("What changes", { exact: true }).selectOption("TCS");
  await page.getByRole("button", { name: /^Explain INFY,/ }).click();
  expect(workspace.historyRequests).toEqual([]);
  const history = disclosure(page, "Historical echo · optional validation");
  await expect(history).not.toHaveAttribute("open", "");
  await history.locator(":scope > summary").click();
  await expect(history).toContainText(
    "TCS: fixture-history · as of 2026-10-16T10:00:00Z · delayed",
  );
  await expect(history).toContainText("INFY: fixture-history");
  expect(workspace.historyRequests).toHaveLength(2);
});

test("saved ripple grading is disclosed, retryable, and read back after reload", async ({
  page,
  workspace,
}) => {
  await page.goto("/app/ripple");
  const validation = disclosure(page, "Validation & saved ripples");
  await validation.locator(":scope > summary").click();
  workspace.failLock = true;
  await validation.getByRole("button", { name: "Lock for grading" }).click();
  await expect(validation.getByRole("alert")).toContainText("Could not lock this ripple");
  workspace.failLock = false;
  await validation.getByRole("button", { name: "Lock for grading" }).click();
  await expect(validation.getByRole("button", { name: "Locked today" })).toBeDisabled();
  expect(workspace.locked).toHaveLength(1);
  await page.reload();
  await validation.locator(":scope > summary").click();
  await expect(validation.getByRole("button", { name: "Locked today" })).toBeDisabled();
  await expect(validation.getByText("Locked calls", { exact: true })).toBeVisible();
  await expect(validation.getByText(headline.title, { exact: true })).toBeVisible();
});

test("stock research keeps failed-refresh retry and the previous completed research visible", async ({
  page,
  workspace,
}) => {
  workspace.failedResearch = true;
  await page.goto("/app/stocks/RELIANCE");
  await expect(page.getByText(/Showing the last completed prediction/)).toBeVisible();
  await expect(page.getByText("Older completed research", { exact: true })).toBeVisible();
  await expect(page.getByText(/latest analysis failed; previous research retained/)).toBeVisible();
  await expect(page.getByText("Full analysis refreshing", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry analysis", exact: true })).toBeVisible();
  workspace.failedResearch = false;
  await page.getByRole("button", { name: "Retry analysis", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry analysis", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Decision canvas", exact: true })).toBeVisible();
});
