/**
 * Market flight simulator. Replays the information environment, not only
 * candles: news is released at its original availability time, gaps, halts
 * and suspected corporate actions are detected from the bars, orders face a
 * modelled spread, latency and a participation cap that produces partial
 * fills, and a separate replay wallet carries its own risk profile.
 *
 * Hidden-future protection: every accessor takes the cursor and returns only
 * information whose availability time is at or before the cursor bar's close.
 */
import { applyRate, type Paise } from "../money.ts";
import { deliveryCharges } from "../paper-fees.ts";
import { clamp, round } from "./stats.ts";

export type SimBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SimNews = {
  id: string;
  title: string;
  source: string;
  /** Unix seconds when the article became available. */
  available_at: number;
  sentiment: "positive" | "neutral" | "negative" | "unavailable";
  url?: string | null;
};

export type SimMode = "DECISION" | "EXECUTION" | "RISK" | "NEWS" | "BLIND";

export type SimConfig = {
  /** Bars between a decision and the order reaching the market (0 = next bar open). */
  latency_bars: number;
  /** Maximum share of a bar's volume the replay account may take. */
  participation: number;
  /** Bar duration in seconds; daily bars use 86400. */
  bar_seconds: number;
  max_position_pct: number;
  stop_pct: number | null;
  starting_cash_paise: Paise;
};

export const DEFAULT_SIM_CONFIG: SimConfig = {
  latency_bars: 0,
  participation: 0.05,
  bar_seconds: 86_400,
  max_position_pct: 50,
  stop_pct: null,
  starting_cash_paise: 10_00_000_00,
};

export type SimOrder = {
  id: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  limit: number | null;
  quantity: number;
  remaining: number;
  decided_at: number;
  /** First bar index at which the order may trade (latency applied). */
  active_from: number;
  status: "PENDING" | "PARTIAL" | "FILLED" | "CANCELLED" | "REJECTED";
  reason: string | null;
};

export type SimFill = {
  order_id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  at: number;
  spread_cost: number;
  charges: number | null;
  partial: boolean;
  gap_through_stop: boolean;
};

export type SimMarker = {
  at: number;
  kind: "GAP" | "HALT" | "CORPORATE_ACTION?" | "STOP";
  detail: string;
};

export type SimDecision = {
  at: number;
  cursor: number;
  action: "BUY" | "SELL" | "HOLD";
  thesis: string;
  /** Blind challenge: filled in only after reveal. */
  revealed_return: number | null;
};

export type SimState = {
  start: number;
  cursor: number;
  cash_paise: Paise;
  quantity: number;
  cost_paise: Paise;
  stop: number | null;
  orders: SimOrder[];
  fills: SimFill[];
  markers: SimMarker[];
  decisions: SimDecision[];
  equity_curve: { at: number; equity: number }[];
  thesis_log: { at: number; text: string; news_seen: number }[];
  config: SimConfig;
  next_id: number;
};

export function startSim(
  bars: SimBar[],
  start: number,
  config: SimConfig = DEFAULT_SIM_CONFIG,
): SimState {
  if (start < 1 || start >= bars.length - 1) throw new Error("REPLAY_START_OUT_OF_RANGE");
  return {
    start,
    cursor: start,
    cash_paise: config.starting_cash_paise,
    quantity: 0,
    cost_paise: 0,
    stop: null,
    orders: [],
    fills: [],
    markers: detectMarkers(bars, start, start),
    decisions: [],
    equity_curve: [{ at: bars[start]!.time, equity: config.starting_cash_paise / 100 }],
    thesis_log: [],
    config,
    next_id: 1,
  };
}

/** Bars visible at the cursor. */
export function visible(bars: SimBar[], state: SimState) {
  return bars.slice(0, state.cursor + 1);
}

/** News available by the close of the cursor bar. Never returns later items. */
export function visibleNews(news: SimNews[], bars: SimBar[], state: SimState) {
  const close = bars[state.cursor]!.time + state.config.bar_seconds;
  return news
    .filter((item) => item.available_at <= close)
    .sort((a, b) => b.available_at - a.available_at);
}

