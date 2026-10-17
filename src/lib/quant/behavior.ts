/**
 * Personal behavioural risk engine. Analyses the trader, not the market, and
 * only after explicit consent. Findings are descriptive statistics over the
 * user's own paper history with their sample sizes; nothing is gamified and
 * small samples are reported as insufficient rather than as a pattern.
 */
import { mean, median, round } from "./stats.ts";

export type BehaviorOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  status: string;
  created_at: string;
  filled_quantity: number;
  avg_fill_price: number | null;
  price: number;
  quote_stale?: boolean;
  quote_delayed?: boolean;
};

export type BehaviorPlan = {
  order_id: string | null;
  created_at: string;
  thesis: string;
  plan?: {
    holding_period_days?: number | null;
    revisions?: { field: string; from: unknown; to: unknown }[];
    side?: "BUY" | "SELL";
    invalidated_at?: string | null;
  } | null;
};

export type RoundTrip = {
  symbol: string;
  entry_order_id: string;
  entry_at: string;
  exit_at: string;
  quantity: number;
  entry_value: number;
  pnl: number;
  return_pct: number;
};

/** First-in-first-out round trips from filled orders. Open lots are ignored. */
export function roundTrips(orders: BehaviorOrder[]): RoundTrip[] {
  const lots = new Map<string, { order: BehaviorOrder; remaining: number; price: number }[]>();
  const trips: RoundTrip[] = [];
  const filledOrders = orders
    .filter((o) => o.filled_quantity > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const order of filledOrders) {
    const price = order.avg_fill_price ?? order.price;
    const queue = lots.get(order.symbol) ?? [];
    lots.set(order.symbol, queue);
    if (order.side === "BUY") {
      queue.push({ order, remaining: order.filled_quantity, price });
      continue;
    }
    let remaining = order.filled_quantity;
    while (remaining > 0 && queue.length) {
      const lot = queue[0]!;
      const used = Math.min(lot.remaining, remaining);
      const entryValue = used * lot.price;
      const pnl = used * (price - lot.price);
      const last = trips.at(-1);
      // Merge partial exits of the same entry order and exit order into one trip.
      if (last && last.entry_order_id === lot.order.id && last.exit_at === order.created_at) {
        last.quantity += used;
        last.entry_value += entryValue;
        last.pnl += pnl;
        last.return_pct = (last.pnl / last.entry_value) * 100;
      } else
        trips.push({
          symbol: order.symbol,
          entry_order_id: lot.order.id,
          entry_at: lot.order.created_at,
          exit_at: order.created_at,
          quantity: used,
          entry_value: entryValue,
          pnl,
          return_pct: (pnl / entryValue) * 100,
        });
      lot.remaining -= used;
      remaining -= used;
      if (lot.remaining === 0) queue.shift();
    }
  }
  return trips;
}

export type Pattern = {
  key: string;
  title: string;
  detected: boolean;
  /** Plain statement with numbers; null when the sample is too small. */
  statement: string | null;
  sample: number;
  min_sample: number;
};

const MIN = 3;

function entrySize(order: BehaviorOrder) {
  return order.filled_quantity * (order.avg_fill_price ?? order.price);
}

function expectancy(trips: RoundTrip[]) {
  return mean(trips.map((t) => t.return_pct));
}

function compareStatement(
  label: string,
  group: BehaviorOrder[],
  normal: BehaviorOrder[],
  tripsByEntry: Map<string, RoundTrip>,
) {
  const groupMedian = median(group.map(entrySize));
  const normalMedian = median(normal.map(entrySize));
  if (groupMedian == null || normalMedian == null || normalMedian <= 0) return null;
  const ratio = groupMedian / normalMedian;
  const groupExp = expectancy(
    group.map((o) => tripsByEntry.get(o.id)).filter((t): t is RoundTrip => !!t),
  );
  const normalExp = expectancy(
    normal.map((o) => tripsByEntry.get(o.id)).filter((t): t is RoundTrip => !!t),
  );
  const exp =
    groupExp == null || normalExp == null
      ? "expectancy is not yet measurable (too few closed trades)"
      : groupExp < normalExp
        ? `had lower expectancy (${round(groupExp, 2)}% vs ${round(normalExp, 2)}% per trade)`
        : `had similar or higher expectancy (${round(groupExp, 2)}% vs ${round(normalExp, 2)}% per trade)`;
  return {
    ratio,
    text: `Your last ${group.length} trades taken ${label} were ${round(ratio, 1)}× ${ratio >= 1 ? "larger than " : ""}your normal size and ${exp}.`,
  };
}

