/**
 * Investor DNA. A stated profile from onboarding answers, split into risk
 * capacity (what the person can afford to lose) and risk tolerance (what
 * they say they can stomach), and a revealed profile from their own paper
 * round trips. The practice profile is the more cautious of the two, as in
 * standard suitability practice. Educational paper practice only.
 */
import { median, round } from "../quant/stats.ts";

export type RiskLevel = "CAUTIOUS" | "BALANCED" | "GROWTH" | "AGGRESSIVE";
export const RISK_LEVELS: readonly RiskLevel[] = ["CAUTIOUS", "BALANCED", "GROWTH", "AGGRESSIVE"];
export const RISK_LABELS: Record<RiskLevel, string> = {
  CAUTIOUS: "Cautious",
  BALANCED: "Balanced",
  GROWTH: "Growth",
  AGGRESSIVE: "Aggressive",
};

export type QuestionId =
  | "life_stage"
  | "income"
  | "emergency_fund"
  | "horizon"
  | "experience"
  | "drop_reaction"
  | "drawdown_comfort"
  | "goal";

export type Question = {
  id: QuestionId;
  /** Capacity: ability to bear loss. Tolerance: willingness to bear it. */
  dimension: "CAPACITY" | "TOLERANCE";
  prompt: string;
  hint: string;
  options: { value: string; label: string; score: 0 | 1 | 2 | 3 }[];
};

export const QUESTIONS: readonly Question[] = [
  {
    id: "life_stage",
    dimension: "CAPACITY",
    prompt: "What best describes you right now?",
    hint: "Your stage of life changes how much a loss would hurt.",
    options: [
      { value: "STUDENT", label: "Student", score: 1 },
      { value: "SALARIED", label: "Salaried job", score: 2 },
      { value: "SELF_EMPLOYED", label: "Business or self-employed", score: 2 },
      { value: "HOMEMAKER", label: "Homemaker", score: 1 },
      { value: "RETIRED", label: "Retired", score: 0 },
    ],
  },
  {
    id: "income",
    dimension: "CAPACITY",
    prompt: "Your yearly income (or pocket money) band?",
    hint: "Used only to size practice limits. It stays on this device.",
    options: [
      { value: "NONE", label: "No regular income", score: 0 },
      { value: "UNDER_5L", label: "Under ₹5 lakh", score: 1 },
      { value: "5L_15L", label: "₹5–15 lakh", score: 2 },
      { value: "OVER_15L", label: "Over ₹15 lakh", score: 3 },
    ],
  },
  {
    id: "emergency_fund",
    dimension: "CAPACITY",
    prompt: "If your income stopped, how long could your savings cover your expenses?",
    hint: "Money you might need soon should never be at risk.",
    options: [
      { value: "NONE", label: "I have no savings buffer", score: 0 },
      { value: "UNDER_3M", label: "Less than 3 months", score: 1 },
      { value: "3_6M", label: "3–6 months", score: 2 },
      { value: "OVER_6M", label: "More than 6 months", score: 3 },
    ],
  },
  {
    id: "horizon",
    dimension: "CAPACITY",
    prompt: "When might you need the money you would invest?",
    hint: "Longer horizons give prices time to recover.",
    options: [
      { value: "UNDER_1Y", label: "Within a year", score: 0 },
      { value: "1_3Y", label: "In 1–3 years", score: 1 },
      { value: "3_5Y", label: "In 3–5 years", score: 2 },
      { value: "OVER_5Y", label: "Not for 5+ years", score: 3 },
    ],
  },
  {
    id: "experience",
    dimension: "TOLERANCE",
    prompt: "How much have you invested or traded before?",
    hint: "There is no wrong answer — the app adapts to you.",
    options: [
      { value: "NONE", label: "Never", score: 0 },
      { value: "UNDER_1Y", label: "Less than a year", score: 1 },
      { value: "1_3Y", label: "1–3 years", score: 2 },
      { value: "OVER_3Y", label: "More than 3 years", score: 3 },
    ],
  },
  {
    id: "drop_reaction",
    dimension: "TOLERANCE",
    prompt: "Your investments fall 20% in one month. What do you do?",
    hint: "Answer with what you would actually do, not what you should do.",
    options: [
      { value: "SELL_ALL", label: "Sell everything", score: 0 },
      { value: "SELL_SOME", label: "Sell some to feel safer", score: 1 },
      { value: "HOLD", label: "Hold and wait", score: 2 },
      { value: "BUY_MORE", label: "Buy more while it is cheaper", score: 3 },
    ],
  },
  {
    id: "drawdown_comfort",
    dimension: "TOLERANCE",
    prompt: "What is the biggest temporary fall you could sit through calmly?",
    hint: "A fall you can live with without losing sleep.",
    options: [
      { value: "5", label: "5%", score: 0 },
      { value: "10", label: "10%", score: 1 },
      { value: "20", label: "20%", score: 2 },
      { value: "30", label: "30% or more", score: 3 },
    ],
  },
  {
    id: "goal",
    dimension: "TOLERANCE",
    prompt: "What do you mainly want from Quant Plus?",
    hint: "This shapes your learning path.",
    options: [
      { value: "INCOME", label: "Steady, low-risk growth", score: 0 },
      { value: "LEARN", label: "Learn how the market works", score: 1 },
      { value: "WEALTH", label: "Build long-term wealth", score: 2 },
      { value: "TRADING", label: "Practise active trading", score: 3 },
    ],
  },
];

