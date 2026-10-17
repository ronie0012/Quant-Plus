/**
 * The Decision Plan: one object that connects the market snapshot, evidence,
 * thesis, counter-thesis, risk plan, the resulting order (or the decision not
 * to trade) and the later execution and outcome analysis.
 *
 * Plans are stored in the journal row's `plan` field. The market snapshot and
 * the compiled risk preview are frozen at creation; later edits to the risk
 * plan are appended to `revisions` by the server so stop moves stay visible.
 */
import { clamp, round } from "./stats.ts";

export type EvidenceKind = "OBSERVATION" | "NEWS" | "RESEARCH" | "CALCULATION" | "USER_NOTE";

export type PlanEvidence = {
  id: string;
  claim: string;
  kind: EvidenceKind;
  source: string;
  /** When the source says the information was published; null when unknown. */
  published_at: string | null;
  /** When this workspace first had the information. Never later than the plan. */
  available_at: string;
  url?: string | null;
  /** Free-text contradiction: which source disagreed, if any. */
  contradicted_by?: string | null;
};

export type MarketSnapshot = {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  change_pct: number | null;
  volume: number | null;
  source: string;
  as_of: string;
  captured_at: string;
  market_session: string | null;
  delayed: boolean;
  stale: boolean;
};

export type RiskPreviewSnapshot = {
  planned_loss: number | null;
  gap_loss: number | null;
  fees: number;
  slippage: number;
  sector: string;
  sector_exposure_after_pct: number | null;
  daily_budget_used_pct: number | null;
  violations: string[];
  narrative: string;
  compiled_at: string;
};

export type PlanRevision = {
  at: string;
  field: "entry" | "stop" | "target" | "time_exit" | "holding_period_days" | "quantity";
  from: number | string | null;
  to: number | string | null;
};

export type SizingMethod = "FIXED_RISK" | "FIXED_QUANTITY" | "PERCENT_EQUITY";

export type DecisionPlanBody = {
  plan_version: 1;
  side: "BUY" | "SELL";
  decision: "TRADE" | "NO_TRADE";
  /** What the trade is supposed to prove: a falsifiable expectation. */
  expected_outcome: string;
  counter_thesis: string;
  holding_period_days: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  time_exit: string | null;
  quantity: number | null;
  sizing_method: SizingMethod;
  sizing_logic: string;
  expected_fees: number | null;
  expected_slippage: number | null;
  max_acceptable_loss: number | null;
  no_trade_reason: string;
  evidence_items: PlanEvidence[];
  market_snapshot: MarketSnapshot | null;
  risk_preview: RiskPreviewSnapshot | null;
  revisions: PlanRevision[];
  /** Answer to "why is this trade different?" when a behavioural prompt fired. */
  behavior_note: string;
};

export type PlanLike = {
  thesis: string;
  invalidation: string;
  planned_exit?: string;
  plan?: Partial<DecisionPlanBody> | null;
  order_id?: string | null;
  reflection?: string;
  created_at?: string;
};

export function emptyPlan(side: "BUY" | "SELL" = "BUY"): DecisionPlanBody {
  return {
    plan_version: 1,
    side,
    decision: "TRADE",
    expected_outcome: "",
    counter_thesis: "",
    holding_period_days: null,
    entry: null,
    stop: null,
    target: null,
    time_exit: null,
    quantity: null,
    sizing_method: "FIXED_RISK",
    sizing_logic: "",
    expected_fees: null,
    expected_slippage: null,
    max_acceptable_loss: null,
    no_trade_reason: "",
    evidence_items: [],
    market_snapshot: null,
    risk_preview: null,
    revisions: [],
    behavior_note: "",
  };
}

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
  hint: string;
};

const filled = (value: unknown) =>
  typeof value === "string" ? value.trim().length >= 3 : value != null;