const CORPORATE_RATIOS = [1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10, 2 / 3, 3 / 4, 1 / 1.5];

function detectMarkers(bars: SimBar[], from: number, to: number): SimMarker[] {
  const out: SimMarker[] = [];
  for (let i = Math.max(1, from); i <= to; i++) {
    const bar = bars[i]!;
    const prior = bars[i - 1]!;
    const gap = bar.open / prior.close - 1;
    if (bar.volume === 0)
      out.push({
        at: bar.time,
        kind: "HALT",
        detail: "No volume: treated as a halt; no replay fills.",
      });
    const ratio = bar.open / prior.close;
    if (Math.abs(gap) > 0.15 && CORPORATE_RATIOS.some((r) => Math.abs(ratio - r) < 0.03))
      out.push({
        at: bar.time,
        kind: "CORPORATE_ACTION?",
        detail: `Open is ${round(ratio, 3)}× the prior close, close to a split/bonus ratio. The corporate-action feed is not connected; treat this bar with caution.`,
      });
    else if (Math.abs(gap) >= 0.02)
      out.push({
        at: bar.time,
        kind: "GAP",
        detail: `Opened ${round(gap * 100, 2)}% from the prior close.`,
      });
  }
  return out;
}

/** Spread estimate from the bar's range: 10% of the high-low range, 2-50 bps. */
export function estimatedSpreadBps(bar: SimBar) {
  return clamp(((bar.high - bar.low) / bar.close) * 10_000 * 0.1, 2, 50);
}

export function placeSimOrder(
  state: SimState,
  bars: SimBar[],
  order: {
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    quantity: number;
    limit?: number | null;
  },
): SimState {
  if (!Number.isSafeInteger(order.quantity) || order.quantity <= 0)
    throw new Error("INVALID_QUANTITY");
  if (state.cursor >= bars.length - 1) throw new Error("REPLAY_FINISHED");
  if (order.type === "LIMIT" && !(order.limit && order.limit > 0)) throw new Error("INVALID_LIMIT");
  const close = bars[state.cursor]!.close;
  const equity = state.cash_paise / 100 + state.quantity * close;
  if (order.side === "BUY") {
    const after = (state.quantity + order.quantity) * close;
    if ((after / equity) * 100 > state.config.max_position_pct)
      return {
        ...state,
        orders: [
          ...state.orders,
          {
            id: `o${state.next_id}`,
            ...order,
            limit: order.limit ?? null,
            remaining: order.quantity,
            decided_at: bars[state.cursor]!.time,
            active_from: state.cursor + 1,
            status: "REJECTED",
            reason: `Replay risk profile: position would be ${round((after / equity) * 100, 1)}% of replay equity (limit ${state.config.max_position_pct}%).`,
          },
        ],
        next_id: state.next_id + 1,
      };
  }
  return {
    ...state,
    orders: [
      ...state.orders,
      {
        id: `o${state.next_id}`,
        side: order.side,
        type: order.type,
        limit: order.limit ?? null,
        quantity: order.quantity,
        remaining: order.quantity,
        decided_at: bars[state.cursor]!.time,
        active_from: state.cursor + 1 + state.config.latency_bars,
        status: "PENDING",
        reason: null,
      },
    ],
    next_id: state.next_id + 1,
  };
}

export function cancelSimOrder(state: SimState, id: string): SimState {
  return {
    ...state,
    orders: state.orders.map((o) =>
      o.id === id && (o.status === "PENDING" || o.status === "PARTIAL")
        ? { ...o, status: "CANCELLED", reason: "Cancelled by you" }
        : o,
    ),
  };
}

function charge(side: "BUY" | "SELL", turnover: Paise, at: number) {
  try {
    return deliveryCharges(side, turnover, new Date(at * 1000).toISOString()).total_paise;
  } catch {
    return null;
  }
}

