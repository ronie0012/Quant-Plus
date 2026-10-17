import { test } from "node:test";
import assert from "node:assert/strict";
import { distribution, quantile, seededRandom } from "./stats.ts";
import {
  attributeOutcome,
  emptyPlan,
  executionFacts,
  planProblems,
  planReadiness,
  riskBasedQuantity,
  widenedStops,
  type DecisionPlanBody,
} from "./decision-plan.ts";
import { compileRisk, historyRiskInputs, type CompilerInput } from "./risk-compiler.ts";
import {
  DEFAULT_BEHAVIOR_POLICY,
  detectPatterns,
  evaluateProtections,
  roundTrips,
  type BehaviorOrder,
} from "./behavior.ts";
import {
  matureForecasts,
  strengthProbability,
  trackSentence,
  trackStats,
  type Forecast,
} from "./track-record.ts";
import { featureHistory, findAnalogs, type DailyBar } from "./regime.ts";
import { backtest, compileHypothesis, evaluateStrategy, type Bar } from "./strategy.ts";
import { analysePortfolio, twin, type Position } from "./portfolio-risk.ts";
import { classifyEvent, expiryEvents, knowable, type RadarEvent } from "./events.ts";
import { trustScore } from "./trust.ts";

const DAY = 86_400;
const T0 = Date.parse("2026-01-01T10:00:00Z") / 1000;

function series(n: number, f: (i: number) => number, volume = 1_000_000): DailyBar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = f(i);
    const open = i ? f(i - 1) : close;
    return {
      time: T0 + i * DAY,
      open,
      high: Math.max(open, close) * 1.005,
      low: Math.min(open, close) * 0.995,
      close,
      volume,
    };
  });
}

test("quantiles and distributions never invent values", () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  const d = distribution([-1, 1, 2]);
  assert.equal(d.n, 3);
  assert.equal(d.positive_share, 2 / 3);
  const a = seededRandom(7);
  const b = seededRandom(7);
  assert.equal(a(), b());
});

test("decision plan readiness lists every missing pre-trade part", () => {
  const entry = { thesis: "", invalidation: "", plan: emptyPlan() };
  const r = planReadiness(entry);
  assert.equal(r.ready, false);
  assert.ok(r.missing.includes("Counter-thesis"));
  const complete: DecisionPlanBody = {
    ...emptyPlan(),
    expected_outcome: "Price clears 2600 within 10 sessions",
    counter_thesis: "Sector rotation out of energy",
    holding_period_days: 10,
    entry: 2500,
    stop: 2450,
    target: 2650,
    time_exit: "2026-02-01T10:00:00.000Z",
    quantity: 20,
    sizing_logic: "Risk ₹1,000 / ₹50 per share",
    expected_fees: 12,
    expected_slippage: 5,
    max_acceptable_loss: 1000,
    evidence_items: [
      {
        id: "e1",
        claim: "Breakout on volume",
        kind: "OBSERVATION",
        source: "fyers",
        published_at: null,
        available_at: "2026-01-01T10:00:00.000Z",
      },
    ],
    market_snapshot: {
      symbol: "RELIANCE",
      price: 2500,
      bid: 2499.9,
      ask: 2500.1,
      change_pct: 1,
      volume: 1,
      source: "fyers",
      as_of: "2026-01-01T10:00:00.000Z",
      captured_at: "2026-01-01T10:00:00.000Z",
      market_session: "open",
      delayed: false,
      stale: false,
    },
  };
  assert.equal(
    planReadiness({ thesis: "Energy leadership", invalidation: "Close below 2450", plan: complete })
      .ready,
    true,
  );
  assert.deepEqual(planProblems(complete), []);
  assert.equal(riskBasedQuantity(2500, 2450, 1000), 20);
  assert.match(
    planProblems({ ...complete, quantity: 40 })[0]!,
    /exceeds your maximum acceptable loss/,
  );
  assert.match(planProblems({ ...complete, stop: 2550 })[0]!, /Stop must be below/);
  const widened = widenedStops({
    ...complete,
    revisions: [{ at: "x", field: "stop", from: 2450, to: 2400 }],
  });
  assert.equal(widened.length, 1);
});

