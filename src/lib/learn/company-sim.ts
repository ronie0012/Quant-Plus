/**
 * "Be the Company": a short, deterministic business simulation that teaches
 * what a share is from the inside. The learner founds a chai brand, sells a
 * stake to friends (dilution), runs four quarters (revenue, profit, EPS,
 * dividends), lists in an IPO (P/E, market cap) and then watches the share
 * price react to results against expectations. All numbers are illustrative.
 */
import { seededRandom } from "../quant/stats.ts";
import type { ConceptId } from "./concepts.ts";

export type Phase = "FOUNDING" | "RAISE" | "OPERATE" | "IPO" | "LISTED" | "DONE";

export type QuarterResult = {
  quarter: number;
  strategy: string;
  event: string | null;
  cups: number;
  price_per_cup: number;
  revenue: number;
  profit: number;
  eps: number;
  dividend: number;
  /** Listed quarters only. */
  expected_profit: number | null;
  share_price: number | null;
};

export type CompanyState = {
  name: string;
  seed: number;
  phase: Phase;
  quarter: number;
  cash: number;
  outlets: number;
  price_per_cup: number;
  /** Cups per outlet per quarter before strategy and events. */
  demand: number;
  cost_per_cup: number;
  founder_shares: number;
  total_shares: number;
  share_price: number | null;
  pe: number | null;
  history: QuarterResult[];
  concepts: ConceptId[];
  log: string[];
};

export const FOUNDER_CAPITAL = 100_000;
export const FOUNDER_SHARES = 10_000;
export const FRIENDS_CAPITAL = 100_000;
export const OUTLET_COST = 60_000;
export const FIXED_COST = 55_000;
export const PRIVATE_QUARTERS = 4;
export const LISTED_QUARTERS = 4;

export function newCompany(name: string, seed = 7): CompanyState {
  return {
    name: name.trim().replace(/[.\s]+$/, "") || "Chai Co",
    seed,
    phase: "FOUNDING",
    quarter: 0,
    cash: FOUNDER_CAPITAL,
    outlets: 1,
    price_per_cup: 15,
    demand: 9_000,
    cost_per_cup: 8,
    founder_shares: FOUNDER_SHARES,
    total_shares: FOUNDER_SHARES,
    share_price: null,
    pe: null,
    history: [],
    concepts: ["share", "ownership"],
    log: [],
  };
}

export type Choice = { id: string; label: string; detail: string; disabled?: boolean };

export type StepView = {
  title: string;
  story: string;
  choices: Choice[];
  /** Concept introduced on this step, if any. */
  concept: ConceptId | null;
};

export const ownership = (s: CompanyState) => s.founder_shares / s.total_shares;
export const marketCap = (s: CompanyState) =>
  s.share_price == null ? null : s.share_price * s.total_shares;
export const founderValue = (s: CompanyState) =>
  s.share_price == null ? null : s.share_price * s.founder_shares;