export type Answers = Partial<Record<QuestionId, string>>;

export type InvestorProfile = {
  answers: Answers;
  completed_at: string;
};

const bucket = (score: number, max: number): RiskLevel => {
  const share = max ? score / max : 0;
  return share < 0.3
    ? "CAUTIOUS"
    : share < 0.55
      ? "BALANCED"
      : share < 0.8
        ? "GROWTH"
        : "AGGRESSIVE";
};

export const levelIndex = (level: RiskLevel) => RISK_LEVELS.indexOf(level);

export type StatedProfile = {
  capacity: RiskLevel;
  tolerance: RiskLevel;
  /** The more cautious of capacity and tolerance. */
  practice: RiskLevel;
  complete: boolean;
  answered: number;
};

export function statedProfile(answers: Answers): StatedProfile {
  const score = (dimension: Question["dimension"]) => {
    const questions = QUESTIONS.filter((q) => q.dimension === dimension);
    const total = questions.reduce(
      (t, q) => t + (q.options.find((o) => o.value === answers[q.id])?.score ?? 0),
      0,
    );
    return bucket(total, questions.length * 3);
  };
  const capacity = score("CAPACITY");
  const tolerance = score("TOLERANCE");
  const answered = QUESTIONS.filter((q) => answers[q.id] != null).length;
  return {
    capacity,
    tolerance,
    practice: levelIndex(capacity) <= levelIndex(tolerance) ? capacity : tolerance,
    complete: answered === QUESTIONS.length,
    answered,
  };
}

export type Trip = { return_pct: number; entry_value: number; entry_at: string; exit_at: string };

export type RevealedProfile = {
  level: RiskLevel | null;
  sample: number;
  min_sample: number;
  /** Median entry size as a share of total funds. */
  median_size_pct: number | null;
  /** Share of losing trades closed within a 2% loss. */
  quick_loss_exit_pct: number | null;
  /** Share of trades that lost more than 8%. */
  deep_loss_pct: number | null;
  /** Losers held this many times longer than winners (median); >1 is the disposition effect. */
  loser_hold_ratio: number | null;
  observations: string[];
};

export const REVEALED_MIN_SAMPLE = 5;

const days = (t: Trip) =>
  Math.max(0, (Date.parse(t.exit_at) - Date.parse(t.entry_at)) / 86_400_000);

