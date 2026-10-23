import type { Page } from "@playwright/test";

// Deterministic market and workspace fixtures for visual and chart-tool tests.
// Nothing reaches a real provider: agent and workspace APIs are fulfilled here.

type Row = Record<string, unknown>;
const NOW = new Date("2026-10-20T10:30:00+05:30");
const DAY = 86_400;

function candles(count: number, step: number, end: number, base: number) {
  // Deterministic random walk: identical bars on every run.
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  let close = base;
  return Array.from({ length: count }, (_, i) => {
    const open = close;
    close = Math.max(base * 0.6, open + next() * base * 0.02 + Math.sin(i / 9) * base * 0.004);
    return {
      time: end - (count - i) * step,
      open,
      high: Math.max(open, close) + Math.abs(next()) * base * 0.006,
      low: Math.min(open, close) - Math.abs(next()) * base * 0.006,
      close,
      volume: Math.round(4e6 + Math.abs(next()) * 6e6),
    };
  });
}

export async function marketFixture(page: Page) {
  const tables: Record<string, Row[]> = {
    accounts: [
      {
        id: "visual-account",
        onboarded: true,
        currency: "INR",
        wallet_balance: 1000000,
        total_funds: 1000000,
        available_cash: 1000000,
        reserved_cash: 0,
        settled_cash: 1000000,
        unsettled_cash: 0,
        total_deposits: 1000000,
        total_withdrawals: 0,
        initial_capital: 1000000,
        funds_used: 0,
        profit: 0,
        profit_pct: 0,
      },
    ],
    trading_preferences: [
      {
        id: "visual-preferences",
        display_name: "Visual",
        density: "COMFORTABLE",
        calm_mode: true,
        learning: { onboarding: "DONE" },
      },
    ],
    watchlist_items: [
      { id: "w1", symbol: "RELIANCE", company: "Reliance Industries" },
      { id: "w2", symbol: "TCS", company: "Tata Consultancy Services" },
      { id: "w3", symbol: "HDFCBANK", company: "HDFC Bank" },
    ],
    research_items: [],
  };
  const asOf = NOW.toISOString();
  const quote = (symbol: string, price: number, change: number) => ({
    symbol,
    price,
    previous_close: price - change,
    change,
    change_pct: (change / (price - change)) * 100,
    open: price - change * 0.5,
    high: price + 12,
    low: price - 18,
    volume: 5_400_000,
    source: "fyers",
    delayed: false,
    stale: false,
    market_session: "open",
    as_of: asOf,
    received_at: asOf,
    depth: [],
  });
  const quotes: Record<string, ReturnType<typeof quote>> = {
    RELIANCE: quote("RELIANCE", 1412.4, 8.2),
    TCS: quote("TCS", 4102.5, -21.4),
    HDFCBANK: quote("HDFCBANK", 1708.9, 4.1),
  };
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => sessionStorage.setItem("quant-plus:welcome-dismissed", "true"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4179") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (path.startsWith("/api/agent/")) {
      const agent = path.slice("/api/agent/".length);
      if (agent === "market/overview" || agent === "market/overview/stream") {
        const instruments = [
          ["NIFTY", "NIFTY 50", 24812.35, 0.42],
          ["BANK", "BANK NIFTY", 51230.1, -0.18],
          ["VIX", "INDIA VIX", 13.42, -2.3],
          ["SENSEX", "SENSEX", 81345.9, 0.37],
        ].map(([symbol, name, value, pct], i) => ({
          symbol,
          name,
          kind: "index",
          currency: "INR",
          value,
          change_abs: ((value as number) * (pct as number)) / 100,
          change_pct: pct,
          sort_order: i,
          updated_at: asOf,
          source: "fyers",
          delayed: false,
          stale: false,
          market_session: "open",
        }));
        if (agent.endsWith("/stream"))
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: overview\ndata: ${JSON.stringify({ instruments })}\n\n`,
          });
        return route.fulfill({ json: { instruments } });
      }
      if (agent === "market/stream") {
        const names = (url.searchParams.get("symbols") ?? "").split(",");
        return route.fulfill({
          contentType: "text/event-stream",
          body: names
            .filter((name) => quotes[name])
            .map((name) => `data: ${JSON.stringify(quotes[name])}\n\n`)
            .join(""),
        });
      }
      if (/^market\/[^/]+\/history$/.test(agent)) {
        const symbol = agent.split("/")[1]!;
        const base = quotes[symbol]?.price ?? 1000;
        const end = Math.floor(NOW.getTime() / 1000 / DAY) * DAY;
        return route.fulfill({
          json: {
            symbol,
            source: "fyers",
            as_of: asOf,
            interval: "1d",
            delayed: false,
            candles: candles(220, DAY, end, base),
          },
        });
      }
      return route.fulfill({ status: 503, json: { detail: "Unavailable in visual fixture" } });
    }
    if (path !== "/api/local")
      return route.fulfill({ status: 503, json: { error: "Unavailable in visual fixture" } });
    const body = route.request().postDataJSON();
    if (body.rpc)
      return route.fulfill({
        json: body.rpc === "conversation_list" ? [] : { events: [], latest_seq: 0 },
      });
    const rows = tables[body.table] ?? [];
    if (body.operation === "insert") {
      const row = { ...body.values, id: `fx-${rows.length}`, created_at: NOW.toISOString() };
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
  return { tables };
}