const rupees = (n: number) =>
  `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

const STRATEGIES: Choice[] = [
  {
    id: "OUTLET",
    label: "Open a new outlet",
    detail: `Costs ${rupees(OUTLET_COST)} now; another stall selling every quarter after.`,
  },
  { id: "DISCOUNT", label: "Run a discount", detail: "Price −15%, about 25% more cups sold." },
  { id: "PRICE_UP", label: "Raise prices", detail: "Price +10%, about 8% fewer cups sold." },
  { id: "STEADY", label: "Keep things steady", detail: "No change. Save cash." },
  {
    id: "DIVIDEND",
    label: "Pay a dividend",
    detail: "Pay half of last quarter's profit to shareholders.",
  },
];

const EVENTS = [
  {
    text: "Milk prices rose — your cost per cup went up.",
    demand: 1,
    cost: 1.12,
    concept: "ripple",
  },
  { text: "A good monsoon lifted spending around town.", demand: 1.1, cost: 1, concept: null },
  { text: "A rival stall opened across the road.", demand: 0.88, cost: 1, concept: null },
  { text: "Festival season — queues all week.", demand: 1.2, cost: 1, concept: null },
  { text: null, demand: 1, cost: 1, concept: null },
] as const;

export function view(s: CompanyState): StepView {
  const lastProfit = s.history.at(-1)?.profit ?? 0;
  const strategies = STRATEGIES.map((c) =>
    c.id === "OUTLET" && s.cash < OUTLET_COST
      ? { ...c, disabled: true, detail: `Needs ${rupees(OUTLET_COST)} in cash.` }
      : c.id === "DIVIDEND" && (lastProfit <= 0 || s.cash < lastProfit / 2)
        ? { ...c, disabled: true, detail: "Needs a profitable last quarter and the cash to pay." }
        : c,
  );
  switch (s.phase) {
    case "FOUNDING":
      return {
        title: `You founded ${s.name}`,
        story: `You put ${rupees(FOUNDER_CAPITAL)} into your chai brand. The company issues ${FOUNDER_SHARES.toLocaleString("en-IN")} shares at ₹10 each — all of them yours. You own 100% of the company.`,
        choices: [{ id: "NEXT", label: "Open the first stall", detail: "Start the story." }],
        concept: "share",
      };
    case "RAISE":
      return {
        title: "Friends want to invest",
        story: `Two friends offer ${rupees(FRIENDS_CAPITAL)} to help you grow. In return they want new shares. How much of the company will you give them?`,
        choices: [
          { id: "GIVE_20", label: "Give 20%", detail: "You keep 80%." },
          { id: "GIVE_33", label: "Give one third", detail: "You keep 67%." },
          { id: "GIVE_50", label: "Give half", detail: "You keep 50%." },
        ],
        concept: "dilution",
      };
    case "OPERATE":
      return {
        title: `Quarter ${s.quarter + 1} of ${PRIVATE_QUARTERS}: run the business`,
        story:
          s.quarter === 0
            ? "Each quarter you choose one move. Revenue is every rupee customers pay; profit is what is left after milk, rent and wages."
            : `Last quarter: revenue ${rupees(s.history.at(-1)!.revenue)}, profit ${rupees(lastProfit)}. Cash in hand: ${rupees(s.cash)}.`,
        choices: strategies,
        concept: s.quarter === 0 ? "revenue_profit" : s.quarter === 1 ? "eps" : null,
      };
    case "IPO": {
      const { eps, pe, price } = ipoTerms(s);
      return {
        title: "Your IPO",
        story: `${s.name} earned ${rupees(eps * s.total_shares)} in its first year — ${rupees(eps)} per share. Investors will pay ${pe}× that (its P/E), so each share lists at ${rupees(price)}. How many new shares will you sell to the public?`,
        choices: [
          {
            id: "IPO_10",
            label: "Sell 10% new shares",
            detail: "Raise less, keep more ownership.",
          },
          { id: "IPO_25", label: "Sell 25% new shares", detail: "Raise more cash to grow." },
        ],
        concept: "ipo",
      };
    }
    case "LISTED": {
      const expected = expectedProfit(s);
      return {
        title: `Listed quarter ${s.quarter - PRIVATE_QUARTERS + 1} of ${LISTED_QUARTERS}`,
        story: `Your share trades at ${rupees(s.share_price!)} (market cap ${rupees(marketCap(s)!)}). Analysts expect a profit of about ${rupees(expected)} this quarter. Beat it and the price tends to rise; miss it and it tends to fall.`,
        choices: strategies,
        concept:
          s.quarter === PRIVATE_QUARTERS
            ? "expectations"
            : s.quarter === PRIVATE_QUARTERS + 1
              ? "market_cap"
              : null,
      };
    }
    case "DONE":
      return { title: "Your company's story", story: summaryText(s), choices: [], concept: null };
  }
}

/** First-year EPS and the P/E the market pays, from revenue growth. */
export function ipoTerms(s: CompanyState) {
  const year = s.history.slice(-PRIVATE_QUARTERS);
  const profit = year.reduce((t, q) => t + q.profit, 0);
  const eps = Math.max(0.5, profit / s.total_shares);
  const first = year[0]?.revenue ?? 1;
  const last = year.at(-1)?.revenue ?? first;
  const growth = last / first - 1;
  const pe = Math.round(Math.min(30, Math.max(12, 12 + growth * 40)));
  const rounded = Math.round(eps * 100) / 100;
  return { eps: rounded, pe, price: Math.round(rounded * pe * 100) / 100 };
}

/** Market expectation: last profit grown at the recent average growth rate. */
export function expectedProfit(s: CompanyState) {
  const profits = s.history.map((q) => q.profit);
  const last = profits.at(-1) ?? 0;
  const prev = profits.at(-2) ?? last;
  const growth = prev > 0 ? Math.min(0.3, Math.max(-0.1, last / prev - 1)) : 0.05;
  return Math.round(last * (1 + growth));
}

function runQuarter(s: CompanyState, strategy: string): CompanyState {
  const rng = seededRandom(s.seed * 97 + s.quarter * 13);
  const event = EVENTS[Math.floor(rng() * EVENTS.length)]!;
  let { outlets, cash, price_per_cup: price, demand } = s;
  const concepts = new Set(s.concepts);
  let dividend = 0;
  let cupFactor = 1;
  let salePrice = price;
  const lastProfit = s.history.at(-1)?.profit ?? 0;
  if (strategy === "OUTLET") {
    cash -= OUTLET_COST;
    outlets += 1;
  } else if (strategy === "DISCOUNT") {
    salePrice = Math.round(price * 0.85 * 100) / 100;
    cupFactor = 1.25;
  } else if (strategy === "PRICE_UP") {
    price = Math.round(price * 1.1 * 100) / 100;
    salePrice = price;
    demand = Math.round(demand * 0.92);
  } else if (strategy === "DIVIDEND") {
    dividend = Math.round(lastProfit / 2);
    cash -= dividend;
    concepts.add("dividend");
  }
  // Discounts lift volume for the quarter only; customers expect them back.
  const cups = Math.round(outlets * demand * event.demand * cupFactor);
  const cost = s.cost_per_cup * event.cost;
  const revenue = Math.round(cups * salePrice);
  const profit = Math.round(revenue - cups * cost - outlets * FIXED_COST);
  cash += profit;
  if (event.concept) concepts.add(event.concept);

  let sharePrice = s.share_price;
  let expected: number | null = null;
  if (s.phase === "LISTED" && sharePrice != null) {
    expected = expectedProfit(s);
    const surprise = expected > 0 ? profit / expected - 1 : profit > 0 ? 0.2 : -0.2;
    const noise = (rng() - 0.5) * 0.04;
    const move = Math.min(0.25, Math.max(-0.25, surprise * 1.5 + noise));
    sharePrice = Math.max(1, Math.round(sharePrice * (1 + move) * 100) / 100);
    concepts.add("expectations");
  }
  const result: QuarterResult = {
    quarter: s.quarter + 1,
    strategy,
    event: event.text,
    cups,
    price_per_cup: salePrice,
    revenue,
    profit,
    eps: Math.round((profit / s.total_shares) * 100) / 100,
    dividend,
    expected_profit: expected,
    share_price: sharePrice,
  };
  const quarter = s.quarter + 1;
  const phase: Phase =
    s.phase === "OPERATE"
      ? quarter >= PRIVATE_QUARTERS
        ? "IPO"
        : "OPERATE"
      : quarter >= PRIVATE_QUARTERS + LISTED_QUARTERS
        ? "DONE"
        : "LISTED";
  concepts.add("revenue_profit");
  if (quarter >= 2) concepts.add("eps");
  return {
    ...s,
    phase,
    quarter,
    cash,
    outlets,
    price_per_cup: price,
    demand,
    share_price: sharePrice,
    history: [...s.history, result],
    concepts: [...concepts],
    log: [...s.log, event.text ?? `Quarter ${quarter} ran without surprises.`],
  };
}

/** Apply one choice. Invalid or disabled choices leave the state unchanged. */
export function act(s: CompanyState, choice: string): CompanyState {
  const available = view(s).choices.find((c) => c.id === choice);
  if (!available || available.disabled) return s;
  switch (s.phase) {
    case "FOUNDING":
      return { ...s, phase: "RAISE" };
    case "RAISE": {
      const give = choice === "GIVE_20" ? 0.2 : choice === "GIVE_33" ? 1 / 3 : 0.5;
      const issued = Math.round((s.total_shares * give) / (1 - give));
      return {
        ...s,
        phase: "OPERATE",
        cash: s.cash + FRIENDS_CAPITAL,
        total_shares: s.total_shares + issued,
        concepts: [...new Set([...s.concepts, "dilution" as const])],
        log: [
          ...s.log,
          `Friends invested ${rupees(FRIENDS_CAPITAL)} for ${issued.toLocaleString("en-IN")} new shares.`,
        ],
      };
    }
    case "IPO": {
      const { pe, price } = ipoTerms(s);
      const share = choice === "IPO_10" ? 0.1 : 0.25;
      const issued = Math.round((s.total_shares * share) / (1 - share));
      return {
        ...s,
        phase: "LISTED",
        cash: s.cash + issued * price,
        total_shares: s.total_shares + issued,
        share_price: price,
        pe,
        concepts: [
          ...new Set([...s.concepts, "ipo" as const, "pe" as const, "market_cap" as const]),
        ],
        log: [...s.log, `Listed at ${rupees(price)} a share, raising ${rupees(issued * price)}.`],
      };
    }
    case "OPERATE":
    case "LISTED":
      return runQuarter(s, choice);
    case "DONE":
      return s;
  }
}

export function summaryText(s: CompanyState) {
  const value = founderValue(s);
  const pct = Math.round(ownership(s) * 1000) / 10;
  if (value == null) return "";
  const multiple = Math.round((value / FOUNDER_CAPITAL) * 10) / 10;
  const lesson =
    multiple >= 1
      ? "You own a smaller slice of a bigger company: that is dilution working for you."
      : "Your stake is worth less than you put in: the business earned too little profit, and the share price reflects it. Selling more is not the same as earning more.";
  return `You now own ${pct}% of ${s.name}. Your ${s.founder_shares.toLocaleString("en-IN")} shares are worth ${rupees(value)} at ${rupees(s.share_price!)} each — ${multiple}× the ${rupees(FOUNDER_CAPITAL)} you started with. ${lesson}`;
}
