/**
 * Market-regime map and analog engine. Each historical session is described
 * by observable features computed from data up to that session only. The
 * current state is matched to its nearest historical states, and the outcome
 * after those analogs is reported as a distribution, never a prediction.
 */
import { correlation, distribution, mean, stdev, type Distribution } from "./stats.ts";

export type DailyBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FeatureKey =
  | "momentum"
  | "volatility"
  | "trend"
  | "gaps"
  | "liquidity"
  | "implied_vol"
  | "leadership"
  | "correlation";

export const FEATURE_LABELS: Record<FeatureKey, { label: string; formula: string }> = {
  momentum: { label: "Momentum", formula: "NIFTY 50 20-session return" },
  volatility: { label: "Volatility", formula: "Std. dev. of 20 daily NIFTY returns × √252" },
  trend: { label: "Trend", formula: "NIFTY close ÷ 50-session SMA − 1" },
  gaps: { label: "Gap behaviour", formula: "Mean |open ÷ prior close − 1| over 10 sessions" },
  liquidity: { label: "Liquidity", formula: "NIFTY 20-session ÷ 60-session average volume" },
  implied_vol: { label: "Implied volatility", formula: "INDIA VIX close" },
  leadership: {
    label: "Sector leadership",
    formula: "BANK NIFTY 20-session return − NIFTY 50 20-session return",
  },
  correlation: {
    label: "Index correlation",
    formula: "20-session correlation of NIFTY 50 and BANK NIFTY daily returns",
  },
};

export type FeatureRow = {
  time: number;
  index: number;
  values: Partial<Record<FeatureKey, number>>;
};

function alignByTime(bars: DailyBar[] | undefined) {
  const map = new Map<string, DailyBar>();
  for (const bar of bars ?? []) map.set(new Date(bar.time * 1000).toISOString().slice(0, 10), bar);
  return map;
}

const dayKey = (bar: DailyBar) => new Date(bar.time * 1000).toISOString().slice(0, 10);

/** Point-in-time features for each NIFTY session with at least 60 prior sessions. */
export function featureHistory(
  nifty: DailyBar[],
  bank?: DailyBar[],
  vix?: DailyBar[],
): FeatureRow[] {
  const bankByDay = alignByTime(bank);
  const vixByDay = alignByTime(vix);
  const closes = nifty.map((b) => b.close);
  const rows: FeatureRow[] = [];
  const volumesKnown = nifty.filter((b) => b.volume > 0).length > nifty.length * 0.8;
  for (let i = 60; i < nifty.length; i++) {
    const bar = nifty[i]!;
    const values: Partial<Record<FeatureKey, number>> = {};
    values.momentum = closes[i]! / closes[i - 20]! - 1;
    const returns = closes
      .slice(i - 20, i + 1)
      .map((c, k, xs) => (k ? c / xs[k - 1]! - 1 : 0))
      .slice(1);
    const vol = stdev(returns);
    if (vol != null) values.volatility = vol * Math.sqrt(252);
    const sma50 = closes.slice(i - 49, i + 1).reduce((t, v) => t + v, 0) / 50;
    values.trend = closes[i]! / sma50 - 1;
    const gaps = nifty.slice(i - 9, i + 1).map((b, k) => {
      const prior = nifty[i - 9 + k - 1];
      return prior ? Math.abs(b.open / prior.close - 1) : 0;
    });
    values.gaps = gaps.reduce((t, v) => t + v, 0) / gaps.length;
    if (volumesKnown) {
      const v20 = mean(nifty.slice(i - 19, i + 1).map((b) => b.volume));
      const v60 = mean(nifty.slice(i - 59, i + 1).map((b) => b.volume));
      if (v20 && v60) values.liquidity = v20 / v60;
    }
    const vixBar = vixByDay.get(dayKey(bar));
    if (vixBar) values.implied_vol = vixBar.close;
    const bankNow = bankByDay.get(dayKey(bar));
    const bankThen = bankByDay.get(dayKey(nifty[i - 20]!));
    if (bankNow && bankThen)
      values.leadership = bankNow.close / bankThen.close - 1 - values.momentum;
    const pairs: [number, number][] = [];
    for (let k = i - 19; k <= i; k++) {
      const a = bankByDay.get(dayKey(nifty[k]!));
      const b = bankByDay.get(dayKey(nifty[k - 1]!));
      if (a && b) pairs.push([closes[k]! / closes[k - 1]! - 1, a.close / b.close - 1]);
    }
    if (pairs.length >= 15) {
      const c = correlation(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1]),
      );
      if (c != null) values.correlation = c;
    }
    rows.push({ time: bar.time, index: i, values });
  }
  return rows;
}