/** The twelve parts of a decision plan, in lifecycle order. */
export function planChecklist(entry: PlanLike): ChecklistItem[] {
  const plan = entry.plan ?? {};
  const trading = plan.decision !== "NO_TRADE";
  const evidence = plan.evidence_items ?? [];
  return [
    {
      key: "snapshot",
      label: "Market snapshot",
      done: Boolean(plan.market_snapshot),
      required: true,
      hint: "Captured automatically from the live quote when the plan is created.",
    },
    {
      key: "evidence",
      label: "Evidence available at the time",
      done: evidence.length > 0,
      required: true,
      hint: "At least one sourced item with its publication and availability time.",
    },
    {
      key: "thesis",
      label: "Thesis and what it should prove",
      done: filled(entry.thesis) && filled(plan.expected_outcome),
      required: true,
      hint: "What must be true, and what observable result would confirm it.",
    },
    {
      key: "counter",
      label: "Counter-thesis",
      done: filled(plan.counter_thesis),
      required: true,
      hint: "The strongest argument that you are wrong.",
    },
    {
      key: "invalidation",
      label: "Invalidation conditions",
      done: filled(entry.invalidation),
      required: true,
      hint: "The observable condition that ends the thesis, independent of price stop.",
    },
    {
      key: "horizon",
      label: "Intended holding period",
      done: plan.holding_period_days != null && plan.holding_period_days > 0,
      required: trading,
      hint: "Trading days you expect the thesis to need.",
    },
    {
      key: "levels",
      label: "Entry, stop, target and time exit",
      done:
        !trading ||
        (plan.entry != null && plan.stop != null && plan.target != null && !!plan.time_exit),
      required: trading,
      hint: "All four levels make the exit plan executable.",
    },
    {
      key: "sizing",
      label: "Position-sizing logic",
      done: !trading || (plan.quantity != null && plan.quantity > 0 && filled(plan.sizing_logic)),
      required: trading,
      hint: "How the quantity follows from the risk you accept.",
    },
    {
      key: "costs",
      label: "Expected fees and slippage",
      done: !trading || (plan.expected_fees != null && plan.expected_slippage != null),
      required: trading,
      hint: "Filled from the pre-trade risk compiler.",
    },
    {
      key: "max_loss",
      label: "Maximum acceptable loss",
      done: !trading || (plan.max_acceptable_loss != null && plan.max_acceptable_loss > 0),
      required: trading,
      hint: "The rupee loss at which you would accept being wrong.",
    },
    {
      key: "decision",
      label: "Resulting order or decision not to trade",
      done: trading ? Boolean(entry.order_id) : filled(plan.no_trade_reason),
      required: false,
      hint: trading ? "Link the order this plan produced." : "Say why you chose not to trade.",
    },
    {
      key: "review",
      label: "Execution and outcome analysis",
      done: filled(entry.reflection),
      required: false,
      hint: "Written after the trade resolves.",
    },
  ];
}

/** Share of required pre-trade items that are complete, 0-100. */
export function planReadiness(entry: PlanLike) {
  const items = planChecklist(entry).filter((item) => item.required);
  const done = items.filter((item) => item.done).length;
  return {
    score: items.length ? Math.round((done / items.length) * 100) : 0,
    missing: items.filter((item) => !item.done).map((item) => item.label),
    ready: done === items.length,
  };
}

/** Quantity that risks at most `riskBudget` rupees between entry and stop. */
export function riskBasedQuantity(entry: number, stop: number, riskBudget: number): number | null {
  const perShare = Math.abs(entry - stop);
  if (!(entry > 0) || !(stop > 0) || !(riskBudget > 0) || perShare <= 0) return null;
  return Math.max(0, Math.floor(riskBudget / perShare));
}

/** Validates internal consistency; returns human-readable problems. */
export function planProblems(plan: Partial<DecisionPlanBody>): string[] {
  const problems: string[] = [];
  if (plan.decision === "NO_TRADE") return problems;
  const { entry, stop, target } = plan;
  const long = (plan.side ?? "BUY") === "BUY";
  if (entry != null && stop != null && (long ? stop >= entry : stop <= entry))
    problems.push(
      long ? "Stop must be below entry for a buy." : "Stop must be above a sell entry.",
    );
  if (entry != null && target != null && (long ? target <= entry : target >= entry))
    problems.push(long ? "Target must be above entry for a buy." : "Target must be below entry.");
  if (
    entry != null &&
    stop != null &&
    plan.quantity != null &&
    plan.max_acceptable_loss != null &&
    Math.abs(entry - stop) * plan.quantity > plan.max_acceptable_loss * 1.0001
  )
    problems.push(
      `Planned stop loss of ₹${round(Math.abs(entry - stop) * plan.quantity, 0)} exceeds your maximum acceptable loss of ₹${round(plan.max_acceptable_loss, 0)}.`,
    );
  if (plan.time_exit && Number.isNaN(Date.parse(plan.time_exit)))
    problems.push("Time exit must be a valid date.");
  return problems;
}

