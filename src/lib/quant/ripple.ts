/**
 * Ripple Engine. A curated relationship map of NIFTY 50 companies and the
 * macro factors that drive them, plus deterministic propagation of a news
 * event across that map (first, second and third order).
 *
 * Every edge is a stated economic linkage with a plain-language rationale; it
 * is curated, not extracted from filings yet, and is labelled as such. Where
 * both ends are listed stocks, the historical "echo" (how the target moved on
 * the source's large-move days) is computed from observed bars only. Macro
 * factors have no connected price series, so their linkages carry no
 * historical magnitude and say so.
 */
import { median, round, stdev } from "./stats.ts";

export type FactorId =
  | "CRUDE"
  | "USDINR"
  | "RATES"
  | "STEEL"
  | "BASE_METALS"
  | "COAL"
  | "MONSOON"
  | "US_TECH"
  | "GOVT_CAPEX"
  | "URBAN_DEMAND"
  | "CREDIT_GROWTH"
  | "TELECOM_TARIFF"
  | "FNO_ACTIVITY"
  | "US_PHARMA";

export type Factor = {
  id: FactorId;
  label: string;
  /** What "up" means for this factor, in plain words. */
  up: string;
  down: string;
  /** Headline patterns that mention the factor. */
  pattern: RegExp;
};

export const FACTORS: readonly Factor[] = [
  {
    id: "CRUDE",
    label: "Crude oil",
    up: "Crude oil prices rise",
    down: "Crude oil prices fall",
    pattern: /\b(crude|brent|oil prices?|opec)\b/,
  },
  {
    id: "USDINR",
    label: "Rupee vs dollar",
    up: "Rupee weakens against the dollar",
    down: "Rupee strengthens against the dollar",
    pattern: /\b(rupee|usd ?\/? ?inr|inr)\b/,
  },
  {
    id: "RATES",
    label: "Interest rates",
    up: "Interest rates rise",
    down: "Interest rates fall",
    pattern:
      /\b(repo rate|rate (hike|cut)|monetary policy|mpc|bond yields?|g-sec|interest rates?)\b/,
  },
  {
    id: "STEEL",
    label: "Steel prices",
    up: "Steel prices rise",
    down: "Steel prices fall",
    pattern: /\b(steel prices?|hrc prices?|safeguard duty on steel|steel imports?)\b/,
  },
  {
    id: "BASE_METALS",
    label: "Aluminium and copper",
    up: "Aluminium and copper prices rise",
    down: "Aluminium and copper prices fall",
    pattern: /\b(aluminium|aluminum|copper|lme)\b/,
  },
  {
    id: "COAL",
    label: "Coal",
    up: "Coal prices or demand rise",
    down: "Coal prices or demand fall",
    pattern: /\b(coal (prices?|demand|output|production|supply))\b/,
  },
  {
    id: "MONSOON",
    label: "Monsoon and rural demand",
    up: "Monsoon or rural demand improves",
    down: "Monsoon or rural demand weakens",
    pattern: /\b(monsoon|rainfall|kharif|rabi|rural demand)\b/,
  },
  {
    id: "US_TECH",
    label: "US technology spending",
    up: "US technology spending improves",
    down: "US technology spending weakens",
    pattern: /\b(it spending|tech spending|deal wins?|us recession|nasdaq|h-?1b)\b/,
  },
  {
    id: "GOVT_CAPEX",
    label: "Government capex",
    up: "Government infrastructure spending rises",
    down: "Government infrastructure spending falls",
    pattern:
      /\b(capex|infrastructure spending|budget allocation|order inflow|defen[cs]e orders?)\b/,
  },
  {
    id: "URBAN_DEMAND",
    label: "Urban consumer demand",
    up: "Urban consumer demand improves",
    down: "Urban consumer demand weakens",
    pattern: /\b(consumer demand|urban demand|consumption|festive (season|demand)|gst cut)\b/,
  },
  {
    id: "CREDIT_GROWTH",
    label: "Credit growth",
    up: "Bank credit growth improves",
    down: "Bank credit growth slows",
    pattern: /\b(credit growth|loan growth|deposit growth|npa|asset quality)\b/,
  },
  {
    id: "TELECOM_TARIFF",
    label: "Telecom tariffs",
    up: "Mobile tariffs rise",
    down: "Mobile tariffs fall",
    pattern: /\b(tariff hike|mobile tariffs?|arpu)\b/,
  },
  {
    id: "FNO_ACTIVITY",
    label: "Derivatives trading activity",
    up: "Derivatives trading activity rises",
    down: "Derivatives trading activity falls (e.g. tighter F&O rules)",
    pattern:
      /\b(f&o|futures and options|derivatives? (rules|curbs|framework)|weekly expir(y|ies))\b/,
  },
  {
    id: "US_PHARMA",
    label: "US generic drug market",
    up: "US generics pricing or approvals improve",
    down: "US generics pricing worsens or USFDA actions rise",
    pattern: /\b(usfda|us fda|warning letter|form 483|generic(s)? pricing|anda)\b/,
  },
];

