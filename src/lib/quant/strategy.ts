/**
 * Natural-language research compiler. A hypothesis is compiled into a typed,
 * visible strategy definition; anything the compiler did not understand is
 * listed, never silently guessed. The definition is then evaluated with a
 * fixed falsification pipeline: baseline, walk-forward, costs, regimes,
 * placebo, parameter sensitivity, a shadow paper run and a promotion rule.
 * Backtests here are evidence for or against a hypothesis, not proof.
 */
import { rsi, sma } from "../market-history.ts";
import { mean, round, seededRandom, stdev } from "./stats.ts";

export type Condition =
  | { kind: "BREAKOUT"; lookback: number }
  | { kind: "VOLUME_SURGE"; multiple: number; lookback: number }
  | { kind: "RSI_BELOW"; level: number; period: number }
  | { kind: "RSI_ABOVE"; level: number; period: number }
  | { kind: "MA_CROSS_UP"; fast: number; slow: number }
  | { kind: "ABOVE_MA"; period: number }
  | { kind: "BELOW_MA"; period: number }
  | { kind: "GAP_UP"; pct: number }
  | { kind: "GAP_DOWN"; pct: number }
  | { kind: "RETURN_ABOVE"; lookback: number; pct: number }
  | { kind: "RETURN_BELOW"; lookback: number; pct: number }
  | { kind: "OUTPERFORM_SECTOR"; lookback: number };

export type MarketFilter = { kind: "INDEX_ABOVE_MA"; period: number; proxy_for: string };

export type StrategySpec = {
  hypothesis: string;
  universe: { description: string; sector: string | null; liquid_only: boolean };
  entry: Condition[];
  market_filter: MarketFilter[];
  exit: { holding_days: number; stop_pct: number | null; target_pct: number | null };
  costs: { round_trip_pct: number; slippage_bps: number };
  survivorship: string;
  corporate_actions: string;
  split: { train: number; validation: number; test: number };
  required_data: string[];
  falsification: string[];
  assumptions: string[];
  unparsed: string[];
};

export const SECTOR_SYNONYMS: [RegExp, string][] = [
  [/\b(bank|banks|banking|financial|financials|nbfc|insurance)\b/, "Financial Services"],
  [
    /\b(it (?:stocks?|sector|companies|names|shares)|tech|technology|software)\b/,
    "Information Technology",
  ],
  [/\b(pharma|healthcare|hospital|hospitals)\b/, "Healthcare"],
  [/\b(auto|autos|automobile|automobiles)\b/, "Automobile and Auto Components"],
  [/\b(fmcg|consumer staples)\b/, "Fast Moving Consumer Goods"],
  [/\b(metal|metals|mining|steel)\b/, "Metals & Mining"],
  [/\b(oil|gas|energy)\b/, "Oil Gas & Consumable Fuels"],
  [/\b(power|utilities|utility)\b/, "Power"],
  [/\b(cement|construction materials)\b/, "Construction Materials"],
];

const describe: Record<Condition["kind"], (c: never) => string> = {
  BREAKOUT: (c: { lookback: number }) =>
    `Close above the highest high of the prior ${c.lookback} sessions`,
  VOLUME_SURGE: (c: { multiple: number; lookback: number }) =>
    `Volume at least ${c.multiple}× its ${c.lookback}-session average`,
  RSI_BELOW: (c: { level: number; period: number }) => `RSI(${c.period}) below ${c.level}`,
  RSI_ABOVE: (c: { level: number; period: number }) => `RSI(${c.period}) above ${c.level}`,
  MA_CROSS_UP: (c: { fast: number; slow: number }) =>
    `${c.fast}-session SMA crosses above the ${c.slow}-session SMA`,
  ABOVE_MA: (c: { period: number }) => `Close above its ${c.period}-session SMA`,
  BELOW_MA: (c: { period: number }) => `Close below its ${c.period}-session SMA`,
  GAP_UP: (c: { pct: number }) => `Opens at least ${c.pct}% above the prior close`,
  GAP_DOWN: (c: { pct: number }) => `Opens at least ${c.pct}% below the prior close`,
  RETURN_ABOVE: (c: { lookback: number; pct: number }) =>
    `${c.lookback}-session return above ${c.pct}%`,
  RETURN_BELOW: (c: { lookback: number; pct: number }) =>
    `${c.lookback}-session return below ${c.pct}%`,
  OUTPERFORM_SECTOR: (c: { lookback: number }) =>
    `${c.lookback}-session return above the average of its sector peers`,
};

