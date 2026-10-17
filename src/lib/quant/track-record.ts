/**
 * Calibrated track records for research forecasts. Replaces a single
 * "AI confidence" number with matured-forecast statistics per segment:
 * directional accuracy, Brier score, a constant baseline, abstention rate and
 * cost-adjusted outcome. Forecasts mature only once their horizon has passed
 * in observed price history; unmatured forecasts are counted, never scored.
 */
import { mean, round } from "./stats.ts";

export type Direction = "UP" | "DOWN" | "ABSTAIN";

export type Forecast = {
  id: string;
  symbol: string;
  as_of: string;
  /** Who made the call: committee, a human plan, or an initial thesis. */
  role: string;
  model_version: string;
  direction: Direction;
  /**
   * Stated probability that the direction is right, 0.5-1. Research opinion
   * strength is treated as this probability for scoring and labelled so.
   */
  probability: number | null;
  sector: string;
  liquidity: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  coverage: "FULL" | "PARTIAL" | "UNKNOWN";
};

export type Bar = { time: number; close: number };

export type Matured = Forecast & {
  horizon: number;
  realized_return: number;
  realized_up: boolean;
  regime: string;
  correct: boolean | null;
  cost_adjusted_return: number | null;
};

/**
 * Score forecasts at `horizon` sessions. The entry is the first close at or
 * after the forecast's as_of; the exit is `horizon` bars later.
 */
export function matureForecasts(
  forecasts: Forecast[],
  bars: Record<string, Bar[]>,
  horizon: number,
  regimeAt: (iso: string) => string,
  roundTripCost: number,
): { matured: Matured[]; pending: number; unpriced: number } {
  const matured: Matured[] = [];
  let pending = 0;
  let unpriced = 0;
  for (const forecast of forecasts) {
    const series = bars[forecast.symbol];
    if (!series?.length) {
      unpriced++;
      continue;
    }
    const at = Date.parse(forecast.as_of) / 1000;
    const start = series.findIndex((bar) => bar.time >= at);
    if (start < 0 || start + horizon >= series.length) {
      pending++;
      continue;
    }
    const entry = series[start]!.close;
    const exit = series[start + horizon]!.close;
    const realized = exit / entry - 1;
    const correct =
      forecast.direction === "ABSTAIN"
        ? null
        : forecast.direction === "UP"
          ? realized > 0
          : realized < 0;
    const directional =
      forecast.direction === "UP" ? realized : forecast.direction === "DOWN" ? -realized : null;
    matured.push({
      ...forecast,
      horizon,
      realized_return: realized,
      realized_up: realized > 0,
      regime: regimeAt(forecast.as_of),
      correct,
      cost_adjusted_return: directional == null ? null : directional - roundTripCost,
    });
  }
  return { matured, pending, unpriced };
}

export type TrackStats = {
  n: number;
  scored: number;
  abstentions: number;
  abstention_rate: number | null;
  accuracy: number | null;
  baseline_accuracy: number | null;
  beats_baseline: boolean | null;
  brier: number | null;
  baseline_brier: number | null;
  cost_adjusted_mean: number | null;
  calibration: { bucket: string; predicted: number; observed: number; n: number }[];
};

/** Statistics for one segment. Baseline: always forecast the majority direction "UP". */
export function trackStats(rows: Matured[]): TrackStats {
  const scored = rows.filter((r) => r.correct != null);
  const abstentions = rows.length - scored.length;
  const accuracy = scored.length ? scored.filter((r) => r.correct).length / scored.length : null;
  const baseline = scored.length
    ? scored.filter((r) => r.realized_up).length / scored.length
    : null;
  const probabilistic = scored.filter((r) => r.probability != null);
  const brier = probabilistic.length
    ? probabilistic.reduce((t, r) => t + (r.probability! - (r.correct ? 1 : 0)) ** 2, 0) /
      probabilistic.length
    : null;
  // Constant baseline: the observed hit rate as a fixed probability for every call.
  const hit = probabilistic.length
    ? probabilistic.filter((r) => r.correct).length / probabilistic.length
    : null;
  const baselineBrier = hit == null ? null : hit * (1 - hit);
  const buckets = [
    [0.5, 0.6],
    [0.6, 0.7],
    [0.7, 0.8],
    [0.8, 0.9],
    [0.9, 1.0001],
  ] as const;
  const calibration = buckets
    .map(([low, high]) => {
      const inBucket = probabilistic.filter((r) => r.probability! >= low && r.probability! < high);
      return {
        bucket: `${Math.round(low * 100)}–${Math.min(100, Math.round(high * 100))}%`,
        predicted: mean(inBucket.map((r) => r.probability!)) ?? (low + high) / 2,
        observed: inBucket.length ? inBucket.filter((r) => r.correct).length / inBucket.length : 0,
        n: inBucket.length,
      };
    })
    .filter((bucket) => bucket.n > 0);
  return {
    n: rows.length,
    scored: scored.length,
    abstentions,
    abstention_rate: rows.length ? abstentions / rows.length : null,
    accuracy,
    baseline_accuracy: baseline,
    beats_baseline: accuracy == null || baseline == null ? null : accuracy > baseline,
    brier: brier == null ? null : round(brier, 4),
    baseline_brier: baselineBrier == null ? null : round(baselineBrier, 4),
    cost_adjusted_mean: mean(
      rows.map((r) => r.cost_adjusted_return).filter((v): v is number => v != null),
    ),
    calibration,
  };
}