export type EdgeType =
  | "INPUT_COST"
  | "REVENUE_DRIVER"
  | "FX_EXPOSURE"
  | "FUNDING_COST"
  | "SUPPLIER"
  | "CUSTOMER"
  | "COMPETITOR"
  | "GROUP"
  | "SUBSIDIARY";

export const EDGE_LABELS: Record<EdgeType, string> = {
  INPUT_COST: "Input cost",
  REVENUE_DRIVER: "Revenue driver",
  FX_EXPOSURE: "Currency exposure",
  FUNDING_COST: "Funding cost",
  SUPPLIER: "Supplier",
  CUSTOMER: "Customer",
  COMPETITOR: "Peer read-through",
  GROUP: "Same promoter group",
  SUBSIDIARY: "Parent / subsidiary",
};

export type RippleEdge = {
  from: string;
  to: string;
  type: EdgeType;
  /** +1: target tends to move with the source; -1: against it. */
  sign: 1 | -1;
  /** Curated strength, 0-1. */
  weight: number;
  why: string;
};

const e = (
  from: string,
  to: string,
  type: EdgeType,
  sign: 1 | -1,
  weight: number,
  why: string,
): RippleEdge => ({ from, to, type, sign, weight, why });

const peers = (symbols: string[], weight: number, why: string): RippleEdge[] =>
  symbols.flatMap((a) =>
    symbols.filter((b) => b !== a).map((b) => e(a, b, "COMPETITOR", 1, weight, why)),
  );

/**
 * Curated NIFTY 50 relationship map. Directions are for the factor or source
 * moving "up" as defined in FACTORS; the source of every edge is the stated
 * economic linkage, pending filing-based extraction and review.
 */