test("attribution separates thesis, execution and process", () => {
  const plan: DecisionPlanBody = {
    ...emptyPlan(),
    expected_outcome: "Reaches 110 within ten sessions",
    counter_thesis: "Broad market selling",
    holding_period_days: 10,
    entry: 100,
    stop: 95,
    target: 110,
    time_exit: new Date((T0 + 15 * DAY) * 1000).toISOString(),
    quantity: 10,
    sizing_logic: "Risk ₹50 at ₹5 per share",
    expected_fees: 1,
    expected_slippage: 1,
    max_acceptable_loss: 60,
    market_snapshot: {
      symbol: "X",
      price: 100,
      bid: null,
      ask: null,
      change_pct: null,
      volume: null,
      source: "t",
      as_of: new Date(T0 * 1000).toISOString(),
      captured_at: new Date(T0 * 1000).toISOString(),
      market_session: null,
      delayed: false,
      stale: false,
    },
    evidence_items: [
      {
        id: "1",
        claim: "Volume breakout",
        kind: "USER_NOTE",
        source: "me",
        published_at: null,
        available_at: new Date(T0 * 1000).toISOString(),
      },
    ],
  };
  // Price rises steadily to the target: the thesis was right.
  const path = series(20, (i) => 100 + i);
  const entry = {
    thesis: "Demand is rising",
    invalidation: "Close below 95",
    plan,
    created_at: new Date(T0 * 1000).toISOString(),
    order_id: "o1",
  };
  // Entry filled 3% worse than planned: bad execution.
  const facts = executionFacts(
    "o1",
    [
      {
        order_id: "o1",
        side: "BUY",
        quantity: 10,
        price: 103,
        created_at: new Date((T0 + 60) * 1000).toISOString(),
      },
    ],
    [
      {
        order_id: "o2",
        side: "SELL",
        quantity: 10,
        price: 110,
        created_at: new Date((T0 + 10 * DAY) * 1000).toISOString(),
      },
    ],
  );
  assert.ok(facts);
  assert.equal(facts.exit_fill, 110);
  const a = attributeOutcome(
    entry,
    facts,
    new Date((T0 + 60) * 1000).toISOString(),
    path,
    (T0 + 30 * DAY) * 1000,
  );
  assert.equal(a.thesis.grade, "GOOD");
  assert.equal(a.execution.grade, "BAD");
  assert.equal(a.label, "GOOD_THESIS_BAD_EXECUTION");

  // Profitable, but the plan was written after the order and was incomplete.
  const sloppy = {
    thesis: "Up",
    invalidation: "",
    plan: { ...plan, counter_thesis: "", evidence_items: [] },
    created_at: new Date((T0 + 3600) * 1000).toISOString(),
    order_id: "o1",
  };
  const good = executionFacts(
    "o1",
    [
      {
        order_id: "o1",
        side: "BUY",
        quantity: 10,
        price: 100,
        created_at: new Date((T0 + 60) * 1000).toISOString(),
      },
    ],
    [
      {
        order_id: "o2",
        side: "SELL",
        quantity: 10,
        price: 110,
        created_at: new Date((T0 + 10 * DAY) * 1000).toISOString(),
      },
    ],
  );
  const b = attributeOutcome(
    sloppy,
    good,
    new Date((T0 + 60) * 1000).toISOString(),
    path,
    (T0 + 30 * DAY) * 1000,
  );
  assert.equal(b.label, "GOOD_TRADE_BAD_PROCESS");
  assert.ok(b.pnl! > 0);
});

function compilerInput(patch: Partial<CompilerInput> = {}): CompilerInput {
  return {
    symbol: "HDFCBANK",
    sector: "Financial Services",
    side: "BUY",
    quantity: 100,
    order_type: "MARKET",
    limit_price: null,
    quote: {
      price: 1600,
      bid: 1599.9,
      ask: 1600.1,
      bid_size: 500,
      ask_size: 60,
      stale: false,
      delayed: false,
    },
    adv: 5_000_000,
    daily_vol: 0.015,
    gap_p95: 0.02,
    gap_worst: 0.05,
    beta: 1.1,
    stop: 1552,
    target: 1700,
    holding_days: 10,
    holdings: [
      { symbol: "ICICIBANK", sector: "Financial Services", quantity: 150, price: 1200 },
      { symbol: "TCS", sector: "Information Technology", quantity: 50, price: 4000 },
    ],
    cash: 500_000,
    limits: {
      max_order_value: 1_000_000,
      max_position_pct: 25,
      daily_loss_limit: 25_000,
      max_sector_pct: 35,
    },
    day_loss: 0,
    committed_risk_today: 0,
    events: [{ title: "Board meeting", at: "2026-10-05T00:00:00.000Z", kind: "Board meeting" }],
    behavior_warnings: [],
    at: "2026-10-01T05:00:00.000Z",
    ...patch,
  };
}

