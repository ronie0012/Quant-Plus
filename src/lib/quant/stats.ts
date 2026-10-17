/**
 * Small, dependency-free statistics used by the analytical engines. Every
 * function returns null (never a fabricated zero) when its input is too short.
 */

export function finite(values: readonly number[]): number[] {
  return values.filter((value) => typeof value === "number" && Number.isFinite(value));
}

export function mean(values: readonly number[]): number | null {
  const xs = finite(values);
  if (!xs.length) return null;
  return xs.reduce((total, value) => total + value, 0) / xs.length;
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values: readonly number[], q: number): number | null {
  const xs = finite(values).sort((a, b) => a - b);
  if (!xs.length) return null;
  const position = Math.min(1, Math.max(0, q)) * (xs.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return xs[lower]! * (1 - weight) + xs[upper]! * weight;
}

/** Sample standard deviation (n - 1). */
export function stdev(values: readonly number[]): number | null {
  const xs = finite(values);
  if (xs.length < 2) return null;
  const m = xs.reduce((total, value) => total + value, 0) / xs.length;
  const variance = xs.reduce((total, value) => total + (value - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Simple returns between consecutive values. */
export function simpleReturns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let index = 1; index < values.length; index++) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    if (previous > 0 && Number.isFinite(previous) && Number.isFinite(current))
      out.push(current / previous - 1);
  }
  return out;
}

/** Pearson correlation over the overlapping tail of two equal-step series. */
export function correlation(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const xs = a.slice(a.length - n);
  const ys = b.slice(b.length - n);
  const mx = xs.reduce((t, v) => t + v, 0) / n;
  const my = ys.reduce((t, v) => t + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export function covariance(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const xs = a.slice(a.length - n);
  const ys = b.slice(b.length - n);
  const mx = xs.reduce((t, v) => t + v, 0) / n;
  const my = ys.reduce((t, v) => t + v, 0) / n;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (xs[i]! - mx) * (ys[i]! - my);
  return cov / (n - 1);
}

/** Largest peak-to-trough decline of a value series, as a negative fraction. */
export function maxDrawdown(values: readonly number[]): number | null {
  const xs = finite(values);
  if (xs.length < 2) return null;
  let peak = xs[0]!;
  let worst = 0;
  for (const value of xs) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}

/** Deterministic PRNG (mulberry32) so placebo and simulation results are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Summary of a distribution suitable for honest display (range, not a point). */
export type Distribution = {
  n: number;
  p5: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p95: number | null;
  mean: number | null;
  positive_share: number | null;
};

export function distribution(values: readonly number[]): Distribution {
  const xs = finite(values);
  return {
    n: xs.length,
    p5: quantile(xs, 0.05),
    p25: quantile(xs, 0.25),
    median: quantile(xs, 0.5),
    p75: quantile(xs, 0.75),
    p95: quantile(xs, 0.95),
    mean: mean(xs),
    positive_share: xs.length ? xs.filter((x) => x > 0).length / xs.length : null,
  };
}