export const RIPPLE_EDGES: readonly RippleEdge[] = [
  // Crude oil
  e(
    "CRUDE",
    "ONGC",
    "REVENUE_DRIVER",
    1,
    0.8,
    "Upstream producer: higher crude lifts realisations.",
  ),
  e(
    "CRUDE",
    "ASIANPAINT",
    "INPUT_COST",
    -1,
    0.7,
    "Many paint raw materials are crude derivatives.",
  ),
  e("CRUDE", "INDIGO", "INPUT_COST", -1, 0.8, "Aviation fuel is the largest airline cost."),
  e("CRUDE", "HINDUNILVR", "INPUT_COST", -1, 0.3, "Packaging and some inputs are crude-linked."),
  e(
    "CRUDE",
    "RELIANCE",
    "REVENUE_DRIVER",
    1,
    0.3,
    "Refining and petrochemicals; the effect is mixed.",
  ),
  e(
    "CRUDE",
    "USDINR",
    "REVENUE_DRIVER",
    1,
    0.4,
    "India imports most of its oil, so a higher bill pressures the rupee.",
  ),
  // Rupee (up = rupee weakens)
  e(
    "USDINR",
    "TCS",
    "FX_EXPOSURE",
    1,
    0.6,
    "Dollar revenue, rupee costs: a weaker rupee lifts margins.",
  ),
  e(
    "USDINR",
    "INFY",
    "FX_EXPOSURE",
    1,
    0.6,
    "Dollar revenue, rupee costs: a weaker rupee lifts margins.",
  ),
  e(
    "USDINR",
    "HCLTECH",
    "FX_EXPOSURE",
    1,
    0.6,
    "Dollar revenue, rupee costs: a weaker rupee lifts margins.",
  ),
  e(
    "USDINR",
    "TECHM",
    "FX_EXPOSURE",
    1,
    0.6,
    "Dollar revenue, rupee costs: a weaker rupee lifts margins.",
  ),
  e("USDINR", "SUNPHARMA", "FX_EXPOSURE", 1, 0.4, "Large export and US revenue share."),
  e("USDINR", "DRREDDY", "FX_EXPOSURE", 1, 0.5, "Large US generics revenue share."),
  e("USDINR", "CIPLA", "FX_EXPOSURE", 1, 0.3, "Meaningful export revenue."),
  e("USDINR", "INDIGO", "FX_EXPOSURE", -1, 0.5, "Aircraft leases and fuel are priced in dollars."),
  // Interest rates
  e(
    "RATES",
    "BAJFINANCE",
    "FUNDING_COST",
    -1,
    0.7,
    "Lenders that borrow from markets pay more when rates rise.",
  ),
  e(
    "RATES",
    "SHRIRAMFIN",
    "FUNDING_COST",
    -1,
    0.7,
    "Vehicle financier; funding cost rises with rates.",
  ),
  e("RATES", "JIOFIN", "FUNDING_COST", -1, 0.4, "Lending business is rate sensitive."),
  e(
    "RATES",
    "MARUTI",
    "CUSTOMER",
    -1,
    0.4,
    "Most cars are bought on loans; costlier EMIs slow demand.",
  ),
  e("RATES", "M&M", "CUSTOMER", -1, 0.4, "Vehicle and tractor buyers rely on financing."),
  e("RATES", "BAJAJ-AUTO", "CUSTOMER", -1, 0.3, "Two-wheeler buyers rely on financing."),
  e("RATES", "LT", "FUNDING_COST", -1, 0.3, "Higher rates slow private capex orders."),
  // Steel
  e(
    "STEEL",
    "TATASTEEL",
    "REVENUE_DRIVER",
    1,
    0.8,
    "Steel producer: higher prices lift realisations.",
  ),
  e(
    "STEEL",
    "JSWSTEEL",
    "REVENUE_DRIVER",
    1,
    0.8,
    "Steel producer: higher prices lift realisations.",
  ),
  e("STEEL", "MARUTI", "INPUT_COST", -1, 0.4, "Steel is a major vehicle input."),
  e("STEEL", "M&M", "INPUT_COST", -1, 0.4, "Steel is a major vehicle input."),
  e("STEEL", "TMPV", "INPUT_COST", -1, 0.4, "Steel is a major vehicle input."),
  e("STEEL", "LT", "INPUT_COST", -1, 0.3, "Steel is a key construction input."),
  // Base metals
  e("BASE_METALS", "HINDALCO", "REVENUE_DRIVER", 1, 0.8, "Aluminium and copper producer."),
  e("BASE_METALS", "ADANIENT", "REVENUE_DRIVER", 1, 0.2, "Has metals and mining businesses."),
  // Coal
  e("COAL", "COALINDIA", "REVENUE_DRIVER", 1, 0.8, "India's largest coal producer."),
  e(
    "COAL",
    "NTPC",
    "INPUT_COST",
    -1,
    0.3,
    "Coal is the main fuel; costs are largely passed through.",
  ),
  e("COAL", "ULTRACEMCO", "INPUT_COST", -1, 0.4, "Kiln fuel is a large cement cost."),
  // Monsoon and rural demand
  e(
    "MONSOON",
    "M&M",
    "REVENUE_DRIVER",
    1,
    0.6,
    "Tractors and rural vehicles depend on farm incomes.",
  ),
  e(
    "MONSOON",
    "HINDUNILVR",
    "REVENUE_DRIVER",
    1,
    0.5,
    "Rural households are a large share of FMCG sales.",
  ),
  e("MONSOON", "ITC", "REVENUE_DRIVER", 1, 0.4, "FMCG and agri businesses track rural demand."),
  e("MONSOON", "TATACONSUM", "REVENUE_DRIVER", 1, 0.4, "Staples demand tracks rural incomes."),
  e("MONSOON", "NESTLEIND", "REVENUE_DRIVER", 1, 0.3, "Packaged food demand tracks incomes."),
  e(
    "MONSOON",
    "BAJAJ-AUTO",
    "REVENUE_DRIVER",
    1,
    0.4,
    "Entry two-wheelers sell strongly in rural India.",
  ),
  e("MONSOON", "MARUTI", "REVENUE_DRIVER", 1, 0.3, "Rural car demand is a growing share."),
  // US tech spending
  e("US_TECH", "TCS", "REVENUE_DRIVER", 1, 0.7, "Most revenue comes from US and European clients."),
  e(
    "US_TECH",
    "INFY",
    "REVENUE_DRIVER",
    1,
    0.7,
    "Most revenue comes from US and European clients.",
  ),
  e(
    "US_TECH",
    "HCLTECH",
    "REVENUE_DRIVER",
    1,
    0.7,
    "Most revenue comes from US and European clients.",
  ),
  e(
    "US_TECH",
    "TECHM",
    "REVENUE_DRIVER",
    1,
    0.7,
    "Most revenue comes from US and European clients.",
  ),
  // Government capex
  e("GOVT_CAPEX", "LT", "REVENUE_DRIVER", 1, 0.8, "India's largest infrastructure contractor."),
  e(
    "GOVT_CAPEX",
    "BEL",
    "REVENUE_DRIVER",
    1,
    0.7,
    "Defence electronics orders come from the government.",
  ),
  e(
    "GOVT_CAPEX",
    "ULTRACEMCO",
    "REVENUE_DRIVER",
    1,
    0.5,
    "Cement demand follows infrastructure building.",
  ),
  e(
    "GOVT_CAPEX",
    "POWERGRID",
    "REVENUE_DRIVER",
    1,
    0.4,
    "Transmission build-out is government-led.",
  ),
  e("GOVT_CAPEX", "NTPC", "REVENUE_DRIVER", 1, 0.3, "Power capacity additions are policy-driven."),
  e(
    "GOVT_CAPEX",
    "ADANIPORTS",
    "REVENUE_DRIVER",
    1,
    0.3,
    "Ports and logistics benefit from infrastructure push.",
  ),
  e(
    "GOVT_CAPEX",
    "STEEL",
    "REVENUE_DRIVER",
    1,
    0.4,
    "Infrastructure building raises steel demand.",
  ),
  // Urban demand
  e(
    "URBAN_DEMAND",
    "TRENT",
    "REVENUE_DRIVER",
    1,
    0.7,
    "Fashion retail depends on discretionary spending.",
  ),
  e(
    "URBAN_DEMAND",
    "TITAN",
    "REVENUE_DRIVER",
    1,
    0.6,
    "Jewellery and watches are discretionary purchases.",
  ),
  e(
    "URBAN_DEMAND",
    "ETERNAL",
    "REVENUE_DRIVER",
    1,
    0.6,
    "Food delivery and quick commerce track urban spending.",
  ),
  e(
    "URBAN_DEMAND",
    "ASIANPAINT",
    "REVENUE_DRIVER",
    1,
    0.4,
    "Repainting is a deferrable household spend.",
  ),
  e(
    "URBAN_DEMAND",
    "MARUTI",
    "REVENUE_DRIVER",
    1,
    0.4,
    "Car purchases follow consumer confidence.",
  ),
  e("URBAN_DEMAND", "TMPV", "REVENUE_DRIVER", 1, 0.4, "Car purchases follow consumer confidence."),
  e("URBAN_DEMAND", "HINDUNILVR", "REVENUE_DRIVER", 1, 0.3, "Premium products track urban demand."),
  // Credit growth
  e("CREDIT_GROWTH", "HDFCBANK", "REVENUE_DRIVER", 1, 0.6, "Loan growth drives bank earnings."),
  e("CREDIT_GROWTH", "ICICIBANK", "REVENUE_DRIVER", 1, 0.6, "Loan growth drives bank earnings."),
  e("CREDIT_GROWTH", "SBIN", "REVENUE_DRIVER", 1, 0.6, "Loan growth drives bank earnings."),
  e("CREDIT_GROWTH", "AXISBANK", "REVENUE_DRIVER", 1, 0.6, "Loan growth drives bank earnings."),
  e("CREDIT_GROWTH", "KOTAKBANK", "REVENUE_DRIVER", 1, 0.6, "Loan growth drives bank earnings."),
  e(
    "CREDIT_GROWTH",
    "BAJFINANCE",
    "REVENUE_DRIVER",
    1,
    0.5,
    "Consumer loan growth drives earnings.",
  ),
  // Telecom tariffs, derivatives activity, US pharma
  e(
    "TELECOM_TARIFF",
    "BHARTIARTL",
    "REVENUE_DRIVER",
    1,
    0.8,
    "Higher tariffs lift revenue per user.",
  ),
  e("TELECOM_TARIFF", "RELIANCE", "REVENUE_DRIVER", 1, 0.3, "Owns Jio, a major telecom operator."),
  e(
    "FNO_ACTIVITY",
    "BSE",
    "REVENUE_DRIVER",
    1,
    0.8,
    "Exchange revenue depends heavily on derivatives volumes.",
  ),
  e(
    "US_PHARMA",
    "SUNPHARMA",
    "REVENUE_DRIVER",
    1,
    0.5,
    "Sells specialty and generic drugs in the US.",
  ),
  e("US_PHARMA", "DRREDDY", "REVENUE_DRIVER", 1, 0.7, "US generics are a large revenue share."),
  e("US_PHARMA", "CIPLA", "REVENUE_DRIVER", 1, 0.5, "US generics are a meaningful revenue share."),
  // Supply chain
  e("COALINDIA", "NTPC", "SUPPLIER", 1, 0.3, "Coal India supplies most of NTPC's coal."),
  e(
    "TATASTEEL",
    "MARUTI",
    "SUPPLIER",
    -1,
    0.2,
    "Steel supplier to automakers: their gain is a cost.",
  ),
  e(
    "JSWSTEEL",
    "MARUTI",
    "SUPPLIER",
    -1,
    0.2,
    "Steel supplier to automakers: their gain is a cost.",
  ),
  e("NTPC", "POWERGRID", "CUSTOMER", 1, 0.3, "Generation additions need transmission capacity."),
  // Parent / subsidiary and groups
  e(
    "HDFCBANK",
    "HDFCLIFE",
    "SUBSIDIARY",
    1,
    0.4,
    "HDFC Life is an HDFC group insurer distributed by the bank.",
  ),
  e(
    "SBIN",
    "SBILIFE",
    "SUBSIDIARY",
    1,
    0.4,
    "SBI Life is a subsidiary distributed through SBI branches.",
  ),
  e(
    "BAJAJFINSV",
    "BAJFINANCE",
    "SUBSIDIARY",
    1,
    0.6,
    "Bajaj Finserv is the holding company of Bajaj Finance.",
  ),
  e(
    "BAJFINANCE",
    "BAJAJFINSV",
    "SUBSIDIARY",
    1,
    0.6,
    "Bajaj Finance is the largest part of Bajaj Finserv's value.",
  ),
  e("GRASIM", "ULTRACEMCO", "SUBSIDIARY", 1, 0.3, "Grasim is UltraTech's parent company."),
  e("ULTRACEMCO", "GRASIM", "SUBSIDIARY", 1, 0.5, "UltraTech is a large part of Grasim's value."),
  e("RELIANCE", "JIOFIN", "GROUP", 1, 0.3, "Jio Financial was demerged from Reliance."),
  e("ADANIENT", "ADANIPORTS", "GROUP", 1, 0.5, "Adani group sentiment tends to move together."),
  e("ADANIPORTS", "ADANIENT", "GROUP", 1, 0.5, "Adani group sentiment tends to move together."),
  // Peer read-through
  ...peers(["TCS", "INFY", "HCLTECH", "TECHM"], 0.5, "IT services peers share clients and demand."),
  ...peers(
    ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK"],
    0.4,
    "Banks share the same credit and deposit cycle.",
  ),
  ...peers(["MARUTI", "M&M", "TMPV"], 0.4, "Carmakers share demand and input costs."),
  ...peers(["BAJAJ-AUTO", "EICHERMOT"], 0.3, "Two-wheeler makers share demand."),
  ...peers(["SUNPHARMA", "DRREDDY", "CIPLA"], 0.4, "Pharma peers share US pricing and regulators."),
  ...peers(["TATASTEEL", "JSWSTEEL"], 0.6, "Steelmakers share prices and demand."),
  ...peers(["HINDUNILVR", "ITC", "NESTLEIND", "TATACONSUM"], 0.3, "Staples share consumer demand."),
  ...peers(["APOLLOHOSP", "MAXHEALTH"], 0.4, "Hospital chains share demand and regulation."),
  ...peers(["HDFCLIFE", "SBILIFE"], 0.5, "Life insurers share regulation and demand."),
  ...peers(["BAJFINANCE", "SHRIRAMFIN"], 0.3, "Non-bank lenders share funding conditions."),
];

