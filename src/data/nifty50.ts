/**
 * NIFTY 50 constituent reference list with clearly demonstrative prices.
 * Nothing here is a live quote — every derived figure is deterministic so the
 * terminal renders identically on the server and the client.
 */

export type Nifty50Stock = {
  symbol: string;
  company: string;
  sector: string;
  price: number;
  changePct: number;
  weight: number;
  seed: number;
};

type Row = [symbol: string, company: string, sector: string, price: number, changePct: number, weight: number];

const rows: Row[] = [
  ["RELIANCE", "Reliance Industries", "Energy", 2948.4, 0.82, 9.1],
  ["HDFCBANK", "HDFC Bank", "Financials", 1682.15, 0.44, 8.6],
  ["ICICIBANK", "ICICI Bank", "Financials", 1198.7, 1.12, 7.4],
  ["INFY", "Infosys", "Technology", 1864.35, -0.63, 5.8],
  ["TCS", "Tata Consultancy Services", "Technology", 4162.9, -0.28, 4.2],
  ["BHARTIARTL", "Bharti Airtel", "Telecom", 1594.25, 0.96, 4.1],
  ["ITC", "ITC", "Consumer Staples", 468.55, 0.21, 3.8],
  ["LT", "Larsen & Toubro", "Industrials", 3624.8, 1.34, 3.6],
  ["SBIN", "State Bank of India", "Financials", 824.65, 0.58, 3.1],
  ["AXISBANK", "Axis Bank", "Financials", 1146.9, 0.73, 2.9],
  ["KOTAKBANK", "Kotak Mahindra Bank", "Financials", 1762.45, -0.41, 2.7],
  ["HINDUNILVR", "Hindustan Unilever", "Consumer Staples", 2486.3, -0.34, 2.6],
  ["M&M", "Mahindra & Mahindra", "Automobiles", 2912.5, 1.48, 2.3],
  ["BAJFINANCE", "Bajaj Finance", "Financials", 7284.6, -0.92, 2.1],
  ["SUNPHARMA", "Sun Pharmaceutical", "Healthcare", 1782.15, 0.66, 2.0],
  ["MARUTI", "Maruti Suzuki", "Automobiles", 12864.75, 0.39, 1.9],
  ["NTPC", "NTPC", "Utilities", 412.8, 1.21, 1.8],
  ["TATAMOTORS", "Tata Motors", "Automobiles", 986.45, 2.04, 1.8],
  ["HCLTECH", "HCL Technologies", "Technology", 1744.9, -0.52, 1.7],
  ["ULTRACEMCO", "UltraTech Cement", "Materials", 11248.3, 0.88, 1.5],
  ["TITAN", "Titan Company", "Consumer Discretionary", 3486.65, -0.18, 1.4],
  ["ASIANPAINT", "Asian Paints", "Materials", 2864.2, -1.06, 1.3],
  ["POWERGRID", "Power Grid Corporation", "Utilities", 328.45, 0.74, 1.3],
  ["ADANIENT", "Adani Enterprises", "Industrials", 2648.9, 1.62, 1.2],
  ["COALINDIA", "Coal India", "Energy", 462.3, 0.91, 1.2],
  ["WIPRO", "Wipro", "Technology", 548.75, -0.44, 1.1],
  ["BAJAJFINSV", "Bajaj Finserv", "Financials", 1682.9, -0.58, 1.1],
  ["NESTLEIND", "Nestle India", "Consumer Staples", 2482.6, 0.12, 1.0],
  ["ADANIPORTS", "Adani Ports & SEZ", "Industrials", 1386.4, 1.28, 1.0],
  ["JSWSTEEL", "JSW Steel", "Materials", 942.85, 0.68, 1.0],
  ["TATASTEEL", "Tata Steel", "Materials", 164.35, 1.04, 0.9],
  ["GRASIM", "Grasim Industries", "Materials", 2586.4, 0.46, 0.9],
  ["HINDALCO", "Hindalco Industries", "Materials", 684.9, 1.36, 0.9],
  ["TECHM", "Tech Mahindra", "Technology", 1648.25, -0.72, 0.9],
  ["ONGC", "Oil & Natural Gas Corp", "Energy", 286.55, 0.84, 0.8],
  ["CIPLA", "Cipla", "Healthcare", 1524.7, 0.32, 0.8],
  ["DRREDDY", "Dr Reddy's Laboratories", "Healthcare", 1284.35, -0.26, 0.8],
  ["SBILIFE", "SBI Life Insurance", "Financials", 1764.9, 0.54, 0.7],
  ["INDUSINDBK", "IndusInd Bank", "Financials", 1042.6, -1.22, 0.7],
  ["EICHERMOT", "Eicher Motors", "Automobiles", 4862.45, 0.92, 0.7],
  ["HDFCLIFE", "HDFC Life Insurance", "Financials", 684.3, 0.38, 0.7],
  ["BAJAJ-AUTO", "Bajaj Auto", "Automobiles", 9248.75, 1.18, 0.7],
  ["DIVISLAB", "Divi's Laboratories", "Healthcare", 5842.6, -0.48, 0.6],
  ["BPCL", "Bharat Petroleum", "Energy", 312.85, 0.62, 0.6],
  ["BRITANNIA", "Britannia Industries", "Consumer Staples", 5286.4, -0.22, 0.6],
  ["HEROMOTOCO", "Hero MotoCorp", "Automobiles", 4682.9, 0.86, 0.6],
  ["APOLLOHOSP", "Apollo Hospitals", "Healthcare", 6942.35, 1.06, 0.6],
  ["SHRIRAMFIN", "Shriram Finance", "Financials", 586.45, -0.66, 0.5],
  ["TATACONSUM", "Tata Consumer Products", "Consumer Staples", 1082.6, 0.28, 0.5],
  ["LTIM", "LTIMindtree", "Technology", 5642.9, -0.84, 0.5],
];

