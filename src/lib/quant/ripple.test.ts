import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectOrigins,
  factorDirection,
  headlineDirection,
  historicalEcho,
  propagate,
  RIPPLE_EDGES,
  rippleCalls,
  rippleNewsSnapshot,
  RIPPLE_FEED_MAX_AGE_MS,
  RIPPLE_NEWS_MAX_AGE_MS,
  type RippleArticle,
} from "./ripple.ts";
import { nifty50 } from "../../data/nifty50.ts";

const DAY = 86_400;
const NOW = Date.parse("2026-10-18T06:00:00Z");
const UNIVERSE = new Set(nifty50.map((s) => s.symbol));
const article = (extra: Partial<RippleArticle> = {}): RippleArticle => ({
  id: "test",
  symbol: "MARKET",
  title: "Crude prices rise",
  source: "Test fixture",
  published_at: "2026-10-18T05:00:00Z",
  url: "https://example.com/news",
  sentiment: "neutral",
  impact: "medium",
  ...extra,
});

test("every ripple edge connects known stocks or factors", async () => {
  const { FACTORS } = await import("./ripple.ts");
  const known = new Set([...nifty50.map((s) => s.symbol), ...FACTORS.map((f) => f.id)]);
  for (const edge of RIPPLE_EDGES) {
    assert.ok(known.has(edge.from), `unknown source ${edge.from}`);
    assert.ok(known.has(edge.to), `unknown target ${edge.to}`);
    assert.ok(edge.weight > 0 && edge.weight <= 1);
    assert.ok(edge.why.length > 10);
  }
});

test("crude ripples hit airlines and paints first, then IT through the rupee", () => {
  const impacts = propagate("CRUDE", "UP");
  const by = new Map(impacts.map((i) => [i.symbol, i]));
  assert.equal(by.get("INDIGO")?.direction, "DOWN");
  assert.equal(by.get("INDIGO")?.hop, 1);
  assert.equal(by.get("ASIANPAINT")?.direction, "DOWN");
  assert.equal(by.get("ONGC")?.direction, "UP");
  const tcs = by.get("TCS");
  assert.ok(tcs, "IT is reached through the rupee");
  assert.equal(tcs.direction, "UP");
  assert.deepEqual(tcs.path.slice(0, 2), ["CRUDE", "USDINR"]);
  assert.ok(tcs.strength < by.get("INDIGO")!.strength, "second order is weaker");
  // Factors are intermediate nodes, never reported impacts.
  assert.ok(!by.has("USDINR"));
  // A falling factor flips every direction.
  const down = new Map(propagate("CRUDE", "DOWN").map((i) => [i.symbol, i.direction]));
  assert.equal(down.get("INDIGO"), "UP");
});

test("propagation keeps the strongest path and never revisits a node", () => {
  for (const impact of propagate("HDFCBANK", "DOWN")) {
    assert.equal(new Set(impact.path).size, impact.path.length);
    assert.equal(impact.path.length, impact.hop + 1);
    assert.ok(impact.strength >= 0.06);
  }
});

test("headline directions read rupee and rate moves without assuming a supply-cut price reaction", () => {
  assert.equal(headlineDirection("Crude prices surge on supply fears"), "UP");
  assert.equal(headlineDirection("Markets mixed"), null);
  assert.equal(factorDirection("USDINR", "rupee slumps to record low against dollar"), "UP");
  assert.equal(factorDirection("RATES", "RBI announces 25 bps rate cut"), "DOWN");
  assert.equal(factorDirection("RATES", "RBI holds repo rate unchanged"), null);
  assert.equal(factorDirection("CRUDE", "OPEC+ agrees to output cuts"), null);
});

test("factor direction follows the reported move, not a causal clause or supply assumption", () => {
  assert.equal(factorDirection("CRUDE", "Crude prices fall after OPEC output cuts"), "DOWN");
  assert.equal(factorDirection("USDINR", "Rupee gains as crude prices fall"), "DOWN");
  assert.equal(factorDirection("USDINR", "Rupee weakens as crude prices rise"), "UP");
  assert.equal(factorDirection("CRUDE", "Crude stockpiles fall"), null);
  assert.equal(factorDirection("RATES", "RBI holds repo rate as bank shares rise"), null);
  assert.equal(factorDirection("CREDIT_GROWTH", "Bank NPAs rise"), null);
});

test("negated, prospective and contradictory factor moves do not become observed events", () => {
  for (const title of [
    "Crude prices may rise next week",
    "Crude prices are not rising",
    "Crude prices expected to fall",
    "Crude prices to rise next month",
    "Crude prices rise but crude prices fall later",
    "USFDA withdraws warning letter",
  ]) {
    assert.equal(detectOrigins([article({ title })], UNIVERSE, NOW).length, 0, title);
  }
});

