/**
 * Product capability copy, shared by the standalone section components used
 * on sub-pages and by the homepage's scroll-driven pipeline story. Product
 * descriptions only: no simulated observations or performance claims.
 */
export type StoryChapter = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  items: readonly string[];
};

export const STORY = {
  marketIntelligence: {
    id: "market-intelligence",
    eyebrow: "Market intelligence",
    title: "Read the market with context.",
    body: "Provider observations in the local terminal include source and freshness information. Missing feeds remain unavailable.",
    items: [
      "Inspect market snapshots in the terminal.",
      "Distinguish current observations from delayed or closed-session snapshots.",
      "Review evidence before forming a view.",
    ],
  },
  signals: {
    id: "signals",
    eyebrow: "Research pipeline",
    title: "From observations to a reviewable thesis.",
    body: "Market observations, news and model interpretations serve different roles. Research never receives authority to place broker orders.",
    items: [
      "Check source availability.",
      "Inspect deterministic calculations.",
      "Review uncertainty and contradictory evidence.",
    ],
  },
  aiAnalyst: {
    id: "ai-analyst",
    eyebrow: "Quant AI",
    title: "Ask a question. Inspect the evidence.",
    body: "The copilot uses available account and market context. Responses can be incomplete or wrong; its research quality is still under evaluation.",
    items: [
      "Ask for explanations and compare evidence.",
      "Check observation times and missing inputs.",
      "Submit any paper order yourself through the trading desk.",
    ],
  },
  explorer: {
    id: "explorer",
    eyebrow: "Market explorer",
    title: "Explore the evidence.",
    body: "Open the local terminal to browse instruments and inspect available market history. This public page does not publish a market tape.",
    items: [
      "Search by instrument.",
      "Inspect provider price history when available.",
      "Review missing data and feed errors.",
    ],
  },
  research: {
    id: "research",
    eyebrow: "Research workspace",
    title: "Follow the research process.",
    body: "Research is generated on request from available evidence. Model opinions remain unproven until their evaluation gates pass.",
    items: [
      "Inspect research progress and failures.",
      "Compare the thesis with its counter-case.",
      "Keep evidence cutoffs and forecast horizons visible.",
    ],
  },
  portfolio: {
    id: "portfolio",
    eyebrow: "Portfolio intelligence",
    title: "Understand your paper book.",
    body: "Start with your own virtual deposits and recorded paper fills. The terminal shows your holdings and account history.",
    items: [
      "Review cash and holdings.",
      "Inspect recorded fills and average cost.",
      "Use explicit what-if inputs when exploring exposure.",
    ],
  },
  risk: {
    id: "risk",
    eyebrow: "Paper risk controls",
    title: "Set boundaries before adding exposure.",
    body: "The local paper book enforces order size, concentration, pause and a cash-flow-adjusted loss guard. Risk-reducing delivery exits remain available. Live marks and unattended protection remain subject to readiness checks.",
    items: [
      "Configure order value and position limits.",
      "Pause new exposure while retaining exits.",
      "Review the enforcement reason when an order is rejected.",
    ],
  },
} satisfies Record<string, StoryChapter>;

/** Homepage order: from observation to decision to risk. */
export const STORY_ORDER: StoryChapter[] = [
  STORY.marketIntelligence,
  STORY.signals,
  STORY.aiAnalyst,
  STORY.explorer,
  STORY.research,
  STORY.portfolio,
  STORY.risk,
];