/** Reward-to-risk ratio of the planned levels. */
export function rewardRisk(plan: Partial<DecisionPlanBody>): number | null {
  if (plan.entry == null || plan.stop == null || plan.target == null) return null;
  const risk = Math.abs(plan.entry - plan.stop);
  if (risk <= 0) return null;
  return round(Math.abs(plan.target - plan.entry) / risk, 2);
}

/** Revisions that moved the stop further from entry (widened risk). */
export function widenedStops(plan: Partial<DecisionPlanBody>): PlanRevision[] {
  const long = (plan.side ?? "BUY") === "BUY";
  return (plan.revisions ?? []).filter(
    (revision) =>
      revision.field === "stop" &&
      typeof revision.from === "number" &&
      typeof revision.to === "number" &&
      (long ? revision.to < revision.from : revision.to > revision.from),
  );
}

// ------------------------------------------------------------- outcome attribution

export type PricePoint = { time: number; open: number; high: number; low: number; close: number };

export type ExecutionFacts = {
  /** Average entry fill price; null when the plan produced no fill. */
  entry_fill: number | null;
  entry_at: string | null;
  /** Average exit fill price for the planned quantity; null while open. */
  exit_fill: number | null;
  exit_at: string | null;
  quantity: number;
  charges: number;
};

export type QualityGrade = "GOOD" | "BAD" | "UNRESOLVED";

export type Attribution = {
  label:
    | "SOUND_TRADE"
    | "GOOD_THESIS_BAD_EXECUTION"
    | "BAD_THESIS_GOOD_EXECUTION"
    | "GOOD_TRADE_BAD_PROCESS"
    | "BAD_THESIS_BAD_EXECUTION"
    | "NO_TRADE"
    | "UNRESOLVED";
  title: string;
  thesis: { grade: QualityGrade; reasons: string[] };
  execution: { grade: QualityGrade; reasons: string[] };
  process: { grade: QualityGrade; score: number; reasons: string[] };
  pnl: number | null;
};

const LABEL_TITLES: Record<Attribution["label"], string> = {
  SOUND_TRADE: "Good thesis, good execution, good process",
  GOOD_THESIS_BAD_EXECUTION: "Good thesis, bad execution",
  BAD_THESIS_GOOD_EXECUTION: "Bad thesis, good execution",
  GOOD_TRADE_BAD_PROCESS: "Good trade, bad process",
  BAD_THESIS_BAD_EXECUTION: "Bad thesis, bad execution",
  NO_TRADE: "Decision not to trade",
  UNRESOLVED: "Not yet resolved",
};

/**
 * Judge the thesis on the price path after the decision, independent of how
 * the user executed: did price reach the target before the stop within the
 * planned horizon?
 */
export function judgeThesis(
  plan: Partial<DecisionPlanBody>,
  decidedAt: number,
  path: PricePoint[],
  now = Date.now(),
): { grade: QualityGrade; reasons: string[] } {
  const long = (plan.side ?? "BUY") === "BUY";
  const entry = plan.entry ?? plan.market_snapshot?.price ?? null;
  if (entry == null) return { grade: "UNRESOLVED", reasons: ["No entry or snapshot price."] };
  const horizonEnd = plan.time_exit
    ? Date.parse(plan.time_exit)
    : plan.holding_period_days
      ? decidedAt + plan.holding_period_days * 1.45 * 86_400_000
      : null;
  const after = path.filter((bar) => bar.time * 1000 > decidedAt);
  const window = horizonEnd ? after.filter((bar) => bar.time * 1000 <= horizonEnd) : after;
  for (const bar of window) {
    const stopHit = plan.stop != null && (long ? bar.low <= plan.stop : bar.high >= plan.stop);
    const targetHit =
      plan.target != null && (long ? bar.high >= plan.target : bar.low <= plan.target);
    if (stopHit && targetHit)
      return {
        grade: "UNRESOLVED",
        reasons: [
          `Stop and target were both touched on ${new Date(bar.time * 1000).toISOString().slice(0, 10)}; daily bars cannot order them.`,
        ],
      };
    if (targetHit)
      return {
        grade: "GOOD",
        reasons: [
          `Price reached the ₹${plan.target} target on ${new Date(bar.time * 1000).toISOString().slice(0, 10)} before the stop.`,
        ],
      };
    if (stopHit)
      return {
        grade: "BAD",
        reasons: [
          `Price reached the ₹${plan.stop} stop on ${new Date(bar.time * 1000).toISOString().slice(0, 10)} before the target.`,
        ],
      };
  }
  const horizonOver = horizonEnd != null && now > horizonEnd;
  if (!horizonOver || !window.length)
    return {
      grade: "UNRESOLVED",
      reasons: [
        horizonEnd == null
          ? "No holding period or time exit to judge the thesis against."
          : "Planned horizon has not elapsed and neither level was reached.",
      ],
    };
  const last = window.at(-1)!.close;
  const move = long ? last / entry - 1 : 1 - last / entry;
  return {
    grade: move > 0 ? "GOOD" : "BAD",
    reasons: [
      `Neither level was reached; over the planned horizon price moved ${round(move * 100, 2)}% in the thesis direction.`,
    ],
  };
}