export type Analog = {
  time: number;
  distance: number;
  forward_return: number;
  values: Partial<Record<FeatureKey, number>>;
};

export type AnalogResult = {
  current: FeatureRow | null;
  features: FeatureKey[];
  analogs: Analog[];
  forward: Distribution;
  unconditional: Distribution;
  horizon: number;
  /** Map coordinates for every history row: risk appetite (x) vs stress (y). */
  map: { time: number; x: number; y: number; analog: boolean; current: boolean }[];
};

/**
 * Nearest historical states to the latest session over the features present
 * in both, standardised by their historical spread. Analogs are spaced at least
 * `spacing` sessions apart and must have a fully observed forward window.
 */
export function findAnalogs(
  nifty: DailyBar[],
  rows: FeatureRow[],
  options: { k?: number; horizon?: number; spacing?: number } = {},
): AnalogResult {
  const k = options.k ?? 14;
  const horizon = options.horizon ?? 5;
  const spacing = options.spacing ?? 5;
  const current = rows.at(-1) ?? null;
  const empty: AnalogResult = {
    current,
    features: [],
    analogs: [],
    forward: distribution([]),
    unconditional: distribution([]),
    horizon,
    map: [],
  };
  if (!current) return empty;
  const keys = (Object.keys(current.values) as FeatureKey[]).filter(
    (key) => rows.filter((r) => r.values[key] != null).length >= rows.length * 0.6,
  );
  const scale: Partial<Record<FeatureKey, { m: number; s: number }>> = {};
  for (const key of keys) {
    const xs = rows.map((r) => r.values[key]).filter((v): v is number => v != null);
    const m = mean(xs);
    const s = stdev(xs);
    if (m != null && s != null && s > 0) scale[key] = { m, s };
  }
  const usable = keys.filter((key) => scale[key]);
  const z = (row: FeatureRow, key: FeatureKey) => {
    const v = row.values[key];
    const sc = scale[key]!;
    return v == null ? null : (v - sc.m) / sc.s;
  };
  const forward = (row: FeatureRow) => {
    const exit = nifty[row.index + horizon];
    return exit ? exit.close / nifty[row.index]!.close - 1 : null;
  };
  const candidates = rows
    .filter((row) => row.index + horizon < nifty.length && row.index < current.index - horizon)
    .map((row) => {
      let sum = 0;
      let used = 0;
      for (const key of usable) {
        const a = z(row, key);
        const b = z(current, key);
        if (a == null || b == null) continue;
        sum += (a - b) ** 2;
        used++;
      }
      return { row, distance: used ? Math.sqrt(sum / used) : Number.POSITIVE_INFINITY };
    })
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance);
  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    if (chosen.length >= k) break;
    if (chosen.every((c) => Math.abs(c.row.index - candidate.row.index) >= spacing))
      chosen.push(candidate);
  }
  const analogs = chosen.map(({ row, distance }) => ({
    time: row.time,
    distance,
    forward_return: forward(row)!,
    values: row.values,
  }));
  const chosenTimes = new Set(analogs.map((a) => a.time));
  const axis = (row: FeatureRow, positive: FeatureKey[], negative: FeatureKey[]) => {
    const parts = [
      ...positive.map((key) => (scale[key] ? z(row, key) : null)),
      ...negative.map((key) => (scale[key] ? (z(row, key) == null ? null : -z(row, key)!) : null)),
    ].filter((v): v is number => v != null);
    return parts.length ? parts.reduce((t, v) => t + v, 0) / parts.length : 0;
  };
  return {
    current,
    features: usable,
    analogs,
    forward: distribution(analogs.map((a) => a.forward_return)),
    unconditional: distribution(
      rows
        .filter((row) => row.index + horizon < nifty.length)
        .map((row) => forward(row))
        .filter((v): v is number => v != null),
    ),
    horizon,
    map: rows.map((row) => ({
      time: row.time,
      x: axis(row, ["momentum", "trend"], []),
      y: axis(row, ["volatility", "implied_vol", "gaps"], []),
      analog: chosenTimes.has(row.time),
      current: row === current,
    })),
  };
}

/** Plain-language summary that stresses spread, not direction. */
export function analogSentence(result: AnalogResult) {
  const f = result.forward;
  if (!f.n) return "Not enough history to find comparable market states.";
  const pct = (v: number | null) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);
  return `The current market state resembles these ${f.n} prior states. In those cases, the next ${result.horizon} sessions ranged from ${pct(f.p5)} to ${pct(f.p95)} (middle half ${pct(f.p25)} to ${pct(f.p75)}); ${Math.round((f.positive_share ?? 0) * 100)}% were positive, against ${Math.round((result.unconditional.positive_share ?? 0) * 100)}% for all sessions.`;
}