function applyFill(state: SimState, fill: Omit<SimFill, "charges">): SimState {
  const price = Math.round(fill.price * 100);
  const turnover = price * fill.quantity;
  const charges = charge(fill.side, turnover, fill.at);
  const fee = charges ?? 0;
  if (fill.side === "BUY") {
    return {
      ...state,
      cash_paise: state.cash_paise - turnover - fee,
      quantity: state.quantity + fill.quantity,
      cost_paise: state.cost_paise + turnover,
      fills: [...state.fills, { ...fill, charges: charges == null ? null : charges / 100 }],
    };
  }
  const cost =
    fill.quantity === state.quantity
      ? state.cost_paise
      : applyRate(state.cost_paise, fill.quantity / state.quantity);
  return {
    ...state,
    cash_paise: state.cash_paise + turnover - fee,
    quantity: state.quantity - fill.quantity,
    cost_paise: state.cost_paise - cost,
    fills: [...state.fills, { ...fill, charges: charges == null ? null : charges / 100 }],
  };
}

/** Advance one bar: markers, stop checks, then resting orders in placement order. */
function advance(state: SimState, bars: SimBar[]): SimState {
  const index = state.cursor + 1;
  const bar = bars[index]!;
  let next: SimState = {
    ...state,
    cursor: index,
    markers: [...state.markers, ...detectMarkers(bars, index, index)],
  };
  const halted = bar.volume === 0;
  const half = estimatedSpreadBps(bar) / 2 / 10_000;

  // Protective stop: a gap below the stop fills at the open, not the stop.
  if (!halted && next.stop != null && next.quantity > 0 && bar.low <= next.stop) {
    const gapThrough = bar.open < next.stop;
    const price = (gapThrough ? bar.open : next.stop) * (1 - half);
    next = applyFill(next, {
      order_id: "stop",
      side: "SELL",
      quantity: next.quantity,
      price: round(price, 2),
      at: bar.time,
      spread_cost: round(next.quantity * (gapThrough ? bar.open : next.stop) * half, 2),
      partial: false,
      gap_through_stop: gapThrough,
    });
    next.markers = [
      ...next.markers,
      {
        at: bar.time,
        kind: "STOP",
        detail: gapThrough
          ? `Gapped through the ₹${round(state.stop!, 2)} stop; filled at the ₹${round(bar.open, 2)} open.`
          : `Stop at ₹${round(state.stop!, 2)} triggered.`,
      },
    ];
    next.stop = null;
  }

  let capacity = halted ? 0 : Math.floor(bar.volume * next.config.participation);
  const orders: SimOrder[] = [];
  for (const order of next.orders) {
    if ((order.status !== "PENDING" && order.status !== "PARTIAL") || order.active_from > index) {
      orders.push(order);
      continue;
    }
    let price: number | null = null;
    if (order.type === "MARKET") price = bar.open * (1 + (order.side === "BUY" ? half : -half));
    else if (order.side === "BUY" && bar.low <= order.limit!)
      price = Math.min(bar.open, order.limit!);
    else if (order.side === "SELL" && bar.high >= order.limit!)
      price = Math.max(bar.open, order.limit!);
    if (price == null || capacity <= 0) {
      orders.push(order);
      continue;
    }
    let quantity = Math.min(order.remaining, capacity);
    if (order.side === "SELL") quantity = Math.min(quantity, next.quantity);
    if (order.side === "BUY") {
      const affordable = Math.floor((next.cash_paise / 100 / price) * 0.995);
      quantity = Math.min(quantity, affordable);
    }
    if (quantity <= 0) {
      orders.push({
        ...order,
        status: "REJECTED",
        reason: order.side === "SELL" ? "No replay shares to sell" : "Insufficient replay cash",
      });
      continue;
    }
    capacity -= quantity;
    next = applyFill(next, {
      order_id: order.id,
      side: order.side,
      quantity,
      price: round(price, 2),
      at: bar.time,
      spread_cost: order.type === "MARKET" ? round(quantity * bar.open * half, 2) : 0,
      partial: quantity < order.remaining,
      gap_through_stop: false,
    });
    const remaining = order.remaining - quantity;
    orders.push({
      ...order,
      remaining,
      status: remaining ? "PARTIAL" : "FILLED",
      reason: remaining
        ? `Participation cap: ${quantity} of ${order.remaining} filled this bar.`
        : null,
    });
  }
  next.orders = orders;
  if (next.quantity > 0 && next.config.stop_pct != null && next.stop == null) {
    const avg = next.cost_paise / 100 / next.quantity;
    next.stop = round(avg * (1 - next.config.stop_pct / 100), 2);
  }
  if (next.quantity === 0) next.stop = null;
  next.equity_curve = [...next.equity_curve, { at: bar.time, equity: equityAt(next, bars) }];
  return next;
}