export function judgeExecution(
  plan: Partial<DecisionPlanBody>,
  facts: ExecutionFacts,
  path: PricePoint[],
): { grade: QualityGrade; reasons: string[] } {
  if (facts.entry_fill == null)
    return { grade: "UNRESOLVED", reasons: ["The plan has no filled entry order."] };
  const long = (plan.side ?? "BUY") === "BUY";
  const reasons: string[] = [];
  let bad = false;
  const plannedEntry = plan.entry ?? plan.market_snapshot?.price ?? null;
  if (plannedEntry) {
    const slip = ((facts.entry_fill - plannedEntry) / plannedEntry) * (long ? 1 : -1) * 10_000;
    const tolerance = Math.max(
      30,
      plan.expected_slippage && plan.quantity
        ? Math.round((plan.expected_slippage / plan.quantity / plannedEntry) * 10_000 * 2)
        : 0,
    );
    if (slip > tolerance) {
      bad = true;
      reasons.push(`Entry filled ${round(slip, 1)} bps worse than the planned price.`);
    } else reasons.push(`Entry within ${round(Math.max(slip, 0), 1)} bps of plan.`);
  }
  const widened = widenedStops(plan);
  if (widened.length) {
    bad = true;
    reasons.push(`Stop was widened ${widened.length} time(s) after the plan was written.`);
  }
  if (plan.stop != null && facts.entry_at) {
    const entryMs = Date.parse(facts.entry_at);
    const exitMs = facts.exit_at ? Date.parse(facts.exit_at) : Number.POSITIVE_INFINITY;
    const breach = path.find(
      (bar) =>
        bar.time * 1000 > entryMs &&
        bar.time * 1000 < exitMs - 86_400_000 &&
        (long ? bar.close < plan.stop! : bar.close > plan.stop!),
    );
    if (breach) {
      bad = true;
      reasons.push(
        `Position was held after a close through the stop on ${new Date(breach.time * 1000).toISOString().slice(0, 10)}.`,
      );
    }
  }
  if (plan.time_exit && facts.exit_at) {
    const lateDays = (Date.parse(facts.exit_at) - Date.parse(plan.time_exit)) / 86_400_000;
    if (lateDays > 3) {
      bad = true;
      reasons.push(`Exited ${Math.round(lateDays)} days after the planned time exit.`);
    }
  } else if (
    plan.time_exit &&
    !facts.exit_at &&
    Date.now() > Date.parse(plan.time_exit) + 3 * 864e5
  ) {
    bad = true;
    reasons.push("Still holding after the planned time exit.");
  }
  if (
    plan.max_acceptable_loss != null &&
    facts.exit_fill != null &&
    (facts.exit_fill - facts.entry_fill) * (long ? 1 : -1) * facts.quantity - facts.charges <
      -plan.max_acceptable_loss * 1.1
  ) {
    bad = true;
    reasons.push("Realised loss exceeded the maximum acceptable loss by more than 10%.");
  }
  if (!facts.exit_fill && !bad)
    return { grade: "UNRESOLVED", reasons: [...reasons, "Still open."] };
  return { grade: bad ? "BAD" : "GOOD", reasons };
}

export function judgeProcess(
  entry: PlanLike,
  orderCreatedAt: string | null,
): { grade: QualityGrade; score: number; reasons: string[] } {
  const readiness = planReadiness(entry);
  const reasons: string[] = [];
  let score = readiness.score;
  if (readiness.missing.length)
    reasons.push(`Missing before trading: ${readiness.missing.join(", ")}.`);
  if (
    orderCreatedAt &&
    entry.created_at &&
    Date.parse(orderCreatedAt) < Date.parse(entry.created_at)
  ) {
    score -= 30;
    reasons.push("The plan was written after the order was placed.");
  }
  const plan = entry.plan ?? {};
  if (plan.risk_preview?.violations.length) {
    score -= 10 * Math.min(3, plan.risk_preview.violations.length);
    reasons.push(`Traded despite ${plan.risk_preview.violations.length} risk-policy violation(s).`);
  }
  if (widenedStops(plan).length) {
    score -= 15;
    reasons.push("Stop was widened after the plan was written.");
  }
  score = clamp(score, 0, 100);
  if (!reasons.length) reasons.push("Plan was complete before the order and stayed within policy.");
  return { grade: score >= 75 ? "GOOD" : "BAD", score, reasons };
}