export function describeCondition(condition: Condition): string {
  return (describe[condition.kind] as (c: Condition) => string)(condition);
}

const num = (value: string | undefined, fallback: number) => {
  const parsed = value == null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Deterministic hypothesis compiler. */
export function compileHypothesis(text: string, roundTripPct: number): StrategySpec {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const entry: Condition[] = [];
  const filters: MarketFilter[] = [];
  const assumptions: string[] = [];
  const matched: string[] = [];
  const hit = (re: RegExp) => {
    const m = t.match(re);
    if (m) matched.push(m[0]);
    return m;
  };

  const breakout = hit(
    /(?:(\d+)[- ](?:day|session|week)[- ])?(?:high[- ]volume )?break ?outs?(?: above (?:the )?(\d+)[- ](?:day|session) high)?/,
  );
  if (breakout) {
    const lookback = num(breakout[2] ?? breakout[1], 20);
    entry.push({ kind: "BREAKOUT", lookback });
    if (!breakout[1] && !breakout[2])
      assumptions.push("Breakout lookback defaulted to 20 sessions.");
  }
  const volume = hit(
    /high[- ]volume|volume (?:surge|spike)|volume (?:above|over|>) ?(\d+(?:\.\d+)?)x|(\d+(?:\.\d+)?)x (?:average )?volume/,
  );
  if (volume) {
    const multiple = num(volume[1] ?? volume[2], 1.5);
    entry.push({ kind: "VOLUME_SURGE", multiple, lookback: 20 });
    if (!volume[1] && !volume[2])
      assumptions.push("High volume defined as at least 1.5× the 20-session average.");
  }
  const rsiBelow = hit(/rsi (?:is )?(?:below|under|<) ?(\d+)/);
  if (rsiBelow) entry.push({ kind: "RSI_BELOW", level: num(rsiBelow[1], 30), period: 14 });
  else if (hit(/oversold/)) {
    entry.push({ kind: "RSI_BELOW", level: 30, period: 14 });
    assumptions.push("Oversold defined as RSI(14) below 30.");
  }
  const rsiAbove = hit(/rsi (?:is )?(?:above|over|>) ?(\d+)/);
  if (rsiAbove) entry.push({ kind: "RSI_ABOVE", level: num(rsiAbove[1], 70), period: 14 });
  else if (hit(/overbought/)) {
    entry.push({ kind: "RSI_ABOVE", level: 70, period: 14 });
    assumptions.push("Overbought defined as RSI(14) above 70.");
  }
  if (hit(/golden cross/)) {
    entry.push({ kind: "MA_CROSS_UP", fast: 50, slow: 200 });
    assumptions.push(
      "Golden cross is the 50/200-session SMA cross; one year of history leaves few signals.",
    );
  }
  const cross = hit(
    /(\d+)[- ](?:day|session) (?:sma|ma|moving average) cross(?:es)? (?:above|over) (?:the )?(\d+)/,
  );
  if (cross) entry.push({ kind: "MA_CROSS_UP", fast: num(cross[1], 20), slow: num(cross[2], 50) });
  const above = hit(
    /(?:stock|price|close)?s? ?above (?:its |their |the )?(\d+)[- ](?:day|session) (?:sma|ma|moving average)/,
  );
  if (above) entry.push({ kind: "ABOVE_MA", period: num(above[1], 50) });
  const below = hit(
    /below (?:its |their |the )?(\d+)[- ](?:day|session) (?:sma|ma|moving average)/,
  );
  if (below) entry.push({ kind: "BELOW_MA", period: num(below[1], 50) });
  const gapUp = hit(/gaps? up(?: (?:by |of )?(?:at least )?(\d+(?:\.\d+)?)%)?/);
  if (gapUp) entry.push({ kind: "GAP_UP", pct: num(gapUp[1], 2) });
  const gapDown = hit(/gaps? down(?: (?:by |of )?(?:at least )?(\d+(?:\.\d+)?)%)?/);
  if (gapDown) entry.push({ kind: "GAP_DOWN", pct: num(gapDown[1], 2) });
  const fallen = hit(
    /(?:fall(?:en)?|drop(?:ped)?|decline[ds]?|down) (?:by |more than |at least )?(\d+(?:\.\d+)?)% (?:in|over) (?:the )?(?:last |past )?(\d+) (?:days|sessions)/,
  );
  if (fallen)
    entry.push({ kind: "RETURN_BELOW", lookback: num(fallen[2], 5), pct: -num(fallen[1], 3) });
  else if (hit(/pull ?back|\bdips?\b/)) {
    entry.push({ kind: "RETURN_BELOW", lookback: 5, pct: -3 });
    assumptions.push("Pullback defined as a 5-session return below −3%.");
  }
  const risen = hit(
    /(?:rise[ns]?|rallied|gain(?:ed)?|up) (?:by |more than |at least )?(\d+(?:\.\d+)?)% (?:in|over) (?:the )?(?:last |past )?(\d+) (?:days|sessions)/,
  );
  if (risen)
    entry.push({ kind: "RETURN_ABOVE", lookback: num(risen[2], 20), pct: num(risen[1], 5) });
  else if (hit(/\bmomentum\b/)) {
    entry.push({ kind: "RETURN_ABOVE", lookback: 20, pct: 5 });
    assumptions.push("Momentum defined as a 20-session return above 5%.");
  }
  if (hit(/outperform(?:s|ing)? (?:their |its |the )?sector/)) {
    entry.push({ kind: "OUTPERFORM_SECTOR", lookback: 20 });
    assumptions.push(
      "Sector outperformance measured over 20 sessions against current NIFTY 50 sector peers.",
    );
  }
  if (hit(/breadth (?:is )?(?:positive|strong|improving)|positive breadth/)) {
    filters.push({ kind: "INDEX_ABOVE_MA", period: 50, proxy_for: "positive market breadth" });
    assumptions.push(
      "Historical breadth is not available, so 'positive breadth' is proxied by NIFTY 50 closing above its 50-session SMA.",
    );
  } else if (hit(/market (?:is )?(?:up|bullish|in an uptrend|trending up)|nifty (?:is )?above/)) {
    filters.push({ kind: "INDEX_ABOVE_MA", period: 50, proxy_for: "bullish market" });
    assumptions.push("Bullish market defined as NIFTY 50 above its 50-session SMA.");
  }

  const hold = hit(/(?:hold|holding|exit after|for) (?:for )?(\d+) (?:trading )?(?:days|sessions)/);
  const stop = hit(/(\d+(?:\.\d+)?)% stop|stop(?:[- ]loss)? (?:of |at )?(\d+(?:\.\d+)?)%/);
  const target = hit(
    /(\d+(?:\.\d+)?)% (?:target|profit)|(?:target|take profit) (?:of |at )?(\d+(?:\.\d+)?)%/,
  );
  if (!hold) assumptions.push("Holding period defaulted to 10 sessions.");

  let sector: string | null = null;
  for (const [re, name] of SECTOR_SYNONYMS)
    if (re.test(t)) {
      sector = name;
      matched.push(name.toLowerCase());
      break;
    }
  const liquid = /\bliquid\b/.test(t);
  if (liquid)
    assumptions.push("Liquid means the 30 most-traded NIFTY 50 names by 20-session average value.");

  const clauses = text
    .split(/,|;|\bbut\b|\bonly\b|\bwhen\b|\bafter\b|\band\b|\bthat\b|\bwhere\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 3);
  const known =
    /find|stocks?|nse|nifty|liquid|universe|buy|enter|long|exit|hold|stop|target|break|volume|rsi|sma|moving|cross|gap|sector|breadth|market|momentum|pullback|dip|oversold|overbought|outperform|fall|drop|rise|gain|day|session|high|positive|\d/i;
  const unparsed = clauses.filter((c) => !known.test(c));
  if (!entry.length)
    unparsed.unshift("No entry condition was recognised; add a rule such as 'RSI below 30'.");

  return {
    hypothesis: text.trim(),
    universe: {
      description: `${liquid ? "Liquid " : ""}NSE NIFTY 50 ${sector ? `${sector} ` : ""}constituents (current list)`,
      sector,
      liquid_only: liquid,
    },
    entry,
    market_filter: filters,
    exit: {
      holding_days: Math.min(60, num(hold?.[1], 10)),
      stop_pct: stop ? num(stop[1] ?? stop[2], 5) : null,
      target_pct: target ? num(target[1] ?? target[2], 10) : null,
    },
    costs: { round_trip_pct: roundTripPct, slippage_bps: 5 },
    survivorship:
      "Universe is today's NIFTY 50 list applied to past dates. Stocks that left the index are missing, which biases results upward.",
    corporate_actions:
      "Provider daily bars are used as delivered. Unadjusted splits or bonuses would appear as gaps; sessions with an overnight move beyond ±20% are excluded from entries.",
    split: { train: 0.6, validation: 0.2, test: 0.2 },
    required_data: [
      "Daily OHLCV for each universe member (1 year, provider)",
      ...(filters.length ? ["NIFTY 50 daily closes"] : []),
      ...(entry.some((c) => c.kind === "OUTPERFORM_SECTOR")
        ? ["Sector membership (instrument master)"]
        : []),
    ],
    falsification: [
      "Net mean return per trade in the untouched test period must be positive.",
      "It must beat the unconditional same-horizon return of the universe (baseline).",
      "Placebo: random entries with identical exits must beat it less than 10% of the time.",
      "Walk-forward out-of-sample mean must be positive.",
      "Results must keep their sign across at least 60% of nearby parameter settings.",
      "At least 20 test trades are required before any conclusion.",
    ],
    assumptions,
    unparsed,
  };
}

// ------------------------------------------------------------------ backtest

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Trade = {
  symbol: string;
  entry_time: number;
  exit_time: number;
  entry: number;
  exit: number;
  gross: number;
  net: number;
  reason: "TIME" | "STOP" | "TARGET";
};

type Prepared = {
  symbol: string;
  sector: string;
  bars: Bar[];
  rsi14: (number | null)[];
  smas: Map<number, (number | null)[]>;
};

export type Universe = { symbol: string; sector: string; bars: Bar[] }[];

function prepare(universe: Universe): Prepared[] {
  return universe.map((u) => ({
    symbol: u.symbol,
    sector: u.sector,
    bars: u.bars,
    rsi14: rsi(
      u.bars.map((b) => b.close),
      14,
    ),
    smas: new Map(),
  }));
}

function smaOf(p: Prepared, period: number) {
  let series = p.smas.get(period);
  if (!series) {
    series = sma(
      p.bars.map((b) => b.close),
      period,
    );
    p.smas.set(period, series);
  }
  return series;
}

/** Scale the main numeric parameter of each condition (for sensitivity). */
export function scaleConditions(conditions: Condition[], factor: number): Condition[] {
  const int = (v: number) => Math.max(2, Math.round(v * factor));
  return conditions.map((c) => {
    switch (c.kind) {
      case "BREAKOUT":
        return { ...c, lookback: int(c.lookback) };
      case "VOLUME_SURGE":
        return { ...c, multiple: round(Math.max(1, 1 + (c.multiple - 1) * factor), 2) };
      case "RSI_BELOW":
        return { ...c, level: round(Math.min(50, c.level * factor), 1) };
      case "RSI_ABOVE":
        return {
          ...c,
          level: round(Math.max(50, Math.min(95, 100 - (100 - c.level) * factor)), 1),
        };
      case "MA_CROSS_UP":
        return { ...c, fast: int(c.fast), slow: Math.max(int(c.fast) + 1, int(c.slow)) };
      case "ABOVE_MA":
      case "BELOW_MA":
        return { ...c, period: int(c.period) };
      case "GAP_UP":
      case "GAP_DOWN":
        return { ...c, pct: round(c.pct * factor, 2) };
      case "RETURN_ABOVE":
      case "RETURN_BELOW":
        return { ...c, pct: round(c.pct * factor, 2) };
      case "OUTPERFORM_SECTOR":
        return { ...c, lookback: int(c.lookback) };
    }
  });
}

function conditionAt(
  c: Condition,
  p: Prepared,
  i: number,
  sectorReturn: (lookback: number) => number | null,
): boolean {
  const b = p.bars;
  const bar = b[i]!;
  switch (c.kind) {
    case "BREAKOUT": {
      if (i < c.lookback) return false;
      let high = -Infinity;
      for (let k = i - c.lookback; k < i; k++) high = Math.max(high, b[k]!.high);
      return bar.close > high;
    }
    case "VOLUME_SURGE": {
      if (i < c.lookback || bar.volume <= 0) return false;
      let sum = 0;
      for (let k = i - c.lookback; k < i; k++) sum += b[k]!.volume;
      return sum > 0 && bar.volume >= (c.multiple * sum) / c.lookback;
    }
    case "RSI_BELOW":
      return p.rsi14[i] != null && p.rsi14[i]! < c.level;
    case "RSI_ABOVE":
      return p.rsi14[i] != null && p.rsi14[i]! > c.level;
    case "MA_CROSS_UP": {
      const fast = smaOf(p, c.fast);
      const slow = smaOf(p, c.slow);
      const f0 = fast[i - 1];
      const s0 = slow[i - 1];
      const f1 = fast[i];
      const s1 = slow[i];
      return f0 != null && s0 != null && f1 != null && s1 != null && f0 <= s0 && f1 > s1;
    }
    case "ABOVE_MA": {
      const s = smaOf(p, c.period)[i];
      return s != null && bar.close > s;
    }
    case "BELOW_MA": {
      const s = smaOf(p, c.period)[i];
      return s != null && bar.close < s;
    }
    case "GAP_UP":
      return i > 0 && bar.open >= b[i - 1]!.close * (1 + c.pct / 100);
    case "GAP_DOWN":
      return i > 0 && bar.open <= b[i - 1]!.close * (1 - c.pct / 100);
    case "RETURN_ABOVE":
      return i >= c.lookback && (bar.close / b[i - c.lookback]!.close - 1) * 100 > c.pct;
    case "RETURN_BELOW":
      return i >= c.lookback && (bar.close / b[i - c.lookback]!.close - 1) * 100 < c.pct;
    case "OUTPERFORM_SECTOR": {
      if (i < c.lookback) return false;
      const own = bar.close / b[i - c.lookback]!.close - 1;
      const peer = sectorReturn(c.lookback);
      return peer != null && own > peer;
    }
  }
}

const dayOf = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);

