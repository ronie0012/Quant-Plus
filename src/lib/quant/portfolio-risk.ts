/**
 * Portfolio intelligence: "what can hurt me next?" rather than "what moved
 * today?". Every measure is computed from the paper book and provider daily
 * history; holdings without enough history are listed as uncovered.
 */
import { correlation, covariance, maxDrawdown, quantile, round } from "./stats.ts";

export type PortfolioBar = { time: number; open: number; close: number; volume: number };

export type Position = {
  symbol: string;
  sector: string;
  quantity: number;
  price: number;
  bars: PortfolioBar[];
};

export type PositionRisk = {
  symbol: string;
  sector: string;
  value: number;
  weight: number;
  daily_vol: number | null;
  beta: number | null;
  adv: number | null;
  exit_days: number | null;
  gap_p95: number | null;
  gap_loss: number | null;
  /** Share of portfolio variance contributed by this position (sums to 1). */
  risk_contribution: number | null;
  marginal_risk: number | null;
  drawdown_contribution: number | null;
  momentum_20d: number | null;
};

export type StressScenario = { name: string; loss: number; basis: string };

export type PortfolioRisk = {
  value: number;
  cash: number;
  equity: number;
  positions: PositionRisk[];
  uncovered: string[];
  sector_weights: { sector: string; weight: number }[];
  issuer_hhi: number;
  effective_positions: number | null;
  clusters: { members: string[]; avg_correlation: number }[];
  portfolio_vol: number | null;
  portfolio_beta: number | null;
  var_95_1d: number | null;
  historical_worst: { start: number; end: number; loss: number; days: number }[];
  max_drawdown: number | null;
  stress: StressScenario[];
  reduce_first: { symbol: string; risk_contribution: number; reason: string }[];
  budget: { limit: number; used: number; used_pct: number | null };
  cash_runway: { scenario: string; months: number | null }[];
  factor: { market_beta: number | null; momentum_tilt: number | null; size_note: string };
};

const returnsOf = (bars: PortfolioBar[]) => {
  const out: { time: number; r: number }[] = [];
  for (let i = 1; i < bars.length; i++)
    if (bars[i - 1]!.close > 0)
      out.push({ time: bars[i]!.time, r: bars[i]!.close / bars[i - 1]!.close - 1 });
  return out;
};

const day = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);

/** Align daily returns across positions on common sessions (most recent `window`). */
export function alignedReturns(positions: Position[], window = 120) {
  const maps = positions.map((p) => new Map(returnsOf(p.bars).map((x) => [day(x.time), x.r])));
  const common = [...(maps[0]?.keys() ?? [])].filter((d) => maps.every((m) => m.has(d))).sort();
  const days = common.slice(-window);
  return { days, series: maps.map((m) => days.map((d) => m.get(d)!)) };
}