/** Separate thesis, execution and process so the outcome can be explained. */
export function attributeOutcome(
  entry: PlanLike,
  facts: ExecutionFacts | null,
  orderCreatedAt: string | null,
  path: PricePoint[],
  now = Date.now(),
): Attribution {
  const plan = entry.plan ?? {};
  const decidedAt = Date.parse(plan.market_snapshot?.captured_at ?? entry.created_at ?? "");
  const thesis = Number.isFinite(decidedAt)
    ? judgeThesis(plan, decidedAt, path, now)
    : { grade: "UNRESOLVED" as const, reasons: ["Decision time unknown."] };
  const process = judgeProcess(entry, orderCreatedAt);
  if (plan.decision === "NO_TRADE")
    return {
      label: "NO_TRADE",
      title: LABEL_TITLES.NO_TRADE,
      thesis,
      execution: { grade: "UNRESOLVED", reasons: ["No order by design."] },
      process,
      pnl: null,
    };
  const execution = facts
    ? judgeExecution(plan, facts, path)
    : { grade: "UNRESOLVED" as const, reasons: ["No linked order."] };
  const long = (plan.side ?? "BUY") === "BUY";
  const pnl =
    facts?.entry_fill != null && facts.exit_fill != null
      ? round(
          (facts.exit_fill - facts.entry_fill) * (long ? 1 : -1) * facts.quantity - facts.charges,
          2,
        )
      : null;
  let label: Attribution["label"] = "UNRESOLVED";
  if (pnl != null && pnl > 0 && process.grade === "BAD") label = "GOOD_TRADE_BAD_PROCESS";
  else if (thesis.grade === "GOOD" && execution.grade === "BAD")
    label = "GOOD_THESIS_BAD_EXECUTION";
  else if (thesis.grade === "BAD" && execution.grade === "GOOD")
    label = "BAD_THESIS_GOOD_EXECUTION";
  else if (thesis.grade === "BAD" && execution.grade === "BAD") label = "BAD_THESIS_BAD_EXECUTION";
  else if (thesis.grade === "GOOD" && execution.grade === "GOOD")
    label = process.grade === "GOOD" ? "SOUND_TRADE" : "GOOD_TRADE_BAD_PROCESS";
  return { label, title: LABEL_TITLES[label], thesis, execution, process, pnl };
}

export type FillLike = {
  order_id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  created_at: string;
  charges?: number | null;
};

/**
 * Entry facts from the linked order's fills and exit facts from later
 * opposite-side fills of the same symbol, matched first-in-first-out up to the
 * entry quantity.
 */
export function executionFacts(
  orderId: string,
  fills: FillLike[],
  laterOpposite: FillLike[],
): ExecutionFacts | null {
  const entryFills = fills.filter((fill) => fill.order_id === orderId);
  const quantity = entryFills.reduce((total, fill) => total + fill.quantity, 0);
  if (!quantity) return null;
  const entryFill = entryFills.reduce((t, f) => t + f.price * f.quantity, 0) / quantity;
  const entryAt = entryFills.map((f) => f.created_at).sort()[0]!;
  let remaining = quantity;
  let exitValue = 0;
  let exitQuantity = 0;
  let exitAt: string | null = null;
  let charges = entryFills.reduce((t, f) => t + (f.charges ?? 0), 0);
  for (const fill of [...laterOpposite]
    .filter((f) => f.created_at > entryAt)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, fill.quantity);
    exitValue += used * fill.price;
    exitQuantity += used;
    remaining -= used;
    charges += (fill.charges ?? 0) * (used / fill.quantity);
    exitAt = fill.created_at;
  }
  return {
    entry_fill: round(entryFill, 4),
    entry_at: entryAt,
    exit_fill: remaining === 0 ? round(exitValue / exitQuantity, 4) : null,
    exit_at: remaining === 0 ? exitAt : null,
    quantity,
    charges: round(charges, 2),
  };
}