export function stepSim(state: SimState, bars: SimBar[], count = 1): SimState {
  let next = state;
  for (let i = 0; i < count && next.cursor < bars.length - 1; i++) next = advance(next, bars);
  return next;
}

export function equityAt(state: SimState, bars: SimBar[]) {
  return round(state.cash_paise / 100 + state.quantity * bars[state.cursor]!.close, 2);
}

export function setStop(state: SimState, stop: number | null): SimState {
  if (stop != null && !(stop > 0)) throw new Error("INVALID_STOP");
  return { ...state, stop };
}

export function recordDecision(
  state: SimState,
  bars: SimBar[],
  action: SimDecision["action"],
  thesis: string,
): SimState {
  return {
    ...state,
    decisions: [
      ...state.decisions,
      { at: bars[state.cursor]!.time, cursor: state.cursor, action, thesis, revealed_return: null },
    ],
  };
}

/** Blind challenge: reveal the forward return of each unrevealed decision whose window is visible. */
export function revealDecisions(state: SimState, bars: SimBar[], horizon: number): SimState {
  return {
    ...state,
    decisions: state.decisions.map((d) =>
      d.revealed_return == null && d.cursor + horizon <= state.cursor
        ? { ...d, revealed_return: bars[d.cursor + horizon]!.close / bars[d.cursor]!.close - 1 }
        : d,
    ),
  };
}

export function scoreDecisions(decisions: SimDecision[]) {
  const scored = decisions.filter((d) => d.revealed_return != null && d.action !== "HOLD");
  const correct = scored.filter((d) =>
    d.action === "BUY" ? d.revealed_return! > 0 : d.revealed_return! < 0,
  );
  return {
    decided: decisions.length,
    scored: scored.length,
    holds: decisions.filter((d) => d.action === "HOLD").length,
    hit_rate: scored.length ? correct.length / scored.length : null,
  };
}

export function logThesis(
  state: SimState,
  bars: SimBar[],
  text: string,
  newsSeen: number,
): SimState {
  return {
    ...state,
    thesis_log: [...state.thesis_log, { at: bars[state.cursor]!.time, text, news_seen: newsSeen }],
  };
}

export function simSummary(state: SimState, bars: SimBar[]) {
  const equity = equityAt(state, bars);
  const initial = state.config.starting_cash_paise / 100;
  let peak = initial;
  let drawdown = 0;
  for (const point of state.equity_curve) {
    peak = Math.max(peak, point.equity);
    drawdown = Math.min(drawdown, point.equity / peak - 1);
  }
  return {
    equity,
    return_pct: round((equity / initial - 1) * 100, 2),
    buy_and_hold_pct: round((bars[state.cursor]!.close / bars[state.start]!.close - 1) * 100, 2),
    max_drawdown_pct: round(drawdown * 100, 2),
    exposure_pct: round(
      ((state.quantity * bars[state.cursor]!.close) / Math.max(1, equity)) * 100,
      1,
    ),
    partial_fills: state.fills.filter((f) => f.partial).length,
    spread_paid: round(
      state.fills.reduce((t, f) => t + f.spread_cost, 0),
      2,
    ),
    charges_paid: round(
      state.fills.reduce((t, f) => t + (f.charges ?? 0), 0),
      2,
    ),
    charges_unknown: state.fills.some((f) => f.charges == null),
    bars_elapsed: state.cursor - state.start,
    finished: state.cursor >= bars.length - 1,
  };
}
