/**
 * Pre-trade risk compiler. Turns an order intent plus the observed quote,
 * history-derived volatility and the current book into a complete execution
 * preview: fill range, costs, liquidity, concentration, scenario losses and
 * policy violations, with one plain-language summary sentence.
 *
 * Every estimate states its basis. Inputs that were not observed produce null
 * values and an explicit note, never an invented number.
 */
import { deliveryCharges } from "../paper-fees.ts";
import { round } from "./stats.ts";

export type CompilerHolding = {
  symbol: string;
  sector: string;
  quantity: number;
  price: number;
};

export type CompilerInput = {
  symbol: string;
  sector: string;
  side: "BUY" | "SELL";
  quantity: number;
  order_type: "MARKET" | "LIMIT" | "STOP";
  limit_price: number | null;
  quote: {
    price: number;
    bid: number | null;
    ask: number | null;
    bid_size: number | null;
    ask_size: number | null;
    stale: boolean;
    delayed: boolean;
  };
  /** 20-session average daily volume, shares. */
  adv: number | null;
  /** Standard deviation of daily close-to-close returns. */
  daily_vol: number | null;
  /** 95th percentile of adverse overnight gaps (positive fraction). */
  gap_p95: number | null;
  /** Worst adverse overnight gap observed in the history window (positive fraction). */
  gap_worst: number | null;
  /** Beta to NIFTY 50 over the history window. */
  beta: number | null;
  stop: number | null;
  target: number | null;
  holding_days: number | null;
  holdings: CompilerHolding[];
  cash: number;
  limits: {
    max_order_value: number;
    max_position_pct: number;
    daily_loss_limit: number;
    max_sector_pct: number;
  };
  /** Loss already taken today against the daily limit (positive number). */
  day_loss: number;
  /** Planned risk already committed by other open plans today. */
  committed_risk_today: number;
  events: { title: string; at: string; kind: string }[];
  behavior_warnings: string[];
  at: string;
};

export type Scenario = { name: string; loss: number | null; basis: string };

export type Violation = {
  code: string;
  severity: "BLOCK" | "WARN";
  message: string;
};

export type RiskPreview = {
  side: "BUY" | "SELL";
  reference_price: number;
  fill_range: { best: number; worst: number; basis: string };
  turnover: number;
  spread_cost: number | null;
  expected_slippage: number;
  slippage_basis: string;
  fees: number;
  fees_round_trip: number;
  fee_items: { label: string; amount: number }[];
  fee_schedule: string | null;
  participation_pct: number | null;
  top_of_book_pct: number | null;
  worst_partial_fill: { quantity: number; pct: number; note: string };
  position_pct_after: number | null;
  sector_pct_after: number | null;
  top_sector_after: { sector: string; pct: number } | null;
  beta_exposure: number | null;
  stop_distance_pct: number | null;
  planned_loss: number | null;
  gap_loss: number | null;
  scenarios: Scenario[];
  daily_budget_used_pct: number | null;
  daily_budget_remaining: number;
  reward_risk: number | null;
  events_in_horizon: { title: string; at: string; kind: string }[];
  violations: Violation[];
  notes: string[];
  narrative: string;
};