export const factorById = (id: string) => FACTORS.find((f) => f.id === id);
export const isFactor = (id: string) => FACTORS.some((f) => f.id === id);

export type RippleImpact = {
  symbol: string;
  hop: 1 | 2 | 3;
  direction: "UP" | "DOWN";
  /** Relative strength of the ripple at this node, 0-1. */
  strength: number;
  /** Origin first, then each node on the strongest path to this symbol. */
  path: string[];
  edges: RippleEdge[];
};

/** Multiplier per extra hop; reduces a path's curated weight at each step. */
export const HOP_DECAY = 0.6;
/** Ripples weaker than this are not reported. */
export const MIN_STRENGTH = 0.06;

/**
 * Propagate a shock from a factor or stock. Each node keeps its strongest path
 * (best-first), so a stock reached through two routes reports the clearer one.
 * Factors can be intermediate nodes (crude → rupee → IT) but only stocks are
 * reported as impacts.
 */
export function propagate(
  origin: string,
  direction: "UP" | "DOWN",
  edges: readonly RippleEdge[] = RIPPLE_EDGES,
  maxHops = 3,
): RippleImpact[] {
  type Node = { id: string; signed: number; hop: number; path: string[]; edges: RippleEdge[] };
  const best = new Map<string, Node>();
  const start: Node = {
    id: origin,
    signed: direction === "UP" ? 1 : -1,
    hop: 0,
    path: [origin],
    edges: [],
  };
  best.set(origin, start);
  let frontier: Node[] = [start];
  for (let hop = 1; hop <= maxHops; hop++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const edge of edges) {
        if (edge.from !== node.id || node.path.includes(edge.to)) continue;
        // node.signed already carries earlier decay; each extra hop decays once more.
        const signed = node.signed * edge.sign * edge.weight * (hop === 1 ? 1 : HOP_DECAY);
        if (Math.abs(signed) < MIN_STRENGTH) continue;
        const known = best.get(edge.to);
        if (known && Math.abs(known.signed) >= Math.abs(signed)) continue;
        const candidate: Node = {
          id: edge.to,
          signed,
          hop,
          path: [...node.path, edge.to],
          edges: [...node.edges, edge],
        };
        best.set(edge.to, candidate);
        next.push(candidate);
      }
    }
    frontier = next;
  }
  return [...best.values()]
    .filter((node) => node.hop > 0 && !isFactor(node.id))
    .map((node) => ({
      symbol: node.id,
      hop: Math.min(3, node.hop) as 1 | 2 | 3,
      direction: (node.signed >= 0 ? "UP" : "DOWN") as "UP" | "DOWN",
      strength: round(Math.min(1, Math.abs(node.signed)), 3),
      path: node.path,
      edges: node.edges,
    }))
    .sort((a, b) => b.strength - a.strength || a.hop - b.hop);
}

