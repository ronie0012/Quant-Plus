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
