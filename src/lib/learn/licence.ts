/**
 * Trading licence. Like a driving licence, each level is earned by showing a
 * practical habit in paper trading — never by profit. Each level suggests
 * risk limits that the user can apply to the server-enforced risk controls.
 */
import { levelIndex, type RiskLevel } from "./investor-dna.ts";

export type LicenceLevel = 0 | 1 | 2 | 3;

export type LicenceEvidence = {
  profile_complete: boolean;
  company_completed: boolean;
  /** Saved replay (Time Machine) results. */
  replays: {
    return_pct: number;
    buy_and_hold_pct: number;
    max_drawdown_pct: number;
    finished: boolean;
  }[];
  /** Decision plans: stop-loss present and planned loss as a share of total funds. */
  plans: { has_stop: boolean; planned_loss_pct: number | null; decision: "TRADE" | "NO_TRADE" }[];
  /** Closed trips linked to a plan: realised loss vs the plan's maximum acceptable loss. */
  planned_trips: { loss: number; max_acceptable_loss: number }[];
};

export type Requirement = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  /** Progress towards the requirement, 0-1. */
  progress: number;
  progress_label: string;
  /** Workspace section that teaches or records this requirement. */
  section: string;
};

export type LicenceStage = {
  level: LicenceLevel;
  name: string;
  badge: string;
  summary: string;
  /** Requirements to earn this level. */
  requirements: Requirement[];
};

export const PLANS_FOR_L2 = 10;
export const MAX_PLANNED_LOSS_PCT = 2;
export const TRIPS_FOR_L3 = 5;
export const CRASH_DROP_PCT = -8;

const ratio = (n: number, of: number) => Math.min(1, of ? n / of : 0);

export function licenceStages(evidence: LicenceEvidence): LicenceStage[] {
  const disciplinedPlans = evidence.plans.filter(
    (p) =>
      p.decision === "TRADE" &&
      p.has_stop &&
      p.planned_loss_pct != null &&
      p.planned_loss_pct <= MAX_PLANNED_LOSS_PCT,
  ).length;
  const crashTests = evidence.replays.filter(
    (r) =>
      r.finished && r.buy_and_hold_pct <= CRASH_DROP_PCT && r.max_drawdown_pct > r.buy_and_hold_pct,
  ).length;
  const crashSeen = evidence.replays.filter(
    (r) => r.finished && r.buy_and_hold_pct <= CRASH_DROP_PCT,
  ).length;
  const kept = evidence.planned_trips.filter((t) => t.loss <= t.max_acceptable_loss * 1.1).length;
  const allKept =
    evidence.planned_trips.length >= TRIPS_FOR_L3 && kept === evidence.planned_trips.length;

  return [
    {
      level: 0,
      name: "Learner",
      badge: "L",
      summary: "Everyone starts here. Learn what a share is and how prices move.",
      requirements: [],
    },
    {
      level: 1,
      name: "Road ready",
      badge: "L1",
      summary: "You know the basics and who you are as an investor.",
      requirements: [
        {
          id: "profile",
          label: "Build your Investor DNA",
          detail: "Answer eight questions about your money and your nerves.",
          done: evidence.profile_complete,
          progress: evidence.profile_complete ? 1 : 0,
          progress_label: evidence.profile_complete ? "Done" : "Not started",
          section: "investor-dna",
        },
        {
          id: "company",
          label: "Finish “Be the Company”",
          detail: "Run a chai brand to its IPO and see your own share price react.",
          done: evidence.company_completed,
          progress: evidence.company_completed ? 1 : 0,
          progress_label: evidence.company_completed ? "Done" : "Not started",
          section: "be-the-company",
        },
        {
          id: "replay",
          label: "Survive one blind replay",
          detail: "Trade a hidden stretch of real history without knowing what comes next.",
          done: evidence.replays.some((r) => r.finished),
          progress: evidence.replays.some((r) => r.finished) ? 1 : 0,
          progress_label: `${evidence.replays.filter((r) => r.finished).length} finished`,
          section: "replay",
        },
      ],
    },
    {
      level: 2,
      name: "Disciplined planner",
      badge: "L2",
      summary: "Every trade has a stop-loss and a small, planned risk.",
      requirements: [
        {
          id: "plans",
          label: `${PLANS_FOR_L2} trade plans with a stop-loss and ≤${MAX_PLANNED_LOSS_PCT}% planned risk`,
          detail: "Write the exit before the entry, and size the trade from it.",
          done: disciplinedPlans >= PLANS_FOR_L2,
          progress: ratio(disciplinedPlans, PLANS_FOR_L2),
          progress_label: `${disciplinedPlans} / ${PLANS_FOR_L2}`,
          section: "journal",
        },
      ],
    },
    {
      level: 3,
      name: "Crash-tested",
      badge: "L3",
      summary: "You keep your rules when markets fall and losses are real.",
      requirements: [
        {
          id: "crash",
          label: "Lose less than buy-and-hold in a falling replay",
          detail: `Finish a replay where the stock fell ${Math.abs(CRASH_DROP_PCT)}% or more, with a smaller drawdown than simply holding.`,
          done: crashTests > 0,
          progress: crashTests > 0 ? 1 : crashSeen > 0 ? 0.5 : 0,
          progress_label:
            crashTests > 0 ? "Done" : crashSeen > 0 ? "Crash seen, not yet beaten" : "Not yet",
          section: "replay",
        },
        {
          id: "stops",
          label: `Respect your stop in ${TRIPS_FOR_L3} closed planned trades`,
          detail: "No closed trade lost more than 10% beyond the loss you planned.",
          done: allKept,
          progress: allKept
            ? 1
            : ratio(kept, TRIPS_FOR_L3) * (kept === evidence.planned_trips.length ? 1 : 0.5),
          progress_label: `${kept} of ${evidence.planned_trips.length} kept · need ${TRIPS_FOR_L3}`,
          section: "behavior",
        },
      ],
    },
  ];
}

/** Highest level whose requirements, and every lower level's, are all met. */
export function currentLevel(stages: LicenceStage[]): LicenceLevel {
  let level: LicenceLevel = 0;
  for (const stage of stages.slice(1)) {
    if (stage.requirements.every((r) => r.done)) level = stage.level;
    else break;
  }
  return level;
}

export type SuggestedLimits = {
  max_order_value: number;
  max_position_pct: number;
  daily_loss_limit: number;
  confirmation_above: number;
};

const LIMITS: Record<LicenceLevel, { order: number; position: number; daily: number }> = {
  0: { order: 0.05, position: 10, daily: 0.02 },
  1: { order: 0.1, position: 15, daily: 0.03 },
  2: { order: 0.2, position: 25, daily: 0.05 },
  3: { order: 0.25, position: 35, daily: 0.07 },
};

/**
 * Practice limits for a licence level, tightened for a cautious profile and
 * rounded to whole rupees. Values never exceed the level's ceiling.
 */
export function suggestedLimits(
  level: LicenceLevel,
  profile: RiskLevel | null,
  totalFunds: number,
): SuggestedLimits | null {
  if (!(totalFunds > 0)) return null;
  const base = LIMITS[level];
  const factor = profile == null ? 1 : [0.6, 0.8, 1, 1][levelIndex(profile)]!;
  const order = Math.max(1, Math.round(totalFunds * base.order * factor));
  return {
    max_order_value: order,
    max_position_pct: Math.max(5, Math.round(base.position * factor)),
    daily_loss_limit: Math.max(1, Math.round(totalFunds * base.daily * factor)),
    confirmation_above: Math.max(1, Math.round(order * 0.5)),
  };
}
