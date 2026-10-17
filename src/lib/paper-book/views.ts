/** Rupee-denominated read models. The book itself stays in integer paise. */
import { fromPaise } from "../money.ts";
import {
  settlementBalances,
  fillSettlementDue,
  SETTLEMENT_CALENDAR_VERSION,
} from "./settlement.ts";
import {
  availableCash,
  availableShares,
  dayLoss,
  markIsFresh,
  markedEquity,
  reconcile,
  reservedCash,
} from "./engine.ts";
import type {
  BookEvent,
  BookOrder,
  BookState,
  Clock,
  Fill,
  Holding,
  LedgerEntry,
  Protection,
  QuoteObservation,
} from "./types.ts";

const rupees = (value: number | null) => (value == null ? null : fromPaise(value));

export function observationView(quote: QuoteObservation | Record<string, unknown>) {
  if (!("price_paise" in quote)) return quote;
  const q = quote as QuoteObservation;
  return {
    symbol: q.symbol,
    price: fromPaise(q.price_paise),
    bid: rupees(q.bid_paise),
    ask: rupees(q.ask_paise),
    bid_size: q.bid_size,
    ask_size: q.ask_size,
    source: q.provider,
    as_of: q.provider_time,
    received_at: q.received_at,
    decision_at: q.decision_at,
    market_session: q.market_session,
    delayed: q.delayed,
    stale: q.stale,
    change_pct: q.change_pct,
  };
}

export function accountView(state: BookState) {
  const a = state.account;
  const settlement = settlementBalances(state, Date.now());
  const cost = state.holdings.reduce((t, h) => t + h.cost_paise, 0);
  const net = a.realised_gross_paise - a.charges_paise;
  return {
    currency: a.currency,
    total_funds: fromPaise(a.net_deposits_paise),
    funds_used: fromPaise(cost),
    profit: fromPaise(net),
    realised_gross: fromPaise(a.realised_gross_paise),
    charges_paid: fromPaise(a.charges_paise),
    profit_pct: a.net_deposits_paise > 0 ? (net / a.net_deposits_paise) * 100 : 0,
    wallet_balance: fromPaise(a.cash_paise),
    reserved_cash: fromPaise(reservedCash(state)),
    available_cash: fromPaise(availableCash(state)),
    settled_cash: settlement.unverified_fills ? null : fromPaise(settlement.settled_cash_paise),
    unsettled_cash: settlement.unverified_fills ? null : fromPaise(settlement.unsettled_cash_paise),
    withdrawable_cash: settlement.unverified_fills
      ? 0
      : fromPaise(Math.max(0, availableCash(state) - settlement.pending_sale_proceeds_paise)),
    settlement_status: settlement.unverified_fills ? "UNVERIFIED" : "VERIFIED_CALENDAR",
    settlement_policy: "Paper T+1: release after the next clearing day finishes; no T+0",
    settlement_calendar_version: SETTLEMENT_CALENDAR_VERSION,
    onboarded: a.onboarded,
    updated_at: a.updated_at,
  };
}

export function holdingView(state: BookState, holding: Holding, now: number) {
  return {
    ...settlementBalances(state, now).holdings.get(holding.symbol),
    id: holding.id,
    symbol: holding.symbol,
    company: holding.company,
    sector: holding.sector,
    quantity: holding.quantity,
    avg_price: fromPaise(holding.cost_paise) / holding.quantity,
    cost_basis: fromPaise(holding.cost_paise),
    last_price: fromPaise(holding.mark_paise),
    marked_at: holding.marked_at,
    mark_source: holding.mark_source,
    mark_fresh: markIsFresh(holding, now),
    available_quantity: availableShares(state, holding.symbol),
  };
}

export function orderView(order: BookOrder) {
  return {
    id: order.id,
    intent_id: order.intent_id,
    symbol: order.symbol,
    company: order.company,
    side: order.side,
    order_type: order.order_type,
    quantity: order.quantity,
    filled_quantity: order.filled_quantity,
    limit_price: rupees(order.limit_price_paise),
    price: fromPaise(order.price_paise),
    avg_fill_price: rupees(order.avg_fill_paise),
    status: order.status,
    status_reason: order.status_reason,
    filled_at: order.filled_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
    expires_at: order.expires_at,
    product: order.product,
    validity: order.validity,
    charges: fromPaise(order.charges_paise),
    estimated_charges: fromPaise(
      order.filled_quantity ? order.charges_paise : order.estimated_charges_paise,
    ),
    stop_loss: rupees(order.stop_loss_paise),
    target_price: rupees(order.target_paise),
    trailing_stop: rupees(order.trailing_paise),
    execution_mode: order.execution_mode,
    quote_snapshot: observationView(order.quote_snapshot),
    parent_order_id: order.parent_order_id,
    protection_id: order.protection_id,
    oco_group_id: order.oco_group_id ?? null,
    version: order.version,
  };
}