export type BacktestOptions = {
  conditions?: Condition[];
  /** Restrict entries to [from, to) unix seconds. */
  from?: number;
  to?: number;
  /** Placebo mode: replace signals with random entries at this per-bar rate. */
  placebo?: { rate: number; seed: number };
};

/** Event backtest: decide at close t, enter at open t+1, one position per symbol. */
export function backtest(
  spec: StrategySpec,
  universe: Universe,
  index: Bar[] | null,
  options: BacktestOptions = {},
): Trade[] {
  const prepared = prepare(universe);
  const conditions = options.conditions ?? spec.entry;
  const indexByDay = new Map((index ?? []).map((b, i) => [dayOf(b.time), i]));
  const indexSma = new Map<number, (number | null)[]>();
  const marketOk = (time: number) =>
    spec.market_filter.every((f) => {
      const i = indexByDay.get(dayOf(time));
      if (i == null || !index) return false;
      let s = indexSma.get(f.period);
      if (!s) {
        s = sma(
          index.map((b) => b.close),
          f.period,
        );
        indexSma.set(f.period, s);
      }
      return s[i] != null && index[i]!.close > s[i]!;
    });
  // Sector peer returns by day for OUTPERFORM_SECTOR.
  const bySector = new Map<string, Prepared[]>();
  for (const p of prepared) bySector.set(p.sector, [...(bySector.get(p.sector) ?? []), p]);
  const dayIndex = new Map(
    prepared.map((p) => [p.symbol, new Map(p.bars.map((b, i) => [dayOf(b.time), i]))]),
  );
  const random = options.placebo ? seededRandom(options.placebo.seed) : null;
  const slip = spec.costs.slippage_bps / 10_000;
  const cost = spec.costs.round_trip_pct / 100;
  const trades: Trade[] = [];
  for (const p of prepared) {
    const bars = p.bars;
    let i = 1;
    while (i < bars.length - 1) {
      const bar = bars[i]!;
      const inWindow =
        (options.from == null || bar.time >= options.from) &&
        (options.to == null || bar.time < options.to);
      const jump = Math.abs(bar.open / bars[i - 1]!.close - 1) > 0.2;
      let signal = false;
      if (inWindow && !jump) {
        if (random) signal = random() < options.placebo!.rate;
        else {
          const peers = (bySector.get(p.sector) ?? []).filter((x) => x !== p);
          const sectorReturn = (lookback: number) => {
            const values = peers
              .map((peer) => {
                const k = dayIndex.get(peer.symbol)!.get(dayOf(bar.time));
                return k != null && k >= lookback
                  ? peer.bars[k]!.close / peer.bars[k - lookback]!.close - 1
                  : null;
              })
              .filter((v): v is number => v != null);
            return values.length ? values.reduce((t, v) => t + v, 0) / values.length : null;
          };
          signal =
            conditions.length > 0 &&
            conditions.every((c) => conditionAt(c, p, i, sectorReturn)) &&
            marketOk(bar.time);
        }
      }
      if (!signal) {
        i++;
        continue;
      }
      const entryBar = bars[i + 1]!;
      const entry = entryBar.open * (1 + slip);
      const stop = spec.exit.stop_pct != null ? entry * (1 - spec.exit.stop_pct / 100) : null;
      const target = spec.exit.target_pct != null ? entry * (1 + spec.exit.target_pct / 100) : null;
      const last = Math.min(bars.length - 1, i + spec.exit.holding_days);
      let exit = bars[last]!.close * (1 - slip);
      let exitIndex = last;
      let reason: Trade["reason"] = "TIME";
      for (let k = i + 1; k <= last; k++) {
        const b = bars[k]!;
        // Conservative ordering: when both levels fall inside one bar, the stop wins.
        if (stop != null && b.low <= stop) {
          exit = Math.min(b.open, stop) * (1 - slip);
          exitIndex = k;
          reason = "STOP";
          break;
        }
        if (target != null && b.high >= target) {
          exit = Math.max(b.open, target) * (1 - slip);
          exitIndex = k;
          reason = "TARGET";
          break;
        }
      }
      const gross = exit / entry - 1;
      trades.push({
        symbol: p.symbol,
        entry_time: entryBar.time,
        exit_time: bars[exitIndex]!.time,
        entry,
        exit,
        gross,
        net: gross - cost,
        reason,
      });
      i = exitIndex + 1;
    }
  }
  return trades.sort((a, b) => a.entry_time - b.entry_time);
}