export type SegmentKey = "role" | "model_version" | "sector" | "liquidity" | "regime" | "coverage";

export function segment(rows: Matured[], key: SegmentKey) {
  const groups = new Map<string, Matured[]>();
  for (const row of rows) {
    const value = String(row[key]);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([value, group]) => ({ value, stats: trackStats(group) }))
    .sort((a, b) => b.stats.n - a.stats.n);
}

/** One plain sentence; no persuasive language, no single confidence score. */
export function trackSentence(rows: Matured[], horizon: number, minimumPerRegime = 5) {
  const stats = trackStats(rows);
  const regimes = segment(rows, "regime").filter((r) => r.stats.scored >= minimumPerRegime);
  const beating = regimes.filter((r) => r.stats.beats_baseline).length;
  if (!stats.n) return `No forecasts have matured at the ${horizon}-session horizon yet.`;
  return `This research configuration has ${stats.n} matured forecast${stats.n === 1 ? "" : "s"} at the ${horizon}-session horizon, ${
    regimes.length
      ? `performs better than the constant baseline in ${beating} of ${regimes.length} regime${regimes.length === 1 ? "" : "s"} with enough data`
      : "has too few forecasts per regime to compare against the baseline"
  }, and abstains on ${Math.round((stats.abstention_rate ?? 0) * 100)}% of cases.`;
}

/** Map a research action to a direction. HOLD is an abstention. */
export function actionDirection(action: string | null | undefined): Direction {
  const value = (action ?? "").toLowerCase();
  if (value === "buy" || value === "long" || value === "bullish" || value === "up") return "UP";
  if (value === "sell" || value === "short" || value === "bearish" || value === "down")
    return "DOWN";
  return "ABSTAIN";
}

/** Research opinion strength (0-1 or 0-100) as a stated probability in [0.5, 1]. */
export function strengthProbability(conviction: number | null | undefined): number | null {
  if (conviction == null || !Number.isFinite(conviction)) return null;
  const unit = conviction > 1 ? conviction / 100 : conviction;
  return Math.min(1, Math.max(0.5, 0.5 + unit / 2));
}

/** Trend/volatility regime of an index at a point in time, from prior bars only. */
export function regimeLabeller(index: Bar[]) {
  return (iso: string) => {
    const at = Date.parse(iso) / 1000;
    const prior = index.filter((bar) => bar.time <= at);
    if (prior.length < 61) return "Unknown";
    const closes = prior.map((bar) => bar.close);
    const last = closes.at(-1)!;
    const sma50 = closes.slice(-50).reduce((t, v) => t + v, 0) / 50;
    const returns = closes
      .slice(-21)
      .map((c, i, xs) => (i ? c / xs[i - 1]! - 1 : 0))
      .slice(1);
    const m = returns.reduce((t, v) => t + v, 0) / returns.length;
    const vol = Math.sqrt(returns.reduce((t, v) => t + (v - m) ** 2, 0) / (returns.length - 1));
    const long = closes
      .slice(-61)
      .map((c, i, xs) => (i ? c / xs[i - 1]! - 1 : 0))
      .slice(1);
    const lm = long.reduce((t, v) => t + v, 0) / long.length;
    const longVol = Math.sqrt(long.reduce((t, v) => t + (v - lm) ** 2, 0) / (long.length - 1));
    const trend = last >= sma50 ? "Uptrend" : "Downtrend";
    const volatility = vol > longVol * 1.15 ? "high vol" : "calm";
    return `${trend}, ${volatility}`;
  };
}