export type RippleOrigin = {
  id: string;
  origin: string;
  direction: "UP" | "DOWN";
  /** Headline that triggered the ripple, or the what-if statement. */
  title: string;
  source: string;
  published_at: string | null;
  url: string | null;
  kind: "NEWS" | "WHAT_IF";
};

const UP_WORDS =
  /\b(rise[sn]?|rising|rose|surge[sd]?|jump(s|ed)?|soar(s|ed)?|climb(s|ed)?|gain(s|ed)?|rall(y|ies|ied)|hike[sd]?|spike[sd]?|up|higher|record high|boost(s|ed)?|strong|beat(s)?|upgrade[sd]?|wins?|approv(al|es|ed))\b/;
const DOWN_WORDS =
  /\b(fall(s|en)?|fell|drop(s|ped)?|slump(s|ed)?|plunge[sd]?|tumble[sd]?|decline[sd]?|slide[sd]?|cut(s)?|lower|down|weak(er|ens?|ened)?|miss(es|ed)?|downgrade[sd]?|curbs?|ban(s|ned)?|probe|penalty|warning letter|slow(s|ed|down)?)\b/;
const UNCONFIRMED_MOVE =
  /\b(may|might|could|would|will|should|expects?|expected|forecasts?|predicts?|likely|unlikely|not|no|never|denies?|denied|if|whether|set to|poised to)\b|\bto (rise|fall|surge|drop|gain|climb|jump|weaken|strengthen)\b/;