export type SegmentStats = {
  trades: number;
  mean_net: number | null;
  mean_gross: number | null;
  hit_rate: number | null;
  t_stat: number | null;
};

export function segmentStats(trades: Trade[]): SegmentStats {
  const net = trades.map((t) => t.net);
  const m = mean(net);
  const s = stdev(net);
  return {
    trades: trades.length,
    mean_net: m,
    mean_gross: mean(trades.map((t) => t.gross)),
    hit_rate: trades.length ? trades.filter((t) => t.net > 0).length / trades.length : null,
    t_stat: m != null && s != null && s > 0 ? (m / s) * Math.sqrt(trades.length) : null,
  };
}

/** Unconditional same-horizon return of every eligible universe bar, after costs. */
export function baselineReturn(spec: StrategySpec, universe: Universe, from?: number, to?: number) {
  const values: number[] = [];
  for (const u of universe)
    for (let i = 1; i + spec.exit.holding_days < u.bars.length; i++) {
      const bar = u.bars[i]!;
      if ((from != null && bar.time < from) || (to != null && bar.time >= to)) continue;
      values.push(
        u.bars[i + spec.exit.holding_days]!.close / u.bars[i + 1]!.open -
          1 -
          spec.costs.round_trip_pct / 100,
      );
    }
  return mean(values);
}

