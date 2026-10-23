/** Black-Scholes pricing and payoff maths for the simulated options lab. */
function cdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
const pdf = (x: number) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);

export type OptionKind = "CE" | "PE";
export type Leg = {
  kind: OptionKind;
  strike: number;
  side: "BUY" | "SELL";
  lots: number;
  premium: number;
};

/** Price + Greeks. t in years, r and iv as decimals. */
export function blackScholes(
  kind: OptionKind,
  spot: number,
  strike: number,
  t: number,
  iv: number,
  r = 0.065,
) {
  const sq = iv * Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * t) / sq;
  const d2 = d1 - sq;
  const disc = Math.exp(-r * t);
  const price =
    kind === "CE"
      ? spot * cdf(d1) - strike * disc * cdf(d2)
      : strike * disc * cdf(-d2) - spot * cdf(-d1);
  const delta = kind === "CE" ? cdf(d1) : cdf(d1) - 1;
  const gamma = pdf(d1) / (spot * sq);
  const vega = (spot * pdf(d1) * Math.sqrt(t)) / 100;
  const theta =
    (-(spot * pdf(d1) * iv) / (2 * Math.sqrt(t)) -
      (kind === "CE" ? 1 : -1) * r * strike * disc * cdf(kind === "CE" ? d2 : -d2)) /
    365;
  return { price: Math.max(price, 0.05), delta, gamma, vega, theta };
}

/** Strategy profit at expiry for a given underlying price (per lot size). */
export function payoffAt(legs: Leg[], price: number, lotSize: number) {
  return legs.reduce((sum, l) => {
    const intrinsic =
      l.kind === "CE" ? Math.max(price - l.strike, 0) : Math.max(l.strike - price, 0);
    const perUnit = (intrinsic - l.premium) * (l.side === "BUY" ? 1 : -1);
    return sum + perUnit * l.lots * lotSize;
  }, 0);
}

export type ChainSide = {
  symbol?: string | null;
  ltp: number | null;
  change: number | null;
  change_pct: number | null;
  oi: number | null;
  oi_change: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
};
export type ChainRow = { strike: number; call: ChainSide | null; put: ChainSide | null };

/**
 * Max pain: the expiry price at which option writers pay out the least, using
 * observed open interest only. Returns null when no strike carries OI.
 */
export function maxPain(rows: ChainRow[]) {
  let best: { strike: number; payout: number } | null = null;
  for (const { strike: settle } of rows) {
    let payout = 0;
    for (const row of rows) {
      payout += (row.call?.oi ?? 0) * Math.max(0, settle - row.strike);
      payout += (row.put?.oi ?? 0) * Math.max(0, row.strike - settle);
    }
    if (!best || payout < best.payout) best = { strike: settle, payout };
  }
  const anyOi = rows.some((row) => (row.call?.oi ?? 0) > 0 || (row.put?.oi ?? 0) > 0);
  return anyOi && best ? best.strike : null;
}

/** Strike nearest the spot price (the at-the-money row). */
export function atmStrike(rows: ChainRow[], spot: number | null) {
  if (spot == null || !rows.length) return null;
  return rows.reduce((nearest, row) =>
    Math.abs(row.strike - spot) < Math.abs(nearest.strike - spot) ? row : nearest,
  ).strike;
}