/** Direction words in a headline; null when absent or contradictory. */
export function headlineDirection(text: string): "UP" | "DOWN" | null {
  const t = text.toLowerCase();
  if (UNCONFIRMED_MOVE.test(t)) return null;
  const up = UP_WORDS.test(t);
  const down = DOWN_WORDS.test(t);
  if (up === down) return null;
  return up ? "UP" : "DOWN";
}

/**
 * Read only clauses naming the factor. A cause (such as an output cut) is not
 * an observed price move, and another asset's move must not set the direction.
 */
export function factorDirection(factor: FactorId, text: string): "UP" | "DOWN" | null {
  const definition = factorById(factor)!;
  const clauses = text
    .toLowerCase()
    .split(
      /\s+(?:as|after|amid|amidst|despite|while|whereas|but|because|although|with)\s+|[;!?]|\.(?:\s|$)|\s+[—–]\s+/,
    );
  const directions = new Set<"UP" | "DOWN">();
  for (const t of clauses) {
    if (!definition.pattern.test(t)) continue;
    if (UNCONFIRMED_MOVE.test(t)) return null;
    // Multiple subjects in the same clause are ambiguous without a full parser.
    if (FACTORS.some((f) => f.id !== factor && f.pattern.test(t))) return null;
    let direction = headlineDirection(t);
    if (factor === "USDINR" && /\b(rupee|inr)\b/.test(t) && !/\busd\s*\/?\s*inr\b/.test(t)) {
      const weaker = DOWN_WORDS.test(t) || /\bdepreciat\w*\b/.test(t);
      const stronger = UP_WORDS.test(t) || /\b(strengthen|appreciat|recover)\w*\b/.test(t);
      direction = weaker === stronger ? null : weaker ? "UP" : "DOWN";
    }
    if (factor === "RATES") {
      if (/\b(holds?|unchanged|status quo|pause)\b/.test(t)) return null;
      const cut = /\b(rate cuts?|cuts? (the )?repo|yields? (fall|drop|ease|soften))\b/.test(t);
      const hike = /\b(rate hikes?|hikes? (the )?repo|yields? (rise|jump|climb|harden))\b/.test(t);
      if (cut || hike) direction = cut === hike ? null : cut ? "DOWN" : "UP";
    }
    if (
      factor === "CRUDE" &&
      /\b(output|production|supply|stockpiles?|inventor\w*|demand)\b/.test(t) &&
      !/\b(prices?|brent|futures)\b/.test(t)
    )
      continue;
    if (factor === "CRUDE" && !/\b(crude|brent|oil prices?)\b/.test(t)) continue;
    if (factor === "CREDIT_GROWTH" && !/\b(credit|loan|deposit) growth\b/.test(t)) continue;
    if (factor === "US_TECH" && !/\b(it spending|tech spending|nasdaq)\b/.test(t)) continue;
    if (
      factor === "FNO_ACTIVITY" &&
      /\b(curbs?|tighten|restrict|fewer|ban|higher margin)/.test(t)
    ) {
      if (/\b(eases?|lifts?|relax\w*|withdraw\w*)\b/.test(t)) return null;
      direction = "DOWN";
    }
    if (factor === "US_PHARMA" && /\b(warning letter|form 483|import alert|recall)\b/.test(t)) {
      if (/\b(lifts?|withdraw\w*|resolv\w*|clos\w*)\b/.test(t)) return null;
      direction = "DOWN";
    }
    if (direction) directions.add(direction);
  }
  return directions.size === 1 ? [...directions][0]! : null;
}