test("news becomes factor or stock ripple origins, newest first, deduplicated", () => {
  const article = (
    id: string,
    title: string,
    extra: Partial<RippleArticle> = {},
  ): RippleArticle => ({
    id,
    symbol: "MARKET",
    title,
    source: "Test",
    published_at: `2026-10-14T0${id}:00:00Z`,
    url: "https://example.com",
    sentiment: "neutral",
    impact: "medium",
    ...extra,
  });
  const universe = new Set(nifty50.map((s) => s.symbol));
  const origins = detectOrigins(
    [
      article("1", "Brent crude rises 4% as supply tightens"),
      article("2", "Crude oil prices jump to six-month high"),
      article("3", "Infosys wins large deal", {
        symbol: "INFY",
        sentiment: "positive",
        impact: "high",
      }),
      article("4", "Minor update", { symbol: "TCS", sentiment: "positive", impact: "low" }),
    ],
    universe,
    Date.parse("2026-10-14T06:00:00Z"),
  );
  assert.equal(origins.length, 2);
  assert.equal(
    origins.find((o) => o.origin === "CRUDE")?.title,
    "Crude oil prices jump to six-month high",
  );
  assert.equal(origins.find((o) => o.origin === "INFY")?.direction, "UP");
});

test("only dated, recent, non-future headlines can seed news ripples", () => {
  const rows = [
    article({ id: "old", published_at: "2026-10-15T05:00:00Z" }),
    article({ id: "invalid", published_at: "unknown" }),
    article({ id: "future", published_at: "2026-10-19T05:00:00Z" }),
    article({ id: "recent" }),
  ];
  assert.deepEqual(
    detectOrigins(rows, UNIVERSE, NOW).map((o) => o.title),
    [rows[3]!.title],
  );
  assert.equal(detectOrigins(rows, UNIVERSE, NOW)[0]?.published_at, rows[3]!.published_at);
});

test("unavailable sentiment or impact is not interpreted as a negative company event", () => {
  const rows = [
    article({ symbol: "TCS", title: "TCS company update", sentiment: null, impact: "high" }),
    article({
      symbol: "INFY",
      title: "Infosys company update",
      sentiment: "negative",
      impact: null,
    }),
  ];
  assert.equal(detectOrigins(rows, UNIVERSE, NOW).length, 0);
});

test("macro direction comes from the title and each explicit factor keeps a unique id", () => {
  const origins = detectOrigins(
    [article({ title: "Crude prices rise as rupee weakens", snippet: "Airline shares fall." })],
    UNIVERSE,
    NOW,
  );
  assert.deepEqual(
    origins.map((o) => [o.origin, o.direction]),
    [
      ["CRUDE", "UP"],
      ["USDINR", "UP"],
    ],
  );
  assert.equal(new Set(origins.map((o) => o.id)).size, 2);
  assert.equal(origins[0]?.id, "news:test", "primary event keeps its existing ledger identity");
});

test("news age boundaries use publication time, not client fetch time", () => {
  const boundary = article({ published_at: new Date(NOW - RIPPLE_NEWS_MAX_AGE_MS).toISOString() });
  assert.equal(detectOrigins([boundary], UNIVERSE, NOW).length, 1);
  assert.equal(detectOrigins([boundary], UNIVERSE, NOW + 1).length, 0);
  assert.equal(
    detectOrigins([article({ published_at: new Date(NOW + 1).toISOString() })], UNIVERSE, NOW)
      .length,
    0,
  );
});

test("provider unavailable or failed refresh never exposes cached origins as current", () => {
  const feed = {
    articles: [article()],
    updated_at: new Date(NOW).toISOString(),
    provider_status: { status: "available" },
  };
  assert.equal(rippleNewsSnapshot(feed, UNIVERSE, NOW).origins.length, 1);
  assert.equal(rippleNewsSnapshot(feed, UNIVERSE, NOW + RIPPLE_FEED_MAX_AGE_MS).origins.length, 1);
  assert.deepEqual(
    rippleNewsSnapshot(feed, UNIVERSE, NOW + RIPPLE_FEED_MAX_AGE_MS + 1).origins,
    [],
    "unchanged cached data expires as time advances",
  );
  const partial = rippleNewsSnapshot(
    { ...feed, provider_status: { status: "partial" } },
    UNIVERSE,
    NOW,
  );
  assert.equal(partial.availability, "partial");
  assert.equal(partial.origins.length, 1);
  for (const snapshot of [
    rippleNewsSnapshot(undefined, UNIVERSE, NOW),
    rippleNewsSnapshot(feed, UNIVERSE, NOW, true),
    rippleNewsSnapshot({ ...feed, provider_status: { status: "unavailable" } }, UNIVERSE, NOW),
  ]) {
    assert.equal(snapshot.availability, "unavailable");
    assert.deepEqual(snapshot.origins, []);
  }
});