export function ledgerView(entry: LedgerEntry) {
  return {
    id: entry.id,
    seq: entry.seq,
    kind: entry.kind,
    amount: fromPaise(entry.amount_paise),
    balance_after: fromPaise(entry.balance_after_paise),
    note: entry.note,
    order_id: entry.order_id,
    fill_id: entry.fill_id,
    created_at: entry.created_at,
  };
}

export function fillView(fill: Fill) {
  return {
    settlement_due_at: fillSettlementDue(fill),
    id: fill.id,
    seq: fill.seq,
    order_id: fill.order_id,
    symbol: fill.symbol,
    side: fill.side,
    quantity: fill.quantity,
    price: fromPaise(fill.price_paise),
    reference_price: fromPaise(fill.reference_price_paise),
    method: fill.method,
    liquidity_limited: fill.liquidity_limited,
    slippage_bps: fill.slippage_bps,
    charges: fill.charges
      ? {
          schedule: fill.charges.schedule,
          total: fromPaise(fill.charges.total_paise),
          items: fill.charges.items.map((item) => ({
            ...item,
            amount: fromPaise(item.amount_paise),
          })),
        }
      : null,
    charges_debited: fill.charges_debited,
    quote: observationView(fill.quote),
    created_at: fill.created_at,
  };
}

export function protectionView(protection: Protection) {
  return {
    id: protection.id,
    parent_order_id: protection.parent_order_id,
    symbol: protection.symbol,
    company: protection.company,
    quantity: protection.quantity,
    remaining_quantity: protection.remaining_quantity,
    stop_loss: rupees(protection.stop_paise),
    target_price: rupees(protection.target_paise),
    trailing_stop: rupees(protection.trailing_paise),
    peak_price: fromPaise(protection.peak_paise),
    status: protection.status,
    exits: protection.exits,
    last_error: protection.last_error,
    attempts: protection.attempts,
    created_at: protection.created_at,
    updated_at: protection.updated_at,
  };
}

export function eventView(event: BookEvent) {
  return event;
}

export function riskLimitsView(state: BookState) {
  const r = state.risk_limits;
  return {
    user_id: r.user_id,
    daily_loss_limit: fromPaise(r.daily_loss_limit_paise),
    max_order_value: fromPaise(r.max_order_value_paise),
    max_position_pct: r.max_position_pct,
    confirmation_above: fromPaise(r.confirmation_above_paise),
    trading_paused: r.trading_paused,
    updated_at: r.updated_at,
  };
}

/** Day-loss, valuation and enforcement state for the Risk page. */
export function riskStatusView(state: BookState, clock: Clock) {
  const { loss, stale, day } = dayLoss(state, clock);
  const { equity } = markedEquity(state, clock.now);
  const limit = state.risk_limits.daily_loss_limit_paise;
  return {
    session_date: day.date,
    anchor_equity: fromPaise(day.anchor_equity_paise),
    anchor_source: day.anchor_source,
    anchored_at: day.anchored_at,
    cash_flows: fromPaise(day.flows_paise),
    marked_equity: fromPaise(equity),
    day_loss: fromPaise(Math.max(0, loss)),
    day_pnl: fromPaise(-loss),
    daily_loss_limit: fromPaise(limit),
    blocked: state.risk_limits.trading_paused || (loss > 0 && loss >= limit),
    blocked_reason: state.risk_limits.trading_paused
      ? "TRADING_PAUSED"
      : loss > 0 && loss >= limit
        ? "DAILY_LOSS_LIMIT"
        : null,
    stale_marks: stale,
    valuation_policy:
      "Positions are valued at their latest provider mark. Stale marks are carried at the last observed price and listed here; no price is invented.",
    reserved_cash: fromPaise(reservedCash(state)),
    available_cash: fromPaise(availableCash(state)),
  };
}

export function bookReport(state: BookState) {
  return {
    version: state.version,
    migrated_from: state.migrated_from,
    seq: state.seq,
    reconciliation: reconcile(state),
    quarantine: state.quarantine,
    counts: {
      orders: state.orders.length,
      fills: state.fills.length,
      ledger: state.ledger.length,
      events: state.events.length,
      holdings: state.holdings.length,
      protections: state.protections.filter((p) => p.status === "ACTIVE").length,
    },
    worker: state.worker,
  };
}