export type RippleArticle = {
  id: string;
  symbol: string;
  title: string;
  snippet?: string;
  source: string;
  published_at: string;
  url: string;
  sentiment: "positive" | "neutral" | "negative" | "unavailable" | null;
  impact: "low" | "medium" | "high" | null;
};

export const RIPPLE_NEWS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Two news polling intervals; client fetch time never replaces provider time. */
export const RIPPLE_FEED_MAX_AGE_MS = 20 * 60 * 1000;
export type RippleNewsAvailability = "available" | "partial" | "stale" | "unavailable";

export function rippleNewsSnapshot(
  feed:
    | { articles: RippleArticle[]; updated_at: string; provider_status: { status: string } }
    | undefined,
  universe: ReadonlySet<string>,
  now = Date.now(),
  failed = false,
) {
  const updated = feed ? Date.parse(feed.updated_at) : Number.NaN;
  const provider = feed?.provider_status?.status;
  const availability: RippleNewsAvailability =
    failed || !feed || !["available", "partial"].includes(provider ?? "")
      ? "unavailable"
      : !Number.isFinite(updated) || updated > now || now - updated > RIPPLE_FEED_MAX_AGE_MS
        ? "stale"
        : provider === "partial"
          ? "partial"
          : "available";
  return {
    availability,
    updated_at: Number.isFinite(updated) ? feed!.updated_at : null,
    origins:
      availability === "available" || availability === "partial"
        ? detectOrigins(feed!.articles, universe, now)
        : [],
    articles: feed?.articles.length ?? 0,
  };
}

/**
 * Turn news from the last 24 hours into ripple origins. A macro title with a
 * readable direction becomes a factor ripple; a company headline with non-neutral sentiment and
 * at least medium impact becomes a stock ripple. Duplicates of the same
 * origin and direction keep the most recent headline.
 */
export function detectOrigins(
  articles: RippleArticle[],
  universe: ReadonlySet<string>,
  now = Date.now(),
): RippleOrigin[] {
  const out = new Map<string, RippleOrigin>();
  const sorted = articles
    .filter((article) => {
      const published = Date.parse(article.published_at);
      return (
        Number.isFinite(published) && published <= now && now - published <= RIPPLE_NEWS_MAX_AGE_MS
      );
    })
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  for (const article of sorted) {
    const title = article.title.toLowerCase();
    const factors = FACTORS.filter((f) => f.pattern.test(title));
    const candidates: { origin: string; direction: "UP" | "DOWN" | null }[] = factors.map((f) => ({
      origin: f.id,
      direction: factorDirection(f.id, title),
    }));
    if (
      !factors.length &&
      universe.has(article.symbol) &&
      (article.impact === "medium" || article.impact === "high") &&
      (article.sentiment === "positive" || article.sentiment === "negative") &&
      !UNCONFIRMED_MOVE.test(title)
    ) {
      candidates.push({
        origin: article.symbol,
        direction: article.sentiment === "positive" ? "UP" : "DOWN",
      });
    }
    for (const { origin, direction } of candidates) {
      if (!direction) continue;
      const key = `${origin}:${direction}`;
      if (out.has(key)) continue;
      out.set(key, {
        // Preserve existing ledger identities; qualify only additional factors.
        id:
          origin === candidates[0]?.origin
            ? `news:${article.id}`
            : `news:${article.id}:${origin}:${direction}`,
        origin,
        direction,
        title: article.title,
        source: article.source,
        published_at: article.published_at,
        url: article.url,
        kind: "NEWS",
      });
    }
  }
  return [...out.values()];
}

