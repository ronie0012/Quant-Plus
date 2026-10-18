/**
 * Concept mastery for the AI tutor. Each concept has short checks; mastery
 * is updated with Bayesian Knowledge Tracing (Corbett & Anderson, 1994): a
 * learner either knows a concept or not, may slip when they know it or
 * guess when they do not, and may learn it between attempts.
 */
export type ConceptId =
  | "share"
  | "ownership"
  | "dilution"
  | "revenue_profit"
  | "eps"
  | "pe"
  | "market_cap"
  | "dividend"
  | "ipo"
  | "expectations"
  | "stop_loss"
  | "position_size"
  | "diversification"
  | "ripple";

export type Check = {
  question: string;
  options: string[];
  answer: number;
  why: string;
};

export type Concept = {
  id: ConceptId;
  title: string;
  /** One-line plain-language meaning. */
  meaning: string;
  checks: Check[];
};

export const CONCEPTS: readonly Concept[] = [
  {
    id: "share",
    title: "Share",
    meaning: "A small piece of ownership in a company.",
    checks: [
      {
        question: "You buy 10 shares of a company. What do you own?",
        options: [
          "A loan to the company",
          "A small part of the company",
          "A promise of fixed interest",
        ],
        answer: 1,
        why: "A share is part-ownership. Loans and fixed interest are what bonds give you.",
      },
      {
        question: "Why can a share price change during the day?",
        options: [
          "The company changes it every hour",
          "Buyers and sellers keep agreeing on new prices",
          "SEBI sets a new price each morning",
        ],
        answer: 1,
        why: "The price is simply the last price a buyer and a seller agreed on.",
      },
    ],
  },
  {
    id: "ownership",
    title: "Ownership %",
    meaning: "Your shares divided by all the shares that exist.",
    checks: [
      {
        question: "A company has 1,000 shares. You own 50. What do you own?",
        options: ["50%", "5%", "0.5%"],
        answer: 1,
        why: "50 ÷ 1,000 = 0.05, which is 5%.",
      },
    ],
  },
  {
    id: "dilution",
    title: "Dilution",
    meaning: "When a company issues new shares, each existing share owns a smaller slice.",
    checks: [
      {
        question:
          "You own 100 of 1,000 shares. The company issues 1,000 new shares. Your ownership is now…",
        options: ["10%", "5%", "20%"],
        answer: 1,
        why: "You still have 100 shares, but there are now 2,000: 100 ÷ 2,000 = 5%.",
      },
    ],
  },
  {
    id: "revenue_profit",
    title: "Revenue vs profit",
    meaning: "Revenue is money coming in; profit is what is left after all costs.",
    checks: [
      {
        question:
          "A chai stall sells ₹10,000 of tea and spends ₹7,000 on milk, rent and wages. Profit?",
        options: ["₹10,000", "₹3,000", "₹17,000"],
        answer: 1,
        why: "Profit = revenue − costs = ₹10,000 − ₹7,000.",
      },
    ],
  },
  {
    id: "eps",
    title: "Earnings per share (EPS)",
    meaning: "Profit divided by the number of shares.",
    checks: [
      {
        question: "Profit is ₹1,00,000 and there are 10,000 shares. EPS?",
        options: ["₹1", "₹10", "₹100"],
        answer: 1,
        why: "₹1,00,000 ÷ 10,000 shares = ₹10 per share.",
      },
    ],
  },
  {
    id: "pe",
    title: "P/E ratio",
    meaning: "How many rupees investors pay for each rupee of yearly profit per share.",
    checks: [
      {
        question: "A share costs ₹200 and its EPS is ₹10. What is the P/E?",
        options: ["10", "20", "2,000"],
        answer: 1,
        why: "P/E = price ÷ EPS = 200 ÷ 10 = 20.",
      },
      {
        question: "Why might investors accept a high P/E?",
        options: [
          "They expect profits to grow fast",
          "The company has no profit",
          "High P/E always means a bargain",
        ],
        answer: 0,
        why: "Paying more per rupee of profit today only makes sense if profits are expected to grow.",
      },
    ],
  },
  {
    id: "market_cap",
    title: "Market capitalisation",
    meaning: "Share price × number of shares: what the market values the whole company at.",
    checks: [
      {
        question: "Price ₹500, shares 2 crore. Market cap?",
        options: ["₹500 crore", "₹1,000 crore", "₹250 crore"],
        answer: 1,
        why: "₹500 × 2 crore shares = ₹1,000 crore.",
      },
    ],
  },
  {
    id: "dividend",
    title: "Dividend",
    meaning: "Part of the profit paid out in cash to shareholders.",
    checks: [
      {
        question: "What usually happens to a share price on the day it goes ex-dividend?",
        options: ["It rises by the dividend", "It falls by about the dividend", "Nothing at all"],
        answer: 1,
        why: "Cash leaves the company, so the share is worth about that much less.",
      },
    ],
  },
  {
    id: "ipo",
    title: "IPO",
    meaning: "The first time a company sells shares to the public on a stock exchange.",
    checks: [
      {
        question: "Why does a company do an IPO?",
        options: [
          "To raise money from the public and let owners sell",
          "To borrow from a bank",
          "To avoid publishing results",
        ],
        answer: 0,
        why: "Listed companies must publish results; the IPO raises capital and creates a market for shares.",
      },
    ],
  },
  {
    id: "expectations",
    title: "Expectations",
    meaning: "Prices move on surprises — results better or worse than people expected.",
    checks: [
      {
        question: "Profit grows 20%, but everyone expected 35%. The share most likely…",
        options: ["Rises sharply", "Falls", "Cannot move"],
        answer: 1,
        why: "Good news that is worse than expected is a disappointment, and prices react to the surprise.",
      },
    ],
  },
  {
    id: "stop_loss",
    title: "Stop-loss",
    meaning: "A price, decided in advance, at which you exit to cap a loss.",
    checks: [
      {
        question: "When should you decide your stop-loss?",
        options: ["Before you buy", "After the price falls", "Only if the news is bad"],
        answer: 0,
        why: "Deciding after the fall is when fear and hope make the choice for you.",
      },
    ],
  },
  {
    id: "position_size",
    title: "Position sizing",
    meaning: "Choosing how much to buy so a stopped-out trade loses only a planned amount.",
    checks: [
      {
        question: "You will risk ₹1,000. Entry ₹100, stop ₹95. How many shares?",
        options: ["10", "200", "1,000"],
        answer: 1,
        why: "Risk per share is ₹5, so ₹1,000 ÷ ₹5 = 200 shares.",
      },
    ],
  },
  {
    id: "diversification",
    title: "Diversification",
    meaning: "Spreading money across unrelated companies so one bad event cannot sink you.",
    checks: [
      {
        question: "Which basket is most diversified?",
        options: [
          "Three IT companies",
          "A bank, a pharma company and a carmaker",
          "Three steelmakers",
        ],
        answer: 1,
        why: "Companies in different industries are hit by different events.",
      },
    ],
  },
  {
    id: "ripple",
    title: "Ripple effects",
    meaning: "News about one thing can move connected companies too.",
    checks: [
      {
        question: "Crude oil prices jump. Which company is most likely hurt?",
        options: ["An airline", "An oil producer", "An IT exporter"],
        answer: 0,
        why: "Fuel is an airline's biggest cost; producers earn more and IT is barely linked.",
      },
      {
        question: "The rupee weakens against the dollar. Who usually benefits?",
        options: ["IT exporters", "Airlines", "Paint makers"],
        answer: 0,
        why: "IT firms earn dollars and pay costs in rupees, so each dollar converts to more rupees.",
      },
    ],
  },
];

export const conceptById = (id: string) => CONCEPTS.find((c) => c.id === id);

export const BKT = { prior: 0.2, learn: 0.25, slip: 0.1, guess: 0.25 } as const;
export const MASTERED = 0.85;

/** Probability the learner knows the concept after one answer. */
export function updateMastery(p: number, correct: boolean): number {
  const { learn, slip, guess } = BKT;
  const posterior = correct
    ? (p * (1 - slip)) / (p * (1 - slip) + (1 - p) * guess)
    : (p * slip) / (p * slip + (1 - p) * (1 - guess));
  return Math.round((posterior + (1 - posterior) * learn) * 1000) / 1000;
}

export type Mastery = Partial<Record<ConceptId, number>>;

export const masteryOf = (mastery: Mastery, id: ConceptId) => mastery[id] ?? BKT.prior;

/** The least-known concept, with ties broken by curriculum order. */
export function nextConcept(mastery: Mastery): Concept {
  return [...CONCEPTS].sort((a, b) => masteryOf(mastery, a.id) - masteryOf(mastery, b.id))[0]!;
}