test("risk compiler quantifies stop, gap, concentration and budget in one sentence", () => {
  const preview = compileRisk(compilerInput());
  assert.ok(preview.planned_loss! > 4_800 && preview.planned_loss! < 5_200);
  assert.ok(preview.gap_loss! > preview.planned_loss!);
  assert.equal(preview.worst_partial_fill.quantity, 60);
  assert.ok(preview.fees > 0);
  assert.ok(preview.sector_pct_after! > 35);
  assert.ok(preview.violations.some((v) => v.code === "SECTOR_CONCENTRATION"));
  assert.ok(preview.violations.some((v) => v.code === "EVENT_RISK"));
  assert.match(
    preview.narrative,
    /^This trade risks ₹[\d,]+ under your planned stop, ₹[\d,]+ under a gap scenario, increases Financial Services exposure to \d+% and consumes \d+% of your daily risk budget\.$/,
  );
  const blocked = compileRisk(compilerInput({ day_loss: 24_000 }));
  assert.ok(
    blocked.violations.some((v) => v.code === "DAILY_RISK_BUDGET" && v.severity === "BLOCK"),
  );
  const inputs = historyRiskInputs(series(80, (i) => 100 + Math.sin(i) * 3));
  assert.ok(inputs.daily_vol! > 0);
  assert.ok(inputs.adv === 1_000_000);
});

function order(
  id: string,
  side: "BUY" | "SELL",
  at: number,
  price: number,
  qty = 10,
  symbol = "AAA",
): BehaviorOrder {
  return {
    id,
    symbol,
    side,
    status: "FILLED",
    created_at: new Date(at * 1000).toISOString(),
    filled_quantity: qty,
    avg_fill_price: price,
    price,
  };
}

test("behavioural engine finds size escalation after losses and protections never block exits", () => {
  const orders: BehaviorOrder[] = [];
  let t = T0;
  // Normal trades: small and profitable.
  for (let i = 0; i < 4; i++) {
    orders.push(order(`n${i}b`, "BUY", (t += 3600), 100, 10));
    orders.push(order(`n${i}s`, "SELL", (t += 3600), 102, 10));
  }
  // Pairs of losses followed by an oversized losing entry.
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 2; j++) {
      orders.push(order(`l${k}${j}b`, "BUY", (t += 3600), 100, 10));
      orders.push(order(`l${k}${j}s`, "SELL", (t += 3600), 97, 10));
    }
    orders.push(order(`big${k}b`, "BUY", (t += 3 * 3600), 100, 40));
    orders.push(order(`big${k}s`, "SELL", (t += 3600), 96, 40));
    // A normal-sized win resets the loss streak.
    orders.push(order(`w${k}b`, "BUY", (t += 3 * 3600), 100, 10));
    orders.push(order(`w${k}s`, "SELL", (t += 3600), 102, 10));
    orders.push(order(`v${k}b`, "BUY", (t += 3 * 3600), 100, 10));
    orders.push(order(`v${k}s`, "SELL", (t += 3600), 102, 10));
  }
  // The streak ends on two losses so the cooling-off check below is live.
  orders.push(order(`z1b`, "BUY", (t += 3600), 100, 10));
  orders.push(order(`z1s`, "SELL", (t += 3600), 97, 10));
  orders.push(order(`z2b`, "BUY", (t += 3600), 100, 10));
  orders.push(order(`z2s`, "SELL", (t += 3600), 97, 10));
  assert.equal(roundTrips(orders).length, 4 + 15 + 2);
  const patterns = detectPatterns(orders, []);
  const size = patterns.find((p) => p.key === "size_after_losses")!;
  assert.equal(size.detected, true);
  assert.match(
    size.statement!,
    /^Your last \d+ trades taken after two consecutive losses were [\d.]+× larger than your normal size and had lower expectancy/,
  );
  const policy = { ...DEFAULT_BEHAVIOR_POLICY, consent: true, cooling_off_minutes: 120 };
  const ctx = {
    now: (t + 60) * 1000,
    orders,
    plan_ready: false,
    proposed_value: 1000,
    drawdown_pct: 0,
    side: "BUY" as const,
    patterns,
  };
  assert.ok(evaluateProtections(policy, ctx).blocks.some((b) => b.startsWith("Cooling-off")));
  assert.deepEqual(evaluateProtections(policy, { ...ctx, side: "SELL" }).blocks, []);
  assert.deepEqual(evaluateProtections({ ...policy, consent: false }, ctx).blocks, []);
});