test("stale, invalid or future provider timestamps leave ripple news unavailable for propagation", () => {
  for (const updated_at of [
    new Date(NOW - RIPPLE_FEED_MAX_AGE_MS - 1).toISOString(),
    "unknown",
    new Date(NOW + 1).toISOString(),
  ]) {
    const feed = { articles: [article()], updated_at, provider_status: { status: "available" } };
    const snapshot = rippleNewsSnapshot(feed, UNIVERSE, NOW);
    assert.equal(snapshot.availability, "stale");
    assert.deepEqual(snapshot.origins, []);
    assert.equal(snapshot.updated_at, updated_at === "unknown" ? null : updated_at);
  }
});

test("historical echo measures signed target moves on source shock days only", () => {
  const n = 120;
  const sourceCloses = Array.from({ length: n }, (_, i) => 100 * (1 + 0.001 * Math.sin(i)));
  const shocks = [30, 60, 90];
  for (const s of shocks) for (let i = s; i < n; i++) sourceCloses[i]! *= 1.05;
  const targetCloses = Array.from({ length: n }, () => 100);
  for (const s of shocks) for (let i = s; i < n; i++) targetCloses[i]! *= 1.02;
  const bars = (closes: number[]) => closes.map((close, i) => ({ time: i * DAY, close }));
  const echo = historicalEcho(bars(sourceCloses), bars(targetCloses), 1);
  assert.equal(echo.status, "MEASURED");
  assert.equal(echo.n, 3);
  assert.equal(echo.agreement, 1);
  assert.ok(Math.abs(echo.median_move! - 0.02) < 0.001);
  const inverse = historicalEcho(bars(sourceCloses), bars(targetCloses), -1);
  assert.equal(inverse.agreement, 0);
  assert.equal(historicalEcho(bars(sourceCloses.slice(0, 10)), bars(targetCloses), 1).n, 0);
});

test("ripple calls are capped and carry the lock time", () => {
  const calls = rippleCalls(propagate("CRUDE", "UP"), "2026-10-18T04:00:00.000Z", 3);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.as_of === "2026-10-18T04:00:00.000Z"));
});

const echoFixture = (shocks = [30, 60, 90]) => {
  const source = Array.from({ length: 120 }, (_, i) => ({ time: i * DAY, close: 100 }));
  const target = source.map((bar) => ({ ...bar }));
  for (const shock of shocks) {
    for (let i = shock; i < source.length; i++) {
      source[i]!.close *= 1.05;
      target[i]!.close *= 1.02;
    }
  }
  return { source, target };
};

test("echo skips a shock when the target's baseline or horizon session is missing", () => {
  const { source, target } = echoFixture();
  for (const missing of [29, 31, 32]) {
    const echo = historicalEcho(
      source,
      target.filter((_, i) => i !== missing),
      1,
    );
    assert.equal(echo.n, 2, `missing session ${missing}`);
    assert.equal(echo.agreement, null);
    assert.equal(echo.median_move, null);
  }
});

test("echo does not count overlapping response windows as separate observations", () => {
  const { source, target } = echoFixture([30, 31, 32, 60, 90]);
  assert.equal(historicalEcho(source, target, 1).n, 3);
});

test("invalid echo inputs leave metrics unavailable", () => {
  const { source, target } = echoFixture();
  for (const close of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid = target.map((bar, i) => (i === 10 ? { ...bar, close } : bar));
    const echo = historicalEcho(source, invalid, 1);
    assert.equal(echo.status, "INVALID_INPUT");
    assert.equal(echo.agreement, null);
    assert.equal(echo.median_move, null);
  }
  assert.equal(historicalEcho([...source].reverse(), target, 1).n, 0);
  for (const window of [0, -1, 1.5, Number.NaN]) {
    assert.equal(historicalEcho(source, target, 1, window).n, 0);
  }
  assert.equal(historicalEcho(source.slice(0, 10), target, 1).status, "INSUFFICIENT_HISTORY");
  assert.equal(historicalEcho(source, target, 1, 3, 100).status, "INSUFFICIENT_EVENTS");
});