export function analysePortfolio(
  positions: Position[],
  cash: number,
  options: {
    index?: PortfolioBar[];
    participation?: number;
    daily_loss_limit?: number;
    open_risk?: number;
    monthly_outflow?: number;
  } = {},
): PortfolioRisk {
  const participation = options.participation ?? 0.1;
  const covered = positions.filter((p) => p.bars.length >= 30 && p.quantity > 0);
  const uncovered = positions.filter((p) => !covered.includes(p)).map((p) => p.symbol);
  const value = positions.reduce((t, p) => t + p.quantity * p.price, 0);
  const equity = value + cash;
  const indexReturns = options.index
    ? new Map(returnsOf(options.index).map((x) => [day(x.time), x.r]))
    : null;

  const { series } = alignedReturns(covered);
  const weights = covered.map((p) => (equity > 0 ? (p.quantity * p.price) / equity : 0));
  const n = covered.length;
  const cov: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => covariance(series[i] ?? [], series[j] ?? []) ?? 0),
  );
  const sigmaW = cov.map((row) => row.reduce((t, c, j) => t + c * weights[j]!, 0));
  const variance = weights.reduce((t, w, i) => t + w * sigmaW[i]!, 0);
  const portfolioVol = n && variance > 0 && series[0]?.length ? Math.sqrt(variance) : null;

  // Portfolio daily value path for drawdown and historical stress windows.
  const pathReturns =
    series[0]?.map((_, k) => covered.reduce((t, _p, i) => t + weights[i]! * series[i]![k]!, 0)) ??
    [];
  const valuePath = pathReturns.reduce<number[]>((acc, r) => [...acc, acc.at(-1)! * (1 + r)], [1]);
  const { days } = alignedReturns(covered);
  const worst: PortfolioRisk["historical_worst"] = [];
  for (const window of [1, 5, 20]) {
    let low = 0;
    let at = -1;
    for (let k = window; k < valuePath.length; k++) {
      const r = valuePath[k]! / valuePath[k - window]! - 1;
      if (r < low) {
        low = r;
        at = k;
      }
    }
    if (at > 0 && days[at - 1] && days[at - window])
      worst.push({
        start: Date.parse(days[at - window]!) / 1000,
        end: Date.parse(days[at - 1]!) / 1000,
        loss: round(-low * value, 0),
        days: window,
      });
  }

  const positionsOut: PositionRisk[] = positions.map((p) => {
    const i = covered.indexOf(p);
    const rs = returnsOf(p.bars);
    const recent = rs.slice(-60).map((x) => x.r);
    const m = recent.reduce((t, v) => t + v, 0) / (recent.length || 1);
    const vol =
      recent.length >= 10
        ? Math.sqrt(recent.reduce((t, v) => t + (v - m) ** 2, 0) / (recent.length - 1))
        : null;
    let beta: number | null = null;
    if (indexReturns) {
      const pairs = rs.slice(-120).filter((x) => indexReturns.has(day(x.time)));
      const a = pairs.map((x) => x.r);
      const b = pairs.map((x) => indexReturns.get(day(x.time))!);
      const c = covariance(a, b);
      const v = covariance(b, b);
      beta = c != null && v ? round(c / v, 2) : null;
    }
    const volumes = p.bars
      .slice(-20)
      .map((b) => b.volume)
      .filter((v) => v > 0);
    const adv = volumes.length >= 5 ? volumes.reduce((t, v) => t + v, 0) / volumes.length : null;
    const gaps: number[] = [];
    for (let k = 1; k < p.bars.length; k++) {
      const g = p.bars[k]!.open / p.bars[k - 1]!.close - 1;
      if (g < 0) gaps.push(-g);
    }
    const gapP95 = gaps.length >= 10 ? quantile(gaps, 0.95) : null;
    const positionValue = p.quantity * p.price;
    const mrc = i >= 0 && portfolioVol ? sigmaW[i]! / portfolioVol : null;
    const rc = i >= 0 && variance > 0 ? (weights[i]! * sigmaW[i]!) / variance : null;
    const dd = maxDrawdown(p.bars.slice(-120).map((b) => b.close));
    const closes = p.bars.map((b) => b.close);
    const momentum = closes.length > 21 ? closes.at(-1)! / closes.at(-21)! - 1 : null;
    return {
      symbol: p.symbol,
      sector: p.sector,
      value: round(positionValue, 2),
      weight: equity > 0 ? positionValue / equity : 0,
      daily_vol: vol,
      beta,
      adv,
      exit_days: adv ? round(p.quantity / (adv * participation), 2) : null,
      gap_p95: gapP95,
      gap_loss: gapP95 == null ? null : round(positionValue * gapP95, 0),
      risk_contribution: rc,
      marginal_risk: mrc,
      drawdown_contribution: dd == null ? null : round(dd * positionValue, 0),
      momentum_20d: momentum,
    };
  });

  const sectorMap = new Map<string, number>();
  for (const p of positionsOut) sectorMap.set(p.sector, (sectorMap.get(p.sector) ?? 0) + p.weight);
  const investedWeights = positionsOut.map((p) => (value > 0 ? p.value / value : 0));
  const hhi = investedWeights.reduce((t, w) => t + w * w, 0);

  // Correlation clusters: single-linkage at correlation >= 0.6.
  const parent = covered.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const pairCorr: number[][] = covered.map((_, i) =>
    covered.map((__, j) => (i === j ? 1 : (correlation(series[i] ?? [], series[j] ?? []) ?? 0))),
  );
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) if (pairCorr[i]![j]! >= 0.6) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
  const clusters = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const cs: number[] = [];
      for (const a of g) for (const b of g) if (a < b) cs.push(pairCorr[a]![b]!);
      return {
        members: g.map((i) => covered[i]!.symbol),
        avg_correlation: round(cs.reduce((t, v) => t + v, 0) / cs.length, 2),
      };
    });

  const portfolioBeta = positionsOut.every((p) => p.beta == null)
    ? null
    : round(
        positionsOut.reduce((t, p) => t + (p.beta ?? 1) * p.weight, 0),
        2,
      );

  // Stress beyond flat shocks.
  const stress: StressScenario[] = [];
  if (portfolioBeta != null)
    stress.push({
      name: "Market falls 5% (beta-scaled)",
      loss: round(
        positionsOut.reduce((t, p) => t + p.value * 0.05 * (p.beta ?? 1), 0),
        0,
      ),
      basis: "Each holding moves by its own 120-session beta to NIFTY 50.",
    });
  stress.push({
    name: "Volatility shock (2σ each holding)",
    loss: round(
      positionsOut.reduce((t, p) => t + p.value * 2 * (p.daily_vol ?? 0.02), 0),
      0,
    ),
    basis: "Every holding falls twice its own 60-session daily volatility; correlations assumed 1.",
  });
  const topSector = [...sectorMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topSector)
    stress.push({
      name: `${topSector[0]} sector falls 10%`,
      loss: round(
        positionsOut
          .filter((p) => p.sector === topSector[0])
          .reduce((t, p) => t + p.value * 0.1, 0),
        0,
      ),
      basis: "Largest sector exposure shocked; other sectors unchanged.",
    });
  stress.push({
    name: "Everything gaps at its 95th-percentile",
    loss: round(
      positionsOut.reduce((t, p) => t + (p.gap_loss ?? 0), 0),
      0,
    ),
    basis: "Each holding opens down by its own 95th-percentile adverse overnight gap.",
  });
  for (const w of worst)
    stress.push({
      name: `Worst ${w.days}-session window replayed`,
      loss: w.loss,
      basis: `Current weights through ${day(w.start)} → ${day(w.end)}.`,
    });

  const varDaily = portfolioVol ? round(1.645 * portfolioVol * equity, 0) : null;
  const reduceFirst = positionsOut
    .filter((p) => p.risk_contribution != null)
    .sort((a, b) => b.risk_contribution! - a.risk_contribution!)
    .slice(0, 5)
    .map((p) => ({
      symbol: p.symbol,
      risk_contribution: round(p.risk_contribution! * 100, 1),
      reason: `${round(p.risk_contribution! * 100, 1)}% of portfolio variance from ${round(p.weight * 100, 1)}% of equity${p.exit_days != null && p.exit_days > 1 ? `; ${p.exit_days} days to exit at ${participation * 100}% participation` : ""}.`,
    }));

  const limit = options.daily_loss_limit ?? 0;
  const used = options.open_risk ?? 0;
  const outflow = options.monthly_outflow ?? 0;
  const runway = (loss: number) => (outflow > 0 ? round((cash - loss) / outflow, 1) : null);
  const severe = stress.reduce((t, s) => Math.max(t, s.loss), 0);
  const momentumTilt = positionsOut.every((p) => p.momentum_20d == null)
    ? null
    : round(positionsOut.reduce((t, p) => t + (p.momentum_20d ?? 0) * p.weight, 0) * 100, 2);

  return {
    value: round(value, 2),
    cash: round(cash, 2),
    equity: round(equity, 2),
    positions: positionsOut,
    uncovered,
    sector_weights: [...sectorMap.entries()]
      .map(([sector, weight]) => ({ sector, weight }))
      .sort((a, b) => b.weight - a.weight),
    issuer_hhi: round(hhi, 4),
    effective_positions: hhi > 0 ? round(1 / hhi, 1) : null,
    clusters,
    portfolio_vol: portfolioVol,
    portfolio_beta: portfolioBeta,
    var_95_1d: varDaily,
    historical_worst: worst,
    max_drawdown: maxDrawdown(valuePath),
    stress,
    reduce_first: reduceFirst,
    budget: { limit, used, used_pct: limit > 0 ? round((used / limit) * 100, 1) : null },
    cash_runway: [
      { scenario: "No further losses", months: runway(0) },
      { scenario: "Most severe stress above", months: runway(Math.min(severe, cash)) },
    ],
    factor: {
      market_beta: portfolioBeta,
      momentum_tilt: momentumTilt,
      size_note: "All holdings are NIFTY 50 large caps; size exposure is not differentiated.",
    },
  };
}

/** Digital twin: re-run the analysis with target weights (fractions of equity). */
export function twin(
  positions: Position[],
  cash: number,
  targetWeights: Record<string, number>,
  options: Parameters<typeof analysePortfolio>[2] = {},
) {
  const equity = positions.reduce((t, p) => t + p.quantity * p.price, 0) + cash;
  let turnover = 0;
  const next = positions.map((p) => {
    const target = targetWeights[p.symbol];
    if (target == null || p.price <= 0) return p;
    const quantity = Math.max(0, Math.floor((target * equity) / p.price));
    turnover += Math.abs(quantity - p.quantity) * p.price;
    return { ...p, quantity };
  });
  const invested = next.reduce((t, p) => t + p.quantity * p.price, 0);
  return {
    analysis: analysePortfolio(next, Math.max(0, equity - invested), options),
    turnover: round(turnover, 0),
    positions: next,
  };
}