test("track records mature only after the horizon and report abstentions", () => {
  const bars = { AAA: series(30, (i) => 100 + i).map((b) => ({ time: b.time, close: b.close })) };
  const base: Omit<Forecast, "id" | "as_of" | "direction"> = {
    symbol: "AAA",
    role: "committee",
    model_version: "v1",
    probability: strengthProbability(80),
    sector: "X",
    liquidity: "HIGH",
    coverage: "FULL",
  };
  const forecasts: Forecast[] = [
    { ...base, id: "1", as_of: new Date(T0 * 1000).toISOString(), direction: "UP" },
    { ...base, id: "2", as_of: new Date((T0 + DAY) * 1000).toISOString(), direction: "DOWN" },
    {
      ...base,
      id: "3",
      as_of: new Date((T0 + 2 * DAY) * 1000).toISOString(),
      direction: "ABSTAIN",
    },
    { ...base, id: "4", as_of: new Date((T0 + 28 * DAY) * 1000).toISOString(), direction: "UP" },
  ];
  const { matured, pending } = matureForecasts(forecasts, bars, 5, () => "Uptrend, calm", 0.002);
  assert.equal(pending, 1);
  const stats = trackStats(matured);
  assert.equal(stats.n, 3);
  assert.equal(stats.accuracy, 0.5);
  assert.equal(stats.abstentions, 1);
  assert.equal(strengthProbability(80), 0.9);
  assert.match(
    trackSentence(matured, 5, 1),
    /^This research configuration has 3 matured forecasts at the 5-session horizon/,
  );
});

test("analogs use only completed forward windows and report distributions", () => {
  const nifty = series(250, (i) => 20000 * (1 + 0.1 * Math.sin(i / 9)) * (1 + i / 2000));
  const rows = featureHistory(nifty);
  const result = findAnalogs(nifty, rows, { k: 10, horizon: 5, spacing: 5 });
  assert.equal(result.analogs.length, 10);
  for (const a of result.analogs) assert.ok(a.time < rows.at(-1)!.time - 5 * DAY);
  const times = result.analogs.map((a) => a.time).sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! - times[i - 1]! >= 5 * DAY);
  assert.equal(result.forward.n, 10);
});

test("hypothesis compiler produces a typed definition and flags proxies", () => {
  const spec = compileHypothesis(
    "Find liquid NSE stocks that outperform their sector after a high-volume breakout, but only when market breadth is positive.",
    0.25,
  );
  const kinds = spec.entry.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["BREAKOUT", "OUTPERFORM_SECTOR", "VOLUME_SURGE"]);
  assert.equal(spec.universe.liquid_only, true);
  assert.equal(spec.market_filter[0]?.kind, "INDEX_ABOVE_MA");
  assert.ok(spec.assumptions.some((a) => a.includes("breadth")));
  assert.equal(spec.exit.holding_days, 10);
  const parsed = compileHypothesis(
    "Buy pharma stocks when RSI below 25, hold for 7 days with a 4% stop and 8% target",
    0.25,
  );
  assert.equal(parsed.universe.sector, "Healthcare");
  assert.deepEqual(parsed.exit, { holding_days: 7, stop_pct: 4, target_pct: 8 });
  assert.equal(parsed.entry[0]?.kind, "RSI_BELOW");
});

