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
  type RippleArticle,
} from "./ripple.ts";
import { nifty50 } from "../../data/nifty50.ts";

const DAY = 86_400;

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

test("headline directions read rupee, rate and supply-cut vocabulary", () => {
  assert.equal(headlineDirection("Crude prices surge on supply fears"), "UP");
  assert.equal(headlineDirection("Markets mixed"), null);
  assert.equal(factorDirection("USDINR", "rupee slumps to record low against dollar"), "UP");
  assert.equal(factorDirection("RATES", "RBI announces 25 bps rate cut"), "DOWN");
  assert.equal(factorDirection("RATES", "RBI holds repo rate unchanged"), null);
  assert.equal(factorDirection("CRUDE", "OPEC+ agrees to output cuts"), "UP");
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
    published_at: `2026-10-1${id}T05:00:00Z`,
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
  );
  assert.equal(origins.length, 2);
  assert.equal(
    origins.find((o) => o.origin === "CRUDE")?.title,
    "Crude oil prices jump to six-month high",
  );
  assert.equal(origins.find((o) => o.origin === "INFY")?.direction, "UP");
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