export const nifty50: Nifty50Stock[] = rows.map(
  ([symbol, company, sector, price, changePct, weight], index) => ({
    symbol,
    company,
    sector,
    price,
    changePct,
    weight,
    seed: 17 + index * 13 + symbol.length,
  }),
);

export const nifty50Sectors = ["All", ...Array.from(new Set(nifty50.map((s) => s.sector))).sort()];

export function stockBySymbol(symbol: string) {
  const needle = decodeURIComponent(symbol).toUpperCase();
  return nifty50.find((stock) => stock.symbol === needle);
}

/** Deterministic pseudo-random in [0,1) from a seed + salt. */
function rnd(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function stockStats(stock: Nifty50Stock) {
  const dayRange = stock.price * (0.006 + rnd(stock.seed, 1) * 0.012);
  const low = stock.price - dayRange * (0.4 + rnd(stock.seed, 2) * 0.4);
  const high = low + dayRange;
  return {
    open: Number((stock.price - (stock.price * stock.changePct) / 100).toFixed(2)),
    low: Number(low.toFixed(2)),
    high: Number(high.toFixed(2)),
    weekLow: Number((stock.price * (0.72 + rnd(stock.seed, 3) * 0.1)).toFixed(2)),
    weekHigh: Number((stock.price * (1.08 + rnd(stock.seed, 4) * 0.16)).toFixed(2)),
    volume: Math.round(1.2e6 + rnd(stock.seed, 5) * 1.6e7),
    peRatio: Number((14 + rnd(stock.seed, 6) * 36).toFixed(1)),
    marketCapCr: Math.round(45_000 + rnd(stock.seed, 7) * 1_450_000),
    dividendYield: Number((0.2 + rnd(stock.seed, 8) * 2.6).toFixed(2)),
    beta: Number((0.6 + rnd(stock.seed, 9) * 0.9).toFixed(2)),
    volatility: Math.round(18 + rnd(stock.seed, 10) * 42),
    momentum: Math.round(30 + rnd(stock.seed, 11) * 60),
    liquidity: Math.round(45 + rnd(stock.seed, 12) * 50),
  };
}

export type AgentView = {
  agent: string;
  stance: "BULLISH" | "NEUTRAL" | "BEARISH";
  conviction: number;
  note: string;
};

const agentNames = [
  "Fundamentals agent",
  "Technical agent",
  "News agent",
  "Risk agent",
  "Bear-case agent",
  "Portfolio-fit agent",
] as const;

const notes: Record<string, [string, string, string]> = {
  "Fundamentals agent": [
    "Earnings quality and return on capital screen above the sector median.",
    "Fundamentals are steady; neither margin expansion nor erosion is evident.",
    "Valuation is running ahead of the current earnings trajectory.",
  ],
  "Technical agent": [
    "Price holds above its short and medium moving averages with rising participation.",
    "Price is consolidating inside a tight range with no directional resolution.",
    "Momentum is fading and recent rallies are being sold into.",
  ],
  "News agent": [
    "Recent coverage skews constructive, led by demand and order-book commentary.",
    "Coverage is balanced with no single dominant narrative.",
    "Headline flow is dominated by cost pressure and guidance caution.",
  ],
  "Risk agent": [
    "Volatility sits inside its normal band, so position sizing is unconstrained.",
    "Risk is average — a standard position size is appropriate.",
    "Elevated volatility argues for a smaller position than usual.",
  ],
  "Bear-case agent": [
    "The main bear case is cyclical: a demand slowdown would compress multiples.",
    "The bear case rests on valuation rather than deterioration in the business.",
    "Downside risk is concrete: margin compression with limited pricing power.",
  ],
  "Portfolio-fit agent": [
    "Adds diversifying exposure relative to the current demonstrative holdings.",
    "Overlaps moderately with existing sector exposure.",
    "Increases concentration in an already heavily weighted sector.",
  ],
};

export function agentViews(stock: Nifty50Stock): AgentView[] {
  return agentNames.map((agent, i) => {
    const bias = stock.changePct * 12 + rnd(stock.seed, 20 + i) * 70 - 20;
    const stance: AgentView["stance"] = bias > 28 ? "BULLISH" : bias < 2 ? "BEARISH" : "NEUTRAL";
    const note = notes[agent] ?? ["", "", ""];
    return {
      agent,
      stance,
      conviction: Math.round(52 + rnd(stock.seed, 40 + i) * 42),
      note: (stance === "BULLISH" ? note[0] : stance === "NEUTRAL" ? note[1] : note[2]) ?? "",
    };
  });
}

export function committeeVerdict(stock: Nifty50Stock) {
  const views = agentViews(stock);
  const score =
    views.reduce(
      (acc, v) => acc + (v.stance === "BULLISH" ? v.conviction : v.stance === "BEARISH" ? -v.conviction : 0),
      0,
    ) / views.length;
  const verdict = score > 18 ? "BUY" : score < -18 ? "SELL" : "HOLD";
  const conviction = Math.min(96, Math.round(54 + Math.abs(score)));
  const target = Number((stock.price * (1 + score / 900)).toFixed(2));
  return { views, verdict, conviction, target, score: Math.round(score) };
}

export function stockSentiment(stock: Nifty50Stock) {
  const score = Math.round(
    Math.min(94, Math.max(8, 50 + stock.changePct * 14 + (rnd(stock.seed, 60) - 0.5) * 40)),
  );
  const label = score >= 66 ? "GREED" : score <= 34 ? "FEAR" : "NEUTRAL";
  return {
    score,
    label,
    breakdown: [
      { label: "Price trend", value: Math.round(30 + rnd(stock.seed, 61) * 66) },
      { label: "Volume flow", value: Math.round(30 + rnd(stock.seed, 62) * 66) },
      { label: "News tone", value: Math.round(30 + rnd(stock.seed, 63) * 66) },
      { label: "Options skew", value: Math.round(30 + rnd(stock.seed, 64) * 66) },
    ],
  };
}

const headlineTemplates = [
  "{c} guides to steady volume growth through the current quarter",
  "Brokerages revisit {c} estimates after the latest operating update",
  "{c} capex plan draws attention to medium-term margin mix",
  "Sector read-across lifts {c} alongside peers in {s}",
  "{c} management flags input-cost normalisation into next quarter",
];

export function stockNews(stock: Nifty50Stock) {
  return headlineTemplates.map((template, i) => ({
    id: `${stock.symbol}-${i}`,
    headline: template.replace("{c}", stock.company).replace("{s}", stock.sector),
    source: ["Market desk", "Research wire", "Sector note", "Company filing", "Macro desk"][i] ?? "Desk",
    tone: rnd(stock.seed, 80 + i) > 0.45 ? "POSITIVE" : "CAUTIOUS",
    impact: rnd(stock.seed, 90 + i) > 0.62 ? "HIGH" : "MEDIUM",
    minutesAgo: Math.round(12 + rnd(stock.seed, 100 + i) * 600),
  }));
}

/** Demonstrative five-level order depth around the last price. */
export function marketDepth(stock: Nifty50Stock) {
  const tick = Math.max(0.05, Number((stock.price * 0.0004).toFixed(2)));
  return Array.from({ length: 5 }, (_, i) => ({
    bid: Number((stock.price - tick * (i + 1)).toFixed(2)),
    bidQty: Math.round(80 + rnd(stock.seed, 120 + i) * 2400),
    ask: Number((stock.price + tick * (i + 1)).toFixed(2)),
    askQty: Math.round(80 + rnd(stock.seed, 140 + i) * 2400),
  }));
}