export function detectPatterns(
  orders: BehaviorOrder[],
  plans: BehaviorPlan[],
  now = Date.now(),
): Pattern[] {
  const trips = roundTrips(orders);
  const tripsByEntry = new Map(trips.map((t) => [t.entry_order_id, t]));
  const entries = orders
    .filter((o) => o.side === "BUY" && o.filled_quantity > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const closedBefore = (at: string) =>
    trips.filter((t) => t.exit_at < at).sort((a, b) => a.exit_at.localeCompare(b.exit_at));
  const patterns: Pattern[] = [];

  // 1. Size after consecutive losses.
  const afterLosses = entries.filter((entry) => {
    const prior = closedBefore(entry.created_at).slice(-2);
    return prior.length === 2 && prior.every((t) => t.pnl < 0);
  });
  const normal = entries.filter((e) => !afterLosses.includes(e));
  const lossCompare =
    afterLosses.length >= MIN && normal.length >= MIN
      ? compareStatement("after two consecutive losses", afterLosses, normal, tripsByEntry)
      : null;
  patterns.push({
    key: "size_after_losses",
    title: "Increasing position size after losses",
    detected: !!lossCompare && lossCompare.ratio >= 1.25,
    statement: lossCompare?.text ?? null,
    sample: afterLosses.length,
    min_sample: MIN,
  });

  // 2. Revenge trading: a new entry within 60 minutes of a losing exit.
  const revenge = entries.filter((entry) => {
    const last = closedBefore(entry.created_at).at(-1);
    return (
      last && last.pnl < 0 && Date.parse(entry.created_at) - Date.parse(last.exit_at) <= 60 * 60_000
    );
  });
  const revengeTrips = revenge
    .map((o) => tripsByEntry.get(o.id))
    .filter((t): t is RoundTrip => !!t);
  const revengeExp = expectancy(revengeTrips);
  patterns.push({
    key: "revenge",
    title: "Re-entering quickly after a loss",
    detected: revenge.length >= MIN && revenge.length / Math.max(1, entries.length) >= 0.15,
    statement:
      revenge.length >= MIN
        ? `${revenge.length} of ${entries.length} entries (${round((revenge.length / entries.length) * 100, 0)}%) were placed within an hour of a losing exit${revengeExp == null ? "" : `; their average return was ${round(revengeExp, 2)}%`}.`
        : null,
    sample: revenge.length,
    min_sample: MIN,
  });

  // 3. Moving stops away from entry.
  const withRevisions = plans.filter((p) =>
    (p.plan?.revisions ?? []).some((r) => r.field === "stop"),
  );
  const widened = plans.filter((p) =>
    (p.plan?.revisions ?? []).some(
      (r) =>
        r.field === "stop" &&
        typeof r.from === "number" &&
        typeof r.to === "number" &&
        ((p.plan?.side ?? "BUY") === "BUY" ? r.to < r.from : r.to > r.from),
    ),
  );
  patterns.push({
    key: "stop_moves",
    title: "Repeatedly moving stops",
    detected: widened.length >= 2,
    statement: withRevisions.length
      ? `${widened.length} of ${plans.length} plans had their stop widened after writing (${withRevisions.length} had any stop change).`
      : null,
    sample: withRevisions.length,
    min_sample: 1,
  });

  // 4. Holding outside the planned horizon.
  const planned = plans
    .map((p) => ({ p, trip: p.order_id ? tripsByEntry.get(p.order_id) : undefined }))
    .filter(
      (x): x is { p: BehaviorPlan; trip: RoundTrip } =>
        !!x.trip && !!x.p.plan?.holding_period_days && x.p.plan.holding_period_days > 0,
    );
  const outside = planned.filter(({ p, trip }) => {
    const heldDays = (Date.parse(trip.exit_at) - Date.parse(trip.entry_at)) / 86_400_000;
    const plannedDays = p.plan!.holding_period_days! * 1.45;
    return heldDays > plannedDays * 1.5 || heldDays < plannedDays * 0.25;
  });
  patterns.push({
    key: "horizon",
    title: "Trading outside the planned horizon",
    detected: planned.length >= MIN && outside.length / planned.length >= 0.4,
    statement:
      planned.length >= MIN
        ? `${outside.length} of ${planned.length} planned trades were held far shorter or longer than their stated holding period.`
        : null,
    sample: planned.length,
    min_sample: MIN,
  });

  // 5. Concentration in familiar names.
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.symbol, (counts.get(e.symbol) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top3 = ranked.slice(0, 3).reduce((t, [, c]) => t + c, 0);
  patterns.push({
    key: "familiar",
    title: "Over-concentration in familiar companies",
    detected: entries.length >= 8 && top3 / entries.length >= 0.7,
    statement:
      entries.length >= 8
        ? `${round((top3 / entries.length) * 100, 0)}% of your ${entries.length} entries were in ${ranked
            .slice(0, 3)
            .map(([s]) => s)
            .join(", ")}.`
        : null,
    sample: entries.length,
    min_sample: 8,
  });

  // 6. Excessive trading after a large win.
  const wins = trips.filter((t) => t.pnl > 0);
  const bigWinCut = median(wins.map((t) => t.pnl));
  const bigWins = bigWinCut == null ? [] : wins.filter((t) => t.pnl >= bigWinCut * 2);
  const daySpan =
    entries.length > 1
      ? Math.max(
          1,
          (Date.parse(entries.at(-1)!.created_at) - Date.parse(entries[0]!.created_at)) /
            86_400_000,
        )
      : 1;
  const baseRate = entries.length / daySpan;
  const afterBig = bigWins.map(
    (w) =>
      entries.filter(
        (e) =>
          e.created_at > w.exit_at &&
          Date.parse(e.created_at) - Date.parse(w.exit_at) <= 86_400_000,
      ).length,
  );
  const afterRate = mean(afterBig);
  patterns.push({
    key: "after_big_win",
    title: "Excessive trading after a large win",
    detected: bigWins.length >= 2 && afterRate != null && afterRate > baseRate * 2,
    statement:
      bigWins.length >= 2 && afterRate != null
        ? `In the day after ${bigWins.length} large wins you placed ${round(afterRate, 1)} entries on average, against a normal ${round(baseRate, 2)} per day.`
        : null,
    sample: bigWins.length,
    min_sample: 2,
  });

  // 7. Ignoring documented invalidation.
  const invalidated = plans.filter((p) => p.plan?.invalidated_at && p.order_id);
  const ignored = invalidated.filter((p) => {
    const trip = tripsByEntry.get(p.order_id!);
    const at = Date.parse(p.plan!.invalidated_at!);
    const exit = trip ? Date.parse(trip.exit_at) : now;
    return exit - at > 86_400_000;
  });
  patterns.push({
    key: "invalidation",
    title: "Ignoring documented invalidation",
    detected: ignored.length >= 1,
    statement: invalidated.length
      ? `${ignored.length} of ${invalidated.length} positions were held more than a day after you marked their thesis invalidated.`
      : null,
    sample: invalidated.length,
    min_sample: 1,
  });

  // 8. Taking more risk when data quality is poor.
  const poor = entries.filter((e) => e.quote_stale || e.quote_delayed);
  const good = entries.filter((e) => !e.quote_stale && !e.quote_delayed);
  const poorCompare =
    poor.length >= MIN && good.length >= MIN
      ? compareStatement("on stale or delayed quotes", poor, good, tripsByEntry)
      : null;
  patterns.push({
    key: "poor_data",
    title: "Increasing risk when data quality is poor",
    detected: !!poorCompare && poorCompare.ratio >= 1.25,
    statement: poorCompare?.text ?? null,
    sample: poor.length,
    min_sample: MIN,
  });

  // 9. Entries without a thesis.
  const planned_ids = new Set(
    plans.filter((p) => p.order_id && p.thesis.trim()).map((p) => p.order_id),
  );
  const unplanned = entries.filter((e) => !planned_ids.has(e.id));
  patterns.push({
    key: "no_thesis",
    title: "Entering trades without a thesis",
    detected: entries.length >= MIN && unplanned.length / entries.length >= 0.3,
    statement:
      entries.length >= MIN
        ? `${unplanned.length} of ${entries.length} entries (${round((unplanned.length / entries.length) * 100, 0)}%) have no linked decision plan.`
        : null,
    sample: entries.length,
    min_sample: MIN,
  });
  return patterns;
}

// ---------------------------------------------------------------- protections

export type BehaviorPolicy = {
  consent: boolean;
  cooling_off_minutes: number;
  cooling_off_after_losses: number;
  max_daily_decisions: number;
  mandatory_thesis: boolean;
  drawdown_trigger_pct: number;
  drawdown_size_pct: number;
  explain_prompt: boolean;
};

export const DEFAULT_BEHAVIOR_POLICY: BehaviorPolicy = {
  consent: false,
  cooling_off_minutes: 30,
  cooling_off_after_losses: 2,
  max_daily_decisions: 0,
  mandatory_thesis: false,
  drawdown_trigger_pct: 0,
  drawdown_size_pct: 50,
  explain_prompt: true,
};

export type ProtectionContext = {
  now: number;
  orders: BehaviorOrder[];
  /** Whether the ticket has a complete linked decision plan. */
  plan_ready: boolean;
  /** Notional of the proposed entry. */
  proposed_value: number;
  /** Realised drawdown from the peak of cumulative P&L, % of net deposits. */
  drawdown_pct: number;
  side: "BUY" | "SELL";
  patterns: Pattern[];
};

export type ProtectionResult = {
  blocks: string[];
  prompts: string[];
  /** Maximum notional allowed by drawdown risk reduction; null when not active. */
  size_cap: number | null;
  warnings: string[];
};

const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Evaluate configured protections for a proposed order. Exits (SELL) are never
 * blocked: protections must not trap a user in a losing position.
 */
export function evaluateProtections(
  policy: BehaviorPolicy,
  ctx: ProtectionContext,
): ProtectionResult {
  const result: ProtectionResult = { blocks: [], prompts: [], size_cap: null, warnings: [] };
  if (!policy.consent) return result;
  for (const pattern of ctx.patterns.filter((p) => p.detected && p.statement))
    result.warnings.push(pattern.statement!);
  if (ctx.side === "SELL") return result;

  const trips = roundTrips(ctx.orders).sort((a, b) => a.exit_at.localeCompare(b.exit_at));
  const n = Math.max(1, policy.cooling_off_after_losses);
  const recent = trips.slice(-n);
  if (policy.cooling_off_minutes > 0 && recent.length === n && recent.every((t) => t.pnl < 0)) {
    const until = Date.parse(recent.at(-1)!.exit_at) + policy.cooling_off_minutes * 60_000;
    if (ctx.now < until)
      result.blocks.push(
        `Cooling-off: ${n} consecutive losses. New entries resume at ${new Date(until).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`,
      );
  }
  if (policy.max_daily_decisions > 0) {
    const today = istDay(ctx.now);
    const count = ctx.orders.filter((o) => istDay(Date.parse(o.created_at)) === today).length;
    if (count >= policy.max_daily_decisions)
      result.blocks.push(`Daily decision limit reached (${count}/${policy.max_daily_decisions}).`);
  }
  if (policy.mandatory_thesis && !ctx.plan_ready)
    result.blocks.push(
      "Mandatory thesis review: complete and link a decision plan before entering.",
    );
  if (policy.drawdown_trigger_pct > 0 && ctx.drawdown_pct >= policy.drawdown_trigger_pct) {
    const sizes = ctx.orders
      .filter((o) => o.side === "BUY" && o.filled_quantity > 0)
      .map((o) => o.filled_quantity * (o.avg_fill_price ?? o.price));
    const typical = median(sizes);
    if (typical != null) {
      result.size_cap = round((typical * policy.drawdown_size_pct) / 100, 0);
      if (ctx.proposed_value > result.size_cap)
        result.blocks.push(
          `Drawdown risk reduction: you are ${round(ctx.drawdown_pct, 1)}% below your peak, so entries are capped at ₹${result.size_cap.toLocaleString("en-IN")} (${policy.drawdown_size_pct}% of your typical size).`,
        );
    }
  }
  if (policy.explain_prompt && result.warnings.length)
    result.prompts.push("Explain why this trade is different from the pattern above.");
  return result;
}

/** Realised drawdown from peak cumulative P&L, as % of net deposits. */
export function realisedDrawdownPct(orders: BehaviorOrder[], netDeposits: number) {
  if (!(netDeposits > 0)) return 0;
  let cumulative = 0;
  let peak = 0;
  for (const trip of roundTrips(orders).sort((a, b) => a.exit_at.localeCompare(b.exit_at))) {
    cumulative += trip.pnl;
    peak = Math.max(peak, cumulative);
  }
  return Math.max(0, ((peak - cumulative) / netDeposits) * 100);
}