test("backtests enter at the next open and placebo runs are reproducible", () => {
  const bars: Bar[] = series(200, (i) => 100 + (i % 30 === 0 ? 8 : 0) + i * 0.05);
  const spec = compileHypothesis("20 day breakout, hold for 5 days", 0.2);
  const universe = [{ symbol: "AAA", sector: "X", bars }];
  const trades = backtest(spec, universe, null);
  assert.ok(trades.length > 0);
  for (const trade of trades) {
    const i = bars.findIndex((b) => b.time === trade.entry_time);
    assert.ok(i > 0);
    assert.ok(Math.abs(trade.entry - bars[i]!.open * 1.0005) < 1e-9);
  }
  const a = backtest(spec, universe, null, { placebo: { rate: 0.1, seed: 3 } });
  const b = backtest(spec, universe, null, { placebo: { rate: 0.1, seed: 3 } });
  assert.deepEqual(a, b);
  const evaluation = evaluateStrategy(spec, universe, null, () => "Unknown", null, 20);
  assert.equal(evaluation.verdict, "INCONCLUSIVE");
  assert.equal(evaluation.sensitivity.length, 5);
});

test("portfolio risk contributions sum to one and the twin reports turnover", () => {
  const positions: Position[] = [
    {
      symbol: "A",
      sector: "S1",
      quantity: 100,
      price: 100,
      bars: series(130, (i) => 100 + Math.sin(i) * 2),
    },
    {
      symbol: "B",
      sector: "S1",
      quantity: 50,
      price: 200,
      bars: series(130, (i) => 200 + Math.sin(i) * 4),
    },
    {
      symbol: "C",
      sector: "S2",
      quantity: 10,
      price: 500,
      bars: series(130, (i) => 500 + Math.cos(i / 3) * 5),
    },
  ];
  const risk = analysePortfolio(positions, 10_000, { daily_loss_limit: 5_000, open_risk: 1_000 });
  const total = risk.positions.reduce((t, p) => t + (p.risk_contribution ?? 0), 0);
  assert.ok(Math.abs(total - 1) < 1e-6);
  assert.ok(risk.clusters.some((c) => c.members.includes("A") && c.members.includes("B")));
  assert.equal(risk.reduce_first.length, 3);
  assert.equal(risk.budget.used_pct, 20);
  const t = twin(positions, 10_000, { A: 0 });
  assert.equal(t.turnover, 10_000);
});

test("event radar computes expiry, classifies headlines and checks knowability", () => {
  const expiries = expiryEvents(Date.parse("2026-10-16T00:00:00Z"), 2, () => true);
  assert.equal(expiries[0]!.event_at.slice(0, 10), "2026-10-27");
  assert.equal(expiries[1]!.event_at.slice(0, 10), "2026-11-24");
  assert.equal(classifyEvent("Board approves stock split and bonus issue"), "SPLIT_BONUS");
  assert.equal(classifyEvent("Q2 FY27 results beat estimates"), "EARNINGS");
  const event: RadarEvent = {
    id: "1",
    kind: "EARNINGS",
    symbol: "AAA",
    title: "Results",
    event_at: "2026-10-10T10:00:00Z",
    time_known: true,
    published_at: "2026-10-10T10:00:00Z",
    source: "x",
    url: null,
    relevance: "HIGH",
    sectors: [],
  };
  assert.equal(knowable(event, "2026-10-09T00:00:00Z"), "NOT_YET_PUBLISHED");
  assert.equal(knowable(event, "2026-10-11T00:00:00Z"), "KNOWN");
});

test("trust score never hides unavailable capabilities", () => {
  const score = trustScore([
    { key: "m", label: "Market data", score: 94, status: "OK", detail: "", weight: 2 },
    { key: "o", label: "Options", score: null, status: "UNAVAILABLE", detail: "", weight: 1 },
  ]);
  assert.equal(score.overall, 94);
  assert.equal(score.label, "PARTIAL");
  assert.match(score.summary, /Unavailable: Options/);
});

