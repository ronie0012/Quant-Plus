export interface Instrument {
  symbol: string;
  name: string;
  last: string;
  change: number;
  volatility: number;
  momentum: number;
  breadth: number;
  seed: number;
  regime: "Neutral" | "Risk-On" | "Risk-Off";
  summary: string;
}

/** Clearly demonstrative sample data — not a live market feed. */
export const instruments: Instrument[] = [
  {
    symbol: "S&P 500",
    name: "US Large Cap",
    last: "5,842.10",
    change: 0.42,
    volatility: 28,
    momentum: 64,
    breadth: 58,
    seed: 11,
    regime: "Risk-On",
    summary:
      "Index leadership stays concentrated in mega-cap technology while cyclical participation slowly widens.",
  },
  {
    symbol: "NASDAQ",
    name: "US Technology",
    last: "18,914.77",
    change: 0.68,
    volatility: 34,
    momentum: 71,
    breadth: 54,
    seed: 23,
    regime: "Risk-On",
    summary:
      "Momentum expansion continues, though rising dispersion between semiconductors and software warrants attention.",
  },
  {
    symbol: "NIFTY 50",
    name: "India Large Cap",
    last: "24,318.60",
    change: 0.31,
    volatility: 26,
    momentum: 61,
    breadth: 63,
    seed: 31,
    regime: "Neutral",
    summary:
      "Financials absorb most of the index gain while consumption names consolidate in a tight range.",
  },
  {
    symbol: "NIFTY 500",
    name: "India Broad Market",
    last: "22,486.95",
    change: 0.84,
    volatility: 32,
    momentum: 68,
    breadth: 61,
    seed: 47,
    regime: "Neutral",
    summary:
      "Market breadth remains constructive while momentum has strengthened across financial and technology sectors.",
  },
  {
    symbol: "BTC",
    name: "Bitcoin / USD",
    last: "68,240",
    change: -1.24,
    volatility: 58,
    momentum: 44,
    breadth: 39,
    seed: 59,
    regime: "Risk-Off",
    summary:
      "Volatility expansion follows a failed breakout; positioning has cooled without a structural trend break.",
  },
  {
    symbol: "ETH",
    name: "Ethereum / USD",
    last: "3,482",
    change: -0.86,
    volatility: 54,
    momentum: 47,
    breadth: 42,
    seed: 67,
    regime: "Risk-Off",
    summary:
      "Relative weakness against Bitcoin persists as realised volatility stays above its trailing median.",
  },
  {
    symbol: "Gold",
    name: "XAU / USD",
    last: "2,388.40",
    change: 0.22,
    volatility: 19,
    momentum: 57,
    breadth: 66,
    seed: 73,
    regime: "Neutral",
    summary:
      "A quiet grind higher with compressed volatility, consistent with steady defensive demand rather than stress.",
  },
  {
    symbol: "USD/INR",
    name: "Currency",
    last: "83.42",
    change: -0.08,
    volatility: 12,
    momentum: 49,
    breadth: 52,
    seed: 83,
    regime: "Neutral",
    summary:
      "Range-bound with very low realised volatility, keeping cross-asset carry conditions stable.",
  },
];

export const pipelineNodes = [
  { id: "data", label: "DATA", note: "Ingestion" },
  { id: "price", label: "PRICE", note: "Structure" },
  { id: "volume", label: "VOLUME", note: "Participation" },
  { id: "momentum", label: "MOMENTUM", note: "Trend force" },
  { id: "volatility", label: "VOLATILITY", note: "Regime" },
  { id: "sentiment", label: "SENTIMENT", note: "Positioning" },
  { id: "quant", label: "QUANT MODEL", note: "Scoring" },
  { id: "ai", label: "AI ANALYSIS", note: "Reasoning" },
];

export const capabilities = [
  {
    index: "01",
    title: "MARKET DATA",
    body: "Real-time market information across major assets, normalised into a single schema.",
  },
  {
    index: "02",
    title: "QUANT SIGNALS",
    body: "Technical and quantitative indicators computed consistently across every instrument.",
  },
  {
    index: "03",
    title: "AI RESEARCH",
    body: "Natural-language market analysis grounded in the underlying data, with its reasoning shown.",
  },
  {
    index: "04",
    title: "PORTFOLIO INTELLIGENCE",
    body: "Understand exposure, risk and performance without assembling spreadsheets.",
  },
  {
    index: "05",
    title: "ALERTS",
    body: "Know when something meaningful changes — not every time a price ticks.",
  },
  {
    index: "06",
    title: "RESEARCH WORKSPACE",
    body: "Turn market data into structured, reviewable decisions you can revisit later.",
  },
];