/**
 * Revealed risk from closed paper round trips: how large positions are, how
 * deep losses are allowed to run, and whether losers are held longer than
 * winners. Fewer than REVEALED_MIN_SAMPLE trips reports no level.
 */
export function revealedProfile(trips: Trip[], totalFunds: number): RevealedProfile {
  const base: RevealedProfile = {
    level: null,
    sample: trips.length,
    min_sample: REVEALED_MIN_SAMPLE,
    median_size_pct: null,
    quick_loss_exit_pct: null,
    deep_loss_pct: null,
    loser_hold_ratio: null,
    observations: [],
  };
  if (trips.length < REVEALED_MIN_SAMPLE || totalFunds <= 0) return base;
  const sizePct = median(trips.map((t) => (t.entry_value / totalFunds) * 100)) ?? 0;
  const losers = trips.filter((t) => t.return_pct < 0);
  const winners = trips.filter((t) => t.return_pct > 0);
  const quick = losers.length
    ? (losers.filter((t) => t.return_pct > -2).length / losers.length) * 100
    : null;
  const deep = (trips.filter((t) => t.return_pct < -8).length / trips.length) * 100;
  const loserHold = median(losers.map(days));
  const winnerHold = median(winners.map(days));
  const holdRatio =
    loserHold != null && winnerHold != null && winnerHold > 0 ? loserHold / winnerHold : null;

  const sizeScore = sizePct < 5 ? 0 : sizePct < 12 ? 1 : sizePct < 25 ? 2 : 3;
  const lossScore = deep >= 25 ? 3 : deep >= 10 ? 2 : quick != null && quick >= 70 ? 0 : 1;
  const level = bucket(sizeScore + lossScore, 6);

  const observations: string[] = [];
  observations.push(`Your typical position uses ${round(sizePct, 1)}% of your funds.`);
  if (quick != null)
    observations.push(
      `You close ${round(quick, 0)}% of losing trades within a 2% loss${quick >= 70 ? " — a cautious habit" : ""}.`,
    );
  if (deep > 0)
    observations.push(`${round(deep, 0)}% of your trades lost more than 8% before you exited.`);
  if (holdRatio != null && holdRatio > 1.5)
    observations.push(
      `You hold losing trades ${round(holdRatio, 1)}× longer than winners — the "disposition effect", where people sell winners too early and hope losers recover.`,
    );
  return {
    ...base,
    level,
    median_size_pct: round(sizePct, 2),
    quick_loss_exit_pct: quick == null ? null : round(quick, 1),
    deep_loss_pct: round(deep, 1),
    loser_hold_ratio: holdRatio == null ? null : round(holdRatio, 2),
    observations,
  };
}

/** One sentence comparing what the person said with what they did. */
export function profileGap(stated: RiskLevel, revealed: RiskLevel | null): string | null {
  if (!revealed) return null;
  const diff = levelIndex(revealed) - levelIndex(stated);
  if (diff === 0) return `You said ${RISK_LABELS[stated]}, and your trading agrees.`;
  return diff < 0
    ? `You said ${RISK_LABELS[stated]}, but your trading behaves ${RISK_LABELS[revealed]}: you take less risk than you think.`
    : `You said ${RISK_LABELS[stated]}, but your trading behaves ${RISK_LABELS[revealed]}: you take more risk than you planned.`;
}

/** Practice framing for research and ripples, by profile. */
export const PRACTICE_NOTES: Record<RiskLevel, string> = {
  CAUTIOUS:
    "Practise with small positions in large, steady companies. Treat sharp moves as lessons to watch before acting.",
  BALANCED:
    "Mix steady companies with a few higher-risk ideas, and always set a stop-loss before you enter.",
  GROWTH: "You can practise bolder ideas, but cap each trade's planned loss and review every exit.",
  AGGRESSIVE:
    "Bold practice is fine — the discipline is the lesson. Size every trade from its stop-loss, never from conviction.",
};