export function whatIfOrigin(
  origin: string,
  direction: "UP" | "DOWN",
  label: string,
): RippleOrigin {
  return {
    id: `what-if:${origin}:${direction}`,
    origin,
    direction,
    title: label,
    source: "What-if scenario",
    published_at: null,
    url: null,
    kind: "WHAT_IF",
  };
}

export type EchoBar = { time: number; close: number };

export type Echo = {
  status: "MEASURED" | "INSUFFICIENT_HISTORY" | "INSUFFICIENT_EVENTS" | "INVALID_INPUT";
  /** Qualifying, aligned, non-overlapping source shock windows. */
  n: number;
  /** Share of those windows on which the target moved in the expected direction. */
  agreement: number | null;
  /** Signed median target return; positive means agreement with the edge. */
  median_move: number | null;
  /** Response window in observed sessions, including the shock session. */
  window_days: number;
};

const validEchoSeries = (bars: EchoBar[]) =>
  bars.every(
    (bar, i) =>
      Number.isFinite(bar.time) &&
      Number.isFinite(bar.close) &&
      bar.close > 0 &&
      (i === 0 || bar.time > bars[i - 1]!.time),
  );

/**
 * Historical echo for a stock-to-stock edge: on days the source moved more
 * than `threshold` standard deviations, how did the target move from the prior
 * close to `window` sessions later, signed by the edge? Uses only the bars
 * supplied (observed history). Baseline and every response session must align
 * across both series. Overlapping response windows count once; fewer than 3
 * qualifying, non-overlapping windows reports n only.
 */
export function historicalEcho(
  source: EchoBar[],
  target: EchoBar[],
  sign: 1 | -1,
  window = 3,
  threshold = 2,
): Echo {
  const empty: Echo = {
    status: "INSUFFICIENT_HISTORY",
    n: 0,
    agreement: null,
    median_move: null,
    window_days: window,
  };
  if (
    !validEchoSeries(source) ||
    !validEchoSeries(target) ||
    (sign !== 1 && sign !== -1) ||
    !Number.isInteger(window) ||
    window < 1 ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  )
    return { ...empty, status: "INVALID_INPUT" };
  if (source.length < 30 || target.length < 30) return empty;
  const sourceReturns = source.slice(1).map((bar, i) => bar.close / source[i]!.close - 1);
  if (!sourceReturns.every(Number.isFinite)) return { ...empty, status: "INVALID_INPUT" };
  const sd = stdev(sourceReturns);
  if (!sd) return { ...empty, status: "INSUFFICIENT_EVENTS" };
  const index = new Map(target.map((bar, i) => [bar.time, i]));
  const moves: number[] = [];
  let lastEnd = -1;
  for (let s = 1; s + window - 1 < source.length; s++) {
    const r = sourceReturns[s - 1]!;
    if (s <= lastEnd) continue;
    if (Math.abs(r) < threshold * sd) continue;
    const i = index.get(source[s]!.time);
    if (i == null || i < 1 || i + window - 1 >= target.length) continue;
    if (
      !source
        .slice(s - 1, s + window)
        .every((bar, offset) => target[i - 1 + offset]!.time === bar.time)
    )
      continue;
    const move = target[i + window - 1]!.close / target[i - 1]!.close - 1;
    if (!Number.isFinite(move)) continue;
    moves.push(Math.sign(r) * sign * move);
    lastEnd = s + window - 1;
  }
  if (moves.length < 3) return { ...empty, status: "INSUFFICIENT_EVENTS", n: moves.length };
  return {
    status: "MEASURED",
    n: moves.length,
    agreement: round(moves.filter((m) => m > 0).length / moves.length, 3),
    median_move: median(moves),
    window_days: window,
  };
}

/** Plain-language chain, e.g. "Crude oil prices rise → Aviation fuel is ... → INDIGO". */
export function explainChain(
  impact: RippleImpact,
  origin: RippleOrigin,
  name: (id: string) => string,
) {
  const first = factorById(origin.origin);
  const opening = first
    ? origin.direction === "UP"
      ? first.up
      : first.down
    : `${name(origin.origin)} ${origin.direction === "UP" ? "rises" : "falls"}`;
  const steps = impact.edges.map((edge) => `${name(edge.to)}: ${edge.why}`);
  return [opening, ...steps];
}

/** Locked ripple call, scored later by the track-record engine. */
export type RippleCall = {
  symbol: string;
  direction: "UP" | "DOWN";
  hop: 1 | 2 | 3;
  strength: number;
  as_of: string;
};

export function rippleCalls(impacts: RippleImpact[], asOf: string, limit = 12): RippleCall[] {
  return impacts.slice(0, limit).map((impact) => ({
    symbol: impact.symbol,
    direction: impact.direction,
    hop: impact.hop,
    strength: impact.strength,
    as_of: asOf,
  }));
}