const inr = (value: number) =>
  `₹${Math.round(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function charges(side: "BUY" | "SELL", value: number, at: string) {
  try {
    const breakdown = deliveryCharges(side, Math.round(value * 100), at);
    return {
      total: breakdown.total_paise / 100,
      items: breakdown.items.map((item) => ({
        label: item.label,
        amount: item.amount_paise / 100,
      })),
      schedule: breakdown.schedule,
    };
  } catch {
    return null;
  }
}

/** Square-root market-impact estimate in basis points; zero when unobservable. */
export function impactBps(quantity: number, adv: number | null, dailyVol: number | null) {
  if (!adv || adv <= 0 || dailyVol == null) return null;
  // Almgren-style square-root law with a conservative unit coefficient.
  return Math.sqrt(quantity / adv) * dailyVol * 10_000;
}

export function compileRisk(input: CompilerInput): RiskPreview {
  const notes: string[] = [];
  const violations: Violation[] = [];
  const buy = input.side === "BUY";
  const { quote } = input;
  const reference =
    input.order_type === "MARKET"
      ? buy
        ? (quote.ask ?? quote.price)
        : (quote.bid ?? quote.price)
      : (input.limit_price ?? quote.price);
  const turnover = reference * input.quantity;

  // Spread: half the quoted spread against the mid is the cost of crossing.
  const spread =
    quote.bid != null && quote.ask != null && quote.ask >= quote.bid ? quote.ask - quote.bid : null;
  const spreadCost =
    spread != null && input.order_type === "MARKET" ? (spread / 2) * input.quantity : null;
  if (spread == null) notes.push("No two-sided quote observed; spread cost is unknown.");

  const impact = impactBps(input.quantity, input.adv, input.daily_vol);
  const slippageBps = impact ?? (spread != null ? 0 : 10);
  const expectedSlippage = input.order_type === "MARKET" ? (slippageBps / 10_000) * turnover : 0;
  const slippageBasis =
    input.order_type !== "MARKET"
      ? "Limit/stop orders fill at or better than the limit; slippage is not charged."
      : impact != null
        ? `Square-root impact: sqrt(qty / ADV) × daily volatility = ${round(slippageBps, 1)} bps.`
        : spread != null
          ? "Volume history unavailable; impact assumed zero beyond the quoted spread."
          : "No spread or volume observed; a 10 bps placeholder is applied and flagged.";

  const worstFill =
    input.order_type === "MARKET"
      ? reference * (1 + ((buy ? 1 : -1) * Math.max(slippageBps * 2, 5)) / 10_000)
      : reference;
  const fillRange = {
    best: round(Math.min(reference, worstFill), 2),
    worst: round(Math.max(reference, worstFill), 2),
    basis:
      input.order_type === "MARKET"
        ? "Best: observed touch price. Worst: touch plus twice the modelled impact (minimum 5 bps)."
        : "Fills only at the limit or better; may not fill at all.",
  };
  if (!buy) {
    fillRange.best = round(Math.max(reference, worstFill), 2);
    fillRange.worst = round(Math.min(reference, worstFill), 2);
  }

  const entryFees = charges(input.side, turnover, input.at);
  const exitFees = charges(buy ? "SELL" : "BUY", turnover, input.at);
  if (!entryFees) notes.push("No verified charge schedule covers this date; fees are unknown.");
  const fees = entryFees?.total ?? 0;

  // Liquidity: the paper engine fills at most the displayed top-of-book size.
  const topSize = buy ? quote.ask_size : quote.bid_size;
  const participation = input.adv ? (input.quantity / input.adv) * 100 : null;
  const topOfBookPct = topSize ? (input.quantity / topSize) * 100 : null;
  const partialQuantity =
    topSize != null && input.order_type === "MARKET"
      ? Math.min(input.quantity, Math.floor(topSize))
      : input.quantity;
  const worstPartial = {
    quantity: partialQuantity,
    pct: round((partialQuantity / input.quantity) * 100, 1),
    note:
      topSize == null
        ? "Displayed size unknown; the full quantity may not fill."
        : partialQuantity < input.quantity
          ? `Only ${partialQuantity} shares are displayed at the touch; the market remainder is cancelled for lack of observed liquidity.`
          : "Displayed size covers the full quantity.",
  };

  // Portfolio after the trade.
  const value = (h: CompilerHolding) => h.quantity * h.price;
  const holdingsValue = input.holdings.reduce((t, h) => t + value(h), 0);
  const equity = input.cash + holdingsValue;
  const existing = input.holdings.find((h) => h.symbol === input.symbol);
  const positionAfter = Math.max(
    0,
    (existing ? value(existing) : 0) +
      (buy ? turnover : -Math.min(turnover, existing ? value(existing) : 0)),
  );
  const sectorValues = new Map<string, number>();
  for (const h of input.holdings)
    sectorValues.set(h.sector, (sectorValues.get(h.sector) ?? 0) + value(h));
  sectorValues.set(
    input.sector,
    Math.max(0, (sectorValues.get(input.sector) ?? 0) + (buy ? turnover : -turnover)),
  );
  // Equity is unchanged by a trade apart from costs; use it as the denominator.
  const base = equity > 0 ? equity - fees - expectedSlippage : null;
  const positionPct = base ? (positionAfter / base) * 100 : null;
  const sectorPct = base ? ((sectorValues.get(input.sector) ?? 0) / base) * 100 : null;
  const top = [...sectorValues.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSector = top && base ? { sector: top[0], pct: round((top[1] / base) * 100, 1) } : null;
  // Beta-weighted exposure of this position, as a percentage of equity.
  const betaExposure =
    input.beta != null && base ? round(((input.beta * positionAfter) / base) * 100, 1) : null;

  // Risk to the stop and through it.
  const stopDistance = input.stop != null ? Math.abs(reference - input.stop) : null;
  const plannedLoss =
    buy && stopDistance != null
      ? stopDistance * input.quantity + fees + (exitFees?.total ?? 0) + expectedSlippage
      : null;
  const gapLoss =
    buy && input.stop != null && input.gap_p95 != null
      ? (reference - input.stop * (1 - input.gap_p95)) * input.quantity +
        fees +
        (exitFees?.total ?? 0)
      : null;
  const scenarios: Scenario[] = buy
    ? [
        {
          name: "Planned stop",
          loss: plannedLoss,
          basis:
            input.stop == null ? "No stop set." : `Exit at ₹${input.stop} plus round-trip costs.`,
        },
        {
          name: "Gap through stop",
          loss: gapLoss,
          basis:
            input.gap_p95 == null
              ? "Gap history unavailable."
              : `Opens ${round(input.gap_p95 * 100, 2)}% below the stop (95th percentile adverse overnight gap).`,
        },
        {
          name: "Worst observed gap",
          loss:
            input.gap_worst != null
              ? (reference - (input.stop ?? reference) * (1 - input.gap_worst)) * input.quantity +
                fees +
                (exitFees?.total ?? 0)
              : null,
          basis:
            input.gap_worst == null
              ? "Gap history unavailable."
              : `Largest adverse overnight gap in the window: ${round(input.gap_worst * 100, 2)}%.`,
        },
        {
          name: "Three-sigma move over horizon, no stop",
          loss:
            input.daily_vol != null
              ? reference *
                input.quantity *
                Math.min(1, 3 * input.daily_vol * Math.sqrt(input.holding_days ?? 1))
              : null,
          basis:
            input.daily_vol == null
              ? "Volatility history unavailable."
              : `3 × ${round(input.daily_vol * 100, 2)}% daily volatility × √${input.holding_days ?? 1} days.`,
        },
      ]
    : [
        {
          name: "Exit proceeds after costs",
          loss: -(turnover - fees - expectedSlippage),
          basis: "Negative loss means cash received.",
        },
      ];

  const budget = input.limits.daily_loss_limit;
  const remaining = Math.max(0, budget - input.day_loss - input.committed_risk_today);
  const budgetUsed = plannedLoss != null && budget > 0 ? (plannedLoss / budget) * 100 : null;

  const rewardRisk =
    buy && input.stop != null && input.target != null && reference > input.stop
      ? round((input.target - reference) / (reference - input.stop), 2)
      : null;

  const horizonEnd = Date.parse(input.at) + (input.holding_days ?? 5) * 1.45 * 86_400_000;
  const eventsInHorizon = input.events.filter((event) => {
    const at = Date.parse(event.at);
    return Number.isFinite(at) && at >= Date.parse(input.at) - 86_400_000 && at <= horizonEnd;
  });

  // Policy checks.
  // Matches the paper engine: limits apply to new exposure; exits only need shares.
  if (buy && turnover > input.limits.max_order_value)
    violations.push({
      code: "MAX_ORDER_VALUE",
      severity: "BLOCK",
      message: `Order value ${inr(turnover)} exceeds your ${inr(input.limits.max_order_value)} limit.`,
    });
  if (buy && turnover + fees > input.cash)
    violations.push({
      code: "INSUFFICIENT_CASH",
      severity: "BLOCK",
      message: `Needs ${inr(turnover + fees)}; available cash is ${inr(input.cash)}.`,
    });
  if (buy && positionPct != null && positionPct > input.limits.max_position_pct)
    violations.push({
      code: "MAX_POSITION",
      severity: "BLOCK",
      message: `Position would be ${round(positionPct, 1)}% of equity; your limit is ${input.limits.max_position_pct}%.`,
    });
  if (buy && sectorPct != null && sectorPct > input.limits.max_sector_pct)
    violations.push({
      code: "SECTOR_CONCENTRATION",
      severity: "WARN",
      message: `${input.sector} exposure would be ${round(sectorPct, 1)}% of equity (policy ${input.limits.max_sector_pct}%).`,
    });
  if (buy && input.stop == null)
    violations.push({
      code: "NO_STOP",
      severity: "WARN",
      message: "No stop: the loss is bounded only by the scenarios below.",
    });
  if (plannedLoss != null && plannedLoss > remaining)
    violations.push({
      code: "DAILY_RISK_BUDGET",
      severity: "BLOCK",
      message: `Planned loss ${inr(plannedLoss)} exceeds the ${inr(remaining)} left in today's risk budget.`,
    });
  if (rewardRisk != null && rewardRisk < 1)
    violations.push({
      code: "REWARD_RISK",
      severity: "WARN",
      message: `Reward-to-risk is ${rewardRisk}: the target is closer than the stop.`,
    });
  if (quote.stale || quote.delayed)
    violations.push({
      code: "DATA_QUALITY",
      severity: "WARN",
      message: `The quote is ${quote.stale ? "stale" : "delayed"}; estimates rest on an old observation.`,
    });
  if (participation != null && participation > 5)
    violations.push({
      code: "LIQUIDITY",
      severity: "WARN",
      message: `Order is ${round(participation, 1)}% of average daily volume.`,
    });
  for (const event of eventsInHorizon)
    violations.push({
      code: "EVENT_RISK",
      severity: "WARN",
      message: `${event.kind}: ${event.title} (${event.at.slice(0, 10)}) falls inside the holding period.`,
    });
  for (const warning of input.behavior_warnings)
    violations.push({ code: "BEHAVIOR", severity: "WARN", message: warning });

  const parts: string[] = [];
  if (buy) {
    parts.push(
      plannedLoss != null
        ? `This trade risks ${inr(plannedLoss)} under your planned stop`
        : "This trade has no stop, so its planned risk is undefined",
    );
    if (gapLoss != null) parts.push(`${inr(gapLoss)} under a gap scenario`);
    if (sectorPct != null)
      parts.push(`increases ${input.sector} exposure to ${round(sectorPct, 0)}%`);
    if (budgetUsed != null)
      parts.push(`consumes ${round(budgetUsed, 0)}% of your daily risk budget`);
  } else {
    parts.push(
      `This sale raises about ${inr(turnover - fees - expectedSlippage)} after ${inr(fees + expectedSlippage)} in costs`,
    );
    if (sectorPct != null)
      parts.push(`leaves ${input.sector} at ${round(sectorPct, 0)}% of equity`);
  }
  const narrative =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}.`
      : `${parts[0] ?? ""}.`;

  return {
    side: input.side,
    reference_price: round(reference, 2),
    fill_range: fillRange,
    turnover: round(turnover, 2),
    spread_cost: spreadCost == null ? null : round(spreadCost, 2),
    expected_slippage: round(expectedSlippage, 2),
    slippage_basis: slippageBasis,
    fees: round(fees, 2),
    fees_round_trip: round(fees + (exitFees?.total ?? 0), 2),
    fee_items: entryFees?.items ?? [],
    fee_schedule: entryFees?.schedule ?? null,
    participation_pct: participation == null ? null : round(participation, 3),
    top_of_book_pct: topOfBookPct == null ? null : round(topOfBookPct, 1),
    worst_partial_fill: worstPartial,
    position_pct_after: positionPct == null ? null : round(positionPct, 1),
    sector_pct_after: sectorPct == null ? null : round(sectorPct, 1),
    top_sector_after: topSector,
    beta_exposure: betaExposure,
    stop_distance_pct: stopDistance != null ? round((stopDistance / reference) * 100, 2) : null,
    planned_loss: plannedLoss == null ? null : round(plannedLoss, 0),
    gap_loss: gapLoss == null ? null : round(gapLoss, 0),
    scenarios: scenarios.map((s) => ({ ...s, loss: s.loss == null ? null : round(s.loss, 0) })),
    daily_budget_used_pct: budgetUsed == null ? null : round(budgetUsed, 1),
    daily_budget_remaining: round(remaining, 0),
    reward_risk: rewardRisk,
    events_in_horizon: eventsInHorizon,
    violations,
    notes,
    narrative,
  };
}

/** History-derived inputs for the compiler from daily bars. */
export function historyRiskInputs(
  bars: { open: number; close: number; volume: number }[],
  index?: { close: number }[],
) {
  const closes = bars.map((b) => b.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) returns.push(closes[i]! / closes[i - 1]! - 1);
  const recent = returns.slice(-60);
  const m = recent.reduce((t, v) => t + v, 0) / (recent.length || 1);
  const dailyVol =
    recent.length >= 10
      ? Math.sqrt(recent.reduce((t, v) => t + (v - m) ** 2, 0) / (recent.length - 1))
      : null;
  const gaps: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const gap = bars[i]!.open / bars[i - 1]!.close - 1;
    if (gap < 0) gaps.push(-gap);
  }
  gaps.sort((a, b) => a - b);
  const gapP95 = gaps.length >= 10 ? gaps[Math.floor(0.95 * (gaps.length - 1))]! : null;
  const gapWorst = gaps.length ? gaps.at(-1)! : null;
  const volumes = bars
    .slice(-20)
    .map((b) => b.volume)
    .filter((v) => v > 0);
  const adv = volumes.length >= 5 ? volumes.reduce((t, v) => t + v, 0) / volumes.length : null;
  let beta: number | null = null;
  if (index && index.length > 30) {
    const ir: number[] = [];
    for (let i = 1; i < index.length; i++) ir.push(index[i]!.close / index[i - 1]!.close - 1);
    const n = Math.min(ir.length, returns.length, 120);
    const a = returns.slice(-n);
    const b = ir.slice(-n);
    const ma = a.reduce((t, v) => t + v, 0) / n;
    const mb = b.reduce((t, v) => t + v, 0) / n;
    let cov = 0;
    let varB = 0;
    for (let i = 0; i < n; i++) {
      cov += (a[i]! - ma) * (b[i]! - mb);
      varB += (b[i]! - mb) ** 2;
    }
    beta = varB > 0 ? round(cov / varB, 2) : null;
  }
  return { daily_vol: dailyVol, gap_p95: gapP95, gap_worst: gapWorst, adv, beta };
}