export const researchDesks = [
  {
    code: "R-01",
    title: "Market Brief",
    meta: "Daily · 06:15 IST",
    body: "What moved, what mattered, and what the data does not yet confirm.",
    metrics: [
      { label: "Breadth", value: "61" },
      { label: "Regime", value: "Neutral" },
    ],
    seed: 5,
  },
  {
    code: "R-02",
    title: "Sector Rotation",
    meta: "Weekly · Cross-sector",
    body: "Relative strength shifts across sectors, ranked by persistence rather than noise.",
    metrics: [
      { label: "Leaders", value: "4" },
      { label: "Spread", value: "2.8%" },
    ],
    seed: 13,
  },
  {
    code: "R-03",
    title: "Volatility Watch",
    meta: "Intraday · Regime",
    body: "Realised versus implied volatility, and what the gap has historically preceded.",
    metrics: [
      { label: "RV 20d", value: "32" },
      { label: "State", value: "Compressed" },
    ],
    seed: 21,
  },
  {
    code: "R-04",
    title: "Macro Monitor",
    meta: "Weekly · Rates & FX",
    body: "Rates, currencies and liquidity conditions framed as constraints on equity risk.",
    metrics: [
      { label: "Rates", value: "Stable" },
      { label: "USD", value: "Flat" },
    ],
    seed: 29,
  },
  {
    code: "R-05",
    title: "Earnings Intelligence",
    meta: "Season · Fundamentals",
    body: "Estimate revisions and guidance language, summarised per sector.",
    metrics: [
      { label: "Revisions", value: "+1.4%" },
      { label: "Beats", value: "58%" },
    ],
    seed: 37,
  },
  {
    code: "R-06",
    title: "AI Market Thesis",
    meta: "On demand · Generated",
    body: "A structured thesis with drivers, counter-arguments and an explicit confidence level.",
    metrics: [
      { label: "Confidence", value: "78%" },
      { label: "Drivers", value: "4" },
    ],
    seed: 43,
  },
];

export const exposure = [
  { label: "Large Cap", weight: 48 },
  { label: "Mid Cap", weight: 22 },
  { label: "Small Cap", weight: 12 },
  { label: "Cash", weight: 18 },
];

export const riskMetrics = [
  {
    id: "exposure",
    label: "EXPOSURE",
    value: 82,
    note: "82% invested, 18% held in cash.",
    related: ["Large Cap", "Mid Cap", "Small Cap"],
  },
  {
    id: "correlation",
    label: "CORRELATION",
    value: 64,
    note: "Holdings move together more than the headline diversification suggests.",
    related: ["Financials", "Technology", "NIFTY 500"],
  },
  {
    id: "volatility",
    label: "VOLATILITY",
    value: 32,
    note: "Realised volatility sits below its trailing one-year median.",
    related: ["Technology", "Small Cap"],
  },
  {
    id: "drawdown",
    label: "DRAWDOWN",
    value: 41,
    note: "Current drawdown from peak remains inside the historical normal band.",
    related: ["Mid Cap", "Small Cap"],
  },
  {
    id: "liquidity",
    label: "LIQUIDITY",
    value: 27,
    note: "Most positions can be exited well inside a single session.",
    related: ["Large Cap", "Cash"],
  },
  {
    id: "concentration",
    label: "CONCENTRATION",
    value: 58,
    note: "Top five positions account for a majority of active risk.",
    related: ["Financials", "Technology"],
  },
];

export const coverage = [
  {
    label: "LIVE MARKET COVERAGE",
    value: "NIFTY 500",
    note: "500+ securities tracked across the broad Indian market.",
    status: "Available",
  },
  {
    label: "MARKET UPDATES",
    value: "Real-time / delayed",
    note: "Update frequency depends on the connected data source.",
    status: "Available",
  },
  {
    label: "SIGNALS",
    value: "Quantitative indicators",
    note: "Price, volume, momentum and volatility factors.",
    status: "Available",
  },
  {
    label: "AI ANALYSIS",
    value: "Natural-language intelligence",
    note: "Structured reasoning over the underlying market data.",
    status: "Available",
  },
  {
    label: "OPTIONS ANALYTICS",
    value: "Derivatives surface",
    note: "Implied volatility surface and positioning analytics.",
    status: "Coming soon",
  },
  {
    label: "BROKER SYNC",
    value: "Portfolio import",
    note: "Direct holdings sync with supported brokers.",
    status: "Coming soon",
  },
];

export const analystSteps = [
  "Retrieving market data",
  "Analyzing breadth",
  "Checking sector rotation",
  "Evaluating volatility",
  "Comparing historical regimes",
];

/** Deterministic pseudo-random series so server and client render identically. */
export function series(seed: number, count = 64, drift = 0.35, noise = 1) {
  const out: number[] = [];
  let value = 50;
  let s = seed * 9301 + 49297;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280 - 0.5;
    value += r * 9 * noise + drift;
    out.push(value);
  }
  const min = Math.min(...out);
  const max = Math.max(...out);
  const span = max - min || 1;
  return out.map((v) => (v - min) / span);
}

export function toPath(points: number[], width: number, height: number, pad = 2) {
  const h = height - pad * 2;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = pad + (1 - p) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