test("flight simulator hides future news, caps fills and gaps through stops", async () => {
  const sim = await import("./flight-sim.ts");
  const bars = series(40, (i) => (i === 25 ? 80 : 100 + i * 0.1), 1_000);
  // Session 25 opens far below the prior close: a gap through any nearby stop.
  bars[25] = { ...bars[25]!, open: 85, high: 86, low: 79, close: 80 };
  const news = [
    {
      id: "past",
      title: "Old",
      source: "x",
      available_at: bars[5]!.time,
      sentiment: "neutral" as const,
    },
    {
      id: "future",
      title: "Later",
      source: "x",
      available_at: bars[30]!.time,
      sentiment: "negative" as const,
    },
  ];
  const config = { ...sim.DEFAULT_SIM_CONFIG, participation: 0.05, latency_bars: 1, stop_pct: 5 };
  let state = sim.startSim(bars, 10, config);
  assert.deepEqual(
    sim.visibleNews(news, bars, state).map((n) => n.id),
    ["past"],
  );
  state = sim.placeSimOrder(state, bars, { side: "BUY", type: "MARKET", quantity: 120 });
  // Latency: the order may first trade two bars later, not on the next bar.
  state = sim.stepSim(state, bars, 1);
  assert.equal(state.fills.length, 0);
  state = sim.stepSim(state, bars, 1);
  assert.equal(state.fills[0]!.quantity, 50);
  assert.equal(state.fills[0]!.partial, true);
  state = sim.stepSim(state, bars, 2);
  assert.equal(state.quantity, 120);
  assert.ok(state.stop != null);
  // Bar 24 closes at 80: price falls through the stop.
  state = sim.stepSim(state, bars, 25 - state.cursor);
  assert.equal(state.quantity, 0);
  assert.ok(state.markers.some((m) => m.kind === "STOP"));
  assert.equal(state.fills.at(-1)!.gap_through_stop, true);
  assert.ok(state.fills.at(-1)!.price < 85);
  assert.ok(state.markers.some((m) => m.kind === "GAP"));
  assert.ok(
    sim
      .visibleNews(news, bars, state)
      .every((n) => n.available_at <= bars[state.cursor]!.time + config.bar_seconds),
  );
  let blind = sim.startSim(bars, 5);
  blind = sim.recordDecision(blind, bars, "BUY", "trend");
  blind = sim.stepSim(blind, bars, 5);
  blind = sim.revealDecisions(blind, bars, 5);
  assert.ok(blind.decisions[0]!.revealed_return! > 0);
  assert.equal(sim.scoreDecisions(blind.decisions).hit_rate, 1);
});

test("classifiers avoid common-word false positives", async () => {
  const { compileHypothesis } = await import("./strategy.ts");
  const { classifyEvent, expiryEvents } = await import("./events.ts");
  assert.equal(compileHypothesis("Buy it when RSI below 30", 0.2).universe.sector, null);
  assert.equal(
    compileHypothesis("IT stocks with RSI below 30", 0.2).universe.sector,
    "Information Technology",
  );
  assert.equal(classifyEvent("Company wins order worth Rs 500 crore"), null);
  // Before September 2025 the monthly expiry was the last Thursday.
  assert.equal(
    expiryEvents(Date.parse("2025-06-10T00:00:00Z"), 1, () => true)[0]!.event_at.slice(0, 10),
    "2025-06-26",
  );
});

test("attention budget holds interruptions beyond the hourly limit but never errors", async () => {
  const { AttentionBudget } = await import("./attention.ts");
  const budget = new AttentionBudget(2);
  const t = 1_000_000;
  assert.equal(budget.allow(t), true);
  assert.equal(budget.allow(t + 1), true);
  assert.equal(budget.allow(t + 2), false);
  assert.equal(budget.allow(t + 3, true), true);
  assert.equal(budget.takeHeld(), 1);
  assert.equal(budget.takeHeld(), 0);
  assert.equal(budget.allow(t + 3_600_001), true);
  const unlimited = new AttentionBudget(0);
  for (let i = 0; i < 50; i++) assert.equal(unlimited.allow(t + i), true);
});

test("risk compiler never blocks an exit", () => {
  const preview = compileRisk(
    compilerInput({
      side: "SELL",
      quantity: 1000,
      holdings: [{ symbol: "HDFCBANK", sector: "Financial Services", quantity: 1000, price: 1600 }],
      limits: {
        max_order_value: 100_000,
        max_position_pct: 5,
        daily_loss_limit: 1,
        max_sector_pct: 1,
      },
      day_loss: 10_000,
    }),
  );
  assert.deepEqual(
    preview.violations.filter((v) => v.severity === "BLOCK"),
    [],
  );
  assert.match(preview.narrative, /^This sale raises about ₹/);
});
