import { test, expect } from "@playwright/test";

const headers = { Authorization: "Bearer quant-plus-local-workspace" };
test.beforeEach(async ({ request }) => {
  await request.post("/api/local", {
    headers,
    data: {
      rpc: "fund_wallet",
      values: { p_amount: 100000, p_intent_id: "intelligence-onboarding" },
    },
  });
});
const stamp = () => new Date().toISOString();
const article = (changes = {}) => ({
  id: "scored",
  symbol: "RELIANCE",
  company: "Reliance Industries",
  title: "Reliance profit rises",
  source: "Fixture provider",
  url: "https://example.com/news",
  published_at: stamp(),
  snippet: "",
  provider: "fixture",
  relevance_score: 90,
  sentiment: "positive",
  sentiment_score: 75,
  impact: "high",
  impact_score: 80,
  category: "earnings",
  confidence: 0.7,
  influences_sentiment: true,
  ...changes,
});
const news = (articles: ReturnType<typeof article>[]) => ({
  symbol: "RELIANCE",
  company: "Reliance Industries",
  articles,
  provider_status: {
    provider: "fixture",
    status: "available",
    queries_succeeded: 1,
    queries_total: 1,
  },
  data_quality: "PARTIAL",
  confidence: 0.5,
  updated_at: stamp(),
  relevance_threshold: 55,
});

test("stock news keeps relevant unscored headlines, renders drivers, and refreshes both panels", async ({
  page,
}) => {
  const articles = [
    article(),
    article({
      id: "unscored",
      title: "Reliance filing in an unsupported script",
      sentiment: "unavailable",
      sentiment_score: null,
      influences_sentiment: false,
    }),
  ];
  let newsCalls = 0;
  let sentimentCalls = 0;
  await page.route("**/api/stocks/RELIANCE/news", async (route) => {
    newsCalls++;
    await route.fulfill({ json: news(articles) });
  });
  await page.route("**/api/stocks/RELIANCE/news-sentiment", async (route) => {
    sentimentCalls++;
    await route.fulfill({
      json: {
        symbol: "RELIANCE",
        score: 75,
        label: "BULLISH",
        positive_articles: 1,
        negative_articles: 0,
        neutral_articles: 0,
        high_impact_articles: 1,
        confidence: 0.5,
        data_quality: "PARTIAL",
        updated_at: stamp(),
        top_drivers: [articles[0]],
        price_confirmation: null,
        news_price_divergence: false,
        price_confirmation_status: "unavailable_market_closed",
      },
    });
  });
  await page.goto("/app/stocks/RELIANCE");
  await expect(page.getByText("Top scored news drivers")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Market closed · intraday price confirmation is paused."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reliance filing in an unsupported script" }),
  ).toBeVisible();
  await expect(page.getByText("Not scored", { exact: true })).toBeVisible();
  const before = [newsCalls, sentimentCalls];
  await page.getByRole("button", { name: "Refresh stock news and sentiment" }).click();
  await expect.poll(() => newsCalls).toBeGreaterThan(before[0]!);
  await expect.poll(() => sentimentCalls).toBeGreaterThan(before[1]!);
});

test("market sentiment retains provider diagnostics instead of discarding a null score", async ({
  page,
}) => {
  await page.route("**/api/market/sentiment", (route) =>
    route.fulfill({
      json: {
        score: null,
        label: "UNAVAILABLE",
        confidence: 0,
        updated_at: stamp(),
        data_quality: "DEGRADED",
        market_session: "open",
        market_status: "OPEN",
        regime: "UNKNOWN",
        weight_coverage: 0,
        components: {
          news_sentiment: {
            score: 62,
            available: false,
            effective_weight: 0,
            reason: "News-only evidence",
          },
        },
        warnings: ["Fresh FYERS index observations are unavailable"],
      },
    }),
  );
  await page.goto("/app/dashboard");
  await expect(
    page.getByText("Market sentiment unavailable", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("News tone 62/100 · not a composite market score.").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Fresh FYERS index observations are unavailable").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Check data sources and broker connection" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /Sentiment score/ })).toHaveCount(0);
});

test("ripple can recover from unavailable news and maps a dated factor move", async ({ page }) => {
  let available = false;
  await page.route("**/api/market/news", (route) =>
    route.fulfill({
      json: {
        ...news(
          available
            ? [article({ id: "crude", symbol: "MARKET", title: "Crude oil prices rise sharply" })]
            : [],
        ),
        provider_status: { provider: "fixture", status: available ? "available" : "unavailable" },
      },
    }),
  );
  await page.goto("/app/ripple");
  await expect(page.getByText("News is unavailable", { exact: true })).toBeVisible();
  available = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("button", { name: /Crude oil prices rise sharply/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Affected companies", exact: true }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "Explore the visual impact map" }).click();
  await expect(page.getByRole("heading", { name: "How the ripple spreads" })).toBeVisible();
  await expect(page.getByText(/curated link weight/i).first()).toBeVisible();
});
