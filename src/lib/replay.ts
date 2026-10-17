/**
 * Bar-by-bar replay over real provider history. The player only ever sees bars
 * up to the cursor; an order decided at a bar's close fills at the next bar's
 * open, so no decision can use information from its own fill bar or later.
 * Replay accounts are isolated from the paper book and are never persisted.
 */
import { applyRate, type Paise } from "./money.ts";
import { deliveryCharges } from "./paper-fees.ts";
import type { Candle } from "./market-history.ts";

export type ReplayTrade = {
  side: "BUY" | "SELL";
  quantity: number;
  decided_at: number;
  filled_at: number;
  price: number;
  charges: number | null;
};

export type ReplayState = {
  start: number;
  cursor: number;
  cash_paise: Paise;
  quantity: number;
  cost_paise: Paise;
  pending: { side: "BUY" | "SELL"; quantity: number; decided_at: number } | null;
  trades: ReplayTrade[];
  rejected: string | null;
};

export const REPLAY_CASH_PAISE = 1_00_000_00;

export function startReplay(
  candles: Candle[],
  start: number,
  cash = REPLAY_CASH_PAISE,
): ReplayState {
  if (start < 0 || start >= candles.length - 1) throw new Error("REPLAY_START_OUT_OF_RANGE");
  return {
    start,
    cursor: start,
    cash_paise: cash,
    quantity: 0,
    cost_paise: 0,
    pending: null,
    trades: [],
    rejected: null,
  };
}

/** Bars the player may see: everything up to and including the cursor. */
export function visibleBars(candles: Candle[], state: ReplayState) {
  return candles.slice(0, state.cursor + 1);
}

export function queueOrder(
  state: ReplayState,
  candles: Candle[],
  side: "BUY" | "SELL",
  quantity: number,
): ReplayState {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("INVALID_QUANTITY");
  if (state.cursor >= candles.length - 1) throw new Error("REPLAY_FINISHED");
  return {
    ...state,
    pending: { side, quantity, decided_at: candles[state.cursor]!.time },
    rejected: null,
  };
}

function fill(state: ReplayState, bar: Candle): ReplayState {
  const pending = state.pending!;
  const price = Math.round(bar.open * 100);
  const turnover = price * pending.quantity;
  let charges: number | null = null;
  try {
    charges = deliveryCharges(
      pending.side,
      turnover,
      new Date(bar.time * 1000).toISOString(),
    ).total_paise;
  } catch {
    // No verified charge schedule covers this historical date; charges are reported as unknown.
    charges = null;
  }
  const fee = charges ?? 0;
  if (pending.side === "BUY") {
    if (state.cash_paise < turnover + fee)
      return { ...state, pending: null, rejected: "Insufficient replay cash at the next open" };
    return {
      ...state,
      pending: null,
      cash_paise: state.cash_paise - turnover - fee,
      quantity: state.quantity + pending.quantity,
      cost_paise: state.cost_paise + turnover,
      trades: [
        ...state.trades,
        {
          side: "BUY",
          quantity: pending.quantity,
          decided_at: pending.decided_at,
          filled_at: bar.time,
          price: price / 100,
          charges: charges == null ? null : charges / 100,
        },
      ],
    };
  }
  if (state.quantity < pending.quantity)
    return { ...state, pending: null, rejected: "Not enough replay shares to sell" };
  const cost =
    pending.quantity === state.quantity
      ? state.cost_paise
      : applyRate(state.cost_paise, pending.quantity / state.quantity);
  return {
    ...state,
    pending: null,
    cash_paise: state.cash_paise + turnover - fee,
    quantity: state.quantity - pending.quantity,
    cost_paise: state.cost_paise - cost,
    trades: [
      ...state.trades,
      {
        side: "SELL",
        quantity: pending.quantity,
        decided_at: pending.decided_at,
        filled_at: bar.time,
        price: price / 100,
        charges: charges == null ? null : charges / 100,
      },
    ],
  };
}

/** Advance `bars` bars; a pending order fills at the open of the first new bar. */
export function step(state: ReplayState, candles: Candle[], bars = 1): ReplayState {
  let next = state;
  for (let i = 0; i < bars && next.cursor < candles.length - 1; i++) {
    const bar = candles[next.cursor + 1]!;
    if (next.pending) next = fill(next, bar);
    next = { ...next, cursor: next.cursor + 1 };
  }
  return next;
}

export function replaySummary(state: ReplayState, candles: Candle[]) {
  const close = Math.round(candles[state.cursor]!.close * 100);
  const startClose = Math.round(candles[state.start]!.close * 100);
  const equity = state.cash_paise + state.quantity * close;
  const initial = REPLAY_CASH_PAISE;
  return {
    equity: equity / 100,
    return_pct: Math.round(((equity - initial) / initial) * 10000) / 100,
    buy_and_hold_pct: Math.round(((close - startClose) / startClose) * 10000) / 100,
    bars_elapsed: state.cursor - state.start,
    finished: state.cursor >= candles.length - 1,
    charges_unknown: state.trades.some((t) => t.charges == null),
  };
}