export type Verdict = "PROMOTE" | "SHADOW" | "INCONCLUSIVE" | "REJECT";

export type Evaluation = {
  periods: { train: [number, number]; validation: [number, number]; test: [number, number] };
  segments: { train: SegmentStats; validation: SegmentStats; test: SegmentStats };
  baseline: { test: number | null; all: number | null; beats: boolean | null };
  walk_forward: {
    folds: { from: number; to: number; factor: number; mean_net: number | null; trades: number }[];
    oos_mean: number | null;
  };
  costs: { gross: number | null; net: number | null; cost_eaten_share: number | null };
  regimes: { regime: string; stats: SegmentStats }[];
  placebo: {
    runs: number;
    actual: number | null;
    p_value: number | null;
    placebo_mean: number | null;
  };
  sensitivity: { factor: number; mean_net: number | null; trades: number }[];
  sensitivity_consistency: number | null;
  shadow: { since: string | null; signals: number; mean_net: number | null };
  verdict: Verdict;
  reasons: string[];
};

export function evaluateStrategy(
  spec: StrategySpec,
  universe: Universe,
  index: Bar[] | null,
  regimeAt: (iso: string) => string,
  shadowSince: string | null = null,
  placeboRuns = 100,
): Evaluation {
  const times = [...new Set(universe.flatMap((u) => u.bars.map((b) => b.time)))].sort(
    (a, b) => a - b,
  );
  const first = times[0] ?? 0;
  const last = (times.at(-1) ?? 0) + 1;
  const at = (q: number) =>
    times[Math.min(times.length - 1, Math.floor(q * (times.length - 1)))] ?? first;
  const trainEnd = at(spec.split.train);
  const validationEnd = at(spec.split.train + spec.split.validation);
  const all = backtest(spec, universe, index);
  const inRange = (from: number, to: number) =>
    all.filter((t) => t.entry_time >= from && t.entry_time < to);
  const train = segmentStats(inRange(first, trainEnd));
  const validation = segmentStats(inRange(trainEnd, validationEnd));
  const testTrades = inRange(validationEnd, last);
  const test = segmentStats(testTrades);
  const baselineTest = baselineReturn(spec, universe, validationEnd, last);
  const baselineAll = baselineReturn(spec, universe);

  // Walk-forward: choose the best parameter scale on all prior data, apply to the next fold.
  const factors = [0.5, 0.75, 1, 1.5, 2];
  const foldEdges = [0.4, 0.55, 0.7, 0.85, 1].map((q) => (q === 1 ? last : at(q)));
  const folds: Evaluation["walk_forward"]["folds"] = [];
  for (let f = 0; f < foldEdges.length - 1; f++) {
    const trainTo = foldEdges[f]!;
    const testTo = foldEdges[f + 1]!;
    let best = 1;
    let bestMean = -Infinity;
    for (const factor of factors) {
      const m = segmentStats(
        backtest(spec, universe, index, {
          conditions: scaleConditions(spec.entry, factor),
          to: trainTo,
        }),
      ).mean_net;
      if (m != null && m > bestMean) {
        bestMean = m;
        best = factor;
      }
    }
    const oos = segmentStats(
      backtest(spec, universe, index, {
        conditions: scaleConditions(spec.entry, best),
        from: trainTo,
        to: testTo,
      }),
    );
    folds.push({
      from: trainTo,
      to: testTo,
      factor: best,
      mean_net: oos.mean_net,
      trades: oos.trades,
    });
  }
  const oosTrades = folds.reduce((t, f) => t + f.trades, 0);
  const oosMean = oosTrades
    ? folds.reduce((t, f) => t + (f.mean_net ?? 0) * f.trades, 0) / oosTrades
    : null;

  // Regimes at entry.
  const regimeGroups = new Map<string, Trade[]>();
  for (const trade of all) {
    const regime = regimeAt(new Date(trade.entry_time * 1000).toISOString());
    regimeGroups.set(regime, [...(regimeGroups.get(regime) ?? []), trade]);
  }

  // Placebo: same exits, random entries at the observed signal rate.
  const eligible = universe.reduce((t, u) => t + Math.max(0, u.bars.length - 2), 0);
  const rate = eligible ? Math.min(0.5, (all.length * (1 + spec.exit.holding_days)) / eligible) : 0;
  const actual = segmentStats(all).mean_net;
  const placeboMeans: number[] = [];
  if (all.length >= 5 && rate > 0)
    for (let run = 0; run < placeboRuns; run++) {
      const m = segmentStats(
        backtest(spec, universe, index, { placebo: { rate, seed: 1000 + run } }),
      ).mean_net;
      if (m != null) placeboMeans.push(m);
    }
  const pValue =
    actual != null && placeboMeans.length
      ? (placeboMeans.filter((m) => m >= actual).length + 1) / (placeboMeans.length + 1)
      : null;

  const sensitivity = factors.map((factor) => {
    const s = segmentStats(
      backtest(spec, universe, index, { conditions: scaleConditions(spec.entry, factor) }),
    );
    return { factor, mean_net: s.mean_net, trades: s.trades };
  });
  const measured = sensitivity.filter((s) => s.mean_net != null && s.trades >= 5);
  const consistency =
    actual != null && measured.length
      ? measured.filter((s) => Math.sign(s.mean_net!) === Math.sign(actual)).length /
        measured.length
      : null;

  const shadowFrom = shadowSince ? Date.parse(shadowSince) / 1000 : null;
  const shadowTrades = shadowFrom == null ? [] : all.filter((t) => t.entry_time >= shadowFrom);

  const reasons: string[] = [];
  let verdict: Verdict;
  if (test.trades < 20) {
    verdict = "INCONCLUSIVE";
    reasons.push(`Only ${test.trades} trades in the test period; at least 20 are required.`);
  } else {
    const failures: string[] = [];
    if (!(test.mean_net != null && test.mean_net > 0))
      failures.push("Test-period net mean is not positive.");
    if (!(baselineTest != null && test.mean_net != null && test.mean_net > baselineTest))
      failures.push("Does not beat the unconditional baseline in the test period.");
    if (!(pValue != null && pValue < 0.1))
      failures.push(
        `Placebo p-value ${pValue == null ? "unavailable" : round(pValue, 2)} is not below 0.10.`,
      );
    if (!(oosMean != null && oosMean > 0))
      failures.push("Walk-forward out-of-sample mean is not positive.");
    if (!(consistency != null && consistency >= 0.6))
      failures.push("Result changes sign across nearby parameters.");
    if (failures.length) {
      verdict = "REJECT";
      reasons.push(...failures);
    } else if (shadowTrades.length < 10) {
      verdict = "SHADOW";
      reasons.push(
        `Passed every historical test. Keep it in shadow paper mode until at least 10 live signals mature (${shadowTrades.length} so far).`,
      );
    } else if ((segmentStats(shadowTrades).mean_net ?? 0) > 0) {
      verdict = "PROMOTE";
      reasons.push(
        "Passed every historical test and the shadow run remained positive after costs.",
      );
    } else {
      verdict = "REJECT";
      reasons.push(
        "Passed historical tests but the shadow paper run was not positive after costs.",
      );
    }
  }

  return {
    periods: {
      train: [first, trainEnd],
      validation: [trainEnd, validationEnd],
      test: [validationEnd, last],
    },
    segments: { train, validation, test },
    baseline: {
      test: baselineTest,
      all: baselineAll,
      beats: baselineTest == null || test.mean_net == null ? null : test.mean_net > baselineTest,
    },
    walk_forward: { folds, oos_mean: oosMean },
    costs: {
      gross: segmentStats(all).mean_gross,
      net: actual,
      cost_eaten_share: all.length
        ? all.filter((t) => t.gross > 0 && t.net <= 0).length / all.length
        : null,
    },
    regimes: [...regimeGroups.entries()].map(([regime, trades]) => ({
      regime,
      stats: segmentStats(trades),
    })),
    placebo: {
      runs: placeboMeans.length,
      actual,
      p_value: pValue,
      placebo_mean: mean(placeboMeans),
    },
    sensitivity,
    sensitivity_consistency: consistency,
    shadow: {
      since: shadowSince,
      signals: shadowTrades.length,
      mean_net: segmentStats(shadowTrades).mean_net,
    },
    verdict,
    reasons,
  };
}

/** Liquidity filter: top `n` symbols by 20-session average traded value. */
export function liquidSubset(universe: Universe, n = 30): Universe {
  return [...universe]
    .map((u) => ({
      u,
      value: mean(u.bars.slice(-20).map((b) => b.close * b.volume)) ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map((x) => x.u);
}
