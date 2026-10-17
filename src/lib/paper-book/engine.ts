/**
 * Pure paper-book state machine. Every function mutates an in-memory BookState
 * that the storage layer commits atomically, so a thrown error leaves the
 * persisted book unchanged. Money is integer paise throughout.
 */
import { randomUUID } from "node:crypto";
import {
  dayOrderExpiry,
  exchangeSession,
  previousSessionClose,
  riskSessionDate,
} from "../exchange-calendar.ts";
import { notional, pricePaise, toPaise, type Paise } from "../money.ts";
import { deliveryCharges } from "../paper-fees.ts";
import {
  settlementBalances,
  settlementDue,
  fillSettlementDue,
  SETTLEMENT_CALENDAR_VERSION,
} from "./settlement.ts";
import type {
  BookEvent,
  BookOrder,
  BookState,
  Clock,
  ExecutionMode,
  Fill,
  Holding,
  LedgerEntry,
  OrderType,
  Protection,
  QuoteObservation,
  Reservation,
  Side,
} from "./types.ts";

export const MARK_FRESH_MS = 5 * 60_000;
/** Stop-buy reservations allow this much adverse movement beyond the trigger. */
export const STOP_BUY_RESERVATION_BUFFER = 0.05;
const MAX_SPREAD_FRACTION = 0.05;

export function newBook(userId: string, clock: Clock): BookState {
  return {
    version: 2,
    created_at: clock.iso,
    migrated_from: null,
    seq: 0,
    account: {
      user_id: userId,
      currency: "INR",
      cash_paise: 0,
      net_deposits_paise: 0,
      realised_gross_paise: 0,
      charges_paise: 0,
      onboarded: false,
      updated_at: clock.iso,
    },
    holdings: [],
    orders: [],
    fills: [],
    reservations: [],
    protections: [],
    ledger: [],
    events: [],
    intents: {},
    risk_limits: {
      user_id: userId,
      daily_loss_limit_paise: 50_000_00,
      max_order_value_paise: 10_00_000_00,
      max_position_pct: 25,
      confirmation_above_paise: 5_00_000_00,
      trading_paused: false,
      updated_at: clock.iso,
    },
    risk_day: null,
    simulation: { slippage_bps: 0, max_participation: 1 },
    worker: { owner: null, lease_until: null, heartbeat_at: null },
    watchlist_items: [],
    trading_preferences: [],
    price_alerts: [],
    alert_events: [],
    trade_journal: [],
    conversations: [],
    research_items: [],
    quarantine: [],
  };
}

export function nextSeq(state: BookState): number {
  state.seq += 1;
  return state.seq;
}

export function recordEvent(
  state: BookState,
  clock: Clock,
  type: string,
  entity: string,
  entityId: string,
  data: Record<string, unknown> = {},
  notify = false,
): BookEvent {
  const event = {
    seq: nextSeq(state),
    type,
    entity,
    entity_id: entityId,
    at: clock.iso,
    notify,
    data,
  };
  state.events.push(event);
  return event;
}

function postLedger(
  state: BookState,
  clock: Clock,
  kind: LedgerEntry["kind"],
  amount: Paise,
  note: string,
  orderId: string | null = null,
  fillId: string | null = null,
) {
  state.account.cash_paise += amount;
  if (!Number.isSafeInteger(state.account.cash_paise)) throw new Error("INVALID_AMOUNT");
  if (state.account.cash_paise < 0) throw new Error("INSUFFICIENT_FUNDS");
  state.ledger.push({
    id: randomUUID(),
    seq: nextSeq(state),
    kind,
    amount_paise: amount,
    balance_after_paise: state.account.cash_paise,
    order_id: orderId,
    fill_id: fillId,
    note,
    created_at: clock.iso,
  });
  state.account.updated_at = clock.iso;
}

/** Normalise a server-fetched provider quote into the canonical observation. */
export function observationFromQuote(
  quote: Record<string, unknown>,
  received: Clock,
  decision: Clock = received,
): QuoteObservation {
  const optional = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const bid = optional(quote["bid"]);
  const ask = optional(quote["ask"]);
  const size = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
  return {
    symbol: String(quote["symbol"] ?? ""),
    price_paise: pricePaise(quote["price"]),
    bid_paise: bid == null ? null : Math.round(bid * 100),
    ask_paise: ask == null ? null : Math.round(ask * 100),
    bid_size: size(quote["bid_quantity"] ?? quote["bid_size"]),
    ask_size: size(quote["ask_quantity"] ?? quote["ask_size"]),
    provider: String(quote["source"] ?? "unknown"),
    provider_time: String(quote["as_of"] ?? ""),
    received_at: typeof quote["received_at"] === "string" ? quote["received_at"] : received.iso,
    decision_at: decision.iso,
    market_session: String(quote["market_session"] ?? "unknown"),
    delayed: quote["delayed"] === true,
    stale: quote["stale"] === true,
    change_pct:
      typeof quote["change_pct"] === "number" && Number.isFinite(quote["change_pct"])
        ? quote["change_pct"]
        : null,
  };
}

// ---------------------------------------------------------------- marks / risk

export function markHolding(state: BookState, observation: QuoteObservation) {
  const holding = state.holdings.find((h) => h.symbol === observation.symbol);
  if (!holding) return false;
  const time = Date.parse(observation.provider_time);
  if (!Number.isFinite(time) || time < Date.parse(holding.marked_at)) return false;
  holding.mark_paise = observation.price_paise;
  holding.marked_at = new Date(time).toISOString();
  holding.mark_source = observation.provider;
  return true;
}

export function markIsFresh(holding: Holding, now: number): boolean {
  const marked = Date.parse(holding.marked_at);
  if (!Number.isFinite(marked)) return false;
  if (exchangeSession(now).open) return now - marked <= MARK_FRESH_MS;
  const close = previousSessionClose(now);
  return close != null && marked >= close - MARK_FRESH_MS;
}

/**
 * Marked equity. Stale marks are carried at the last observed mark and are
 * reported; the guard never invents a price for a position.
 */
export function markedEquity(
  state: BookState,
  now: number,
  override?: { symbol: string; price: Paise },
) {
  let equity = state.account.cash_paise;
  const stale: string[] = [];
  for (const holding of state.holdings) {
    const price =
      override && override.symbol === holding.symbol ? override.price : holding.mark_paise;
    if (!(override && override.symbol === holding.symbol) && !markIsFresh(holding, now))
      stale.push(holding.symbol);
    equity += holding.quantity * price;
  }
  return { equity, stale };
}

export function ensureRiskDay(
  state: BookState,
  clock: Clock,
  source: "PRIOR_CLOSE_MARKS" | "FIRST_MUTATION" = "FIRST_MUTATION",
) {
  const date = riskSessionDate(clock.now);
  if (state.risk_day?.date !== date) {
    state.risk_day = {
      date,
      anchor_equity_paise: markedEquity(state, clock.now).equity,
      flows_paise: 0,
      anchor_source: source,
      anchored_at: clock.iso,
    };
    recordEvent(state, clock, "RISK_DAY_ANCHORED", "risk_day", date, {
      anchor_equity_paise: state.risk_day.anchor_equity_paise,
      source,
    });
  }
  return state.risk_day;
}

export function dayLoss(
  state: BookState,
  clock: Clock,
  override?: { symbol: string; price: Paise },
) {
  const day = ensureRiskDay(state, clock);
  const { equity, stale } = markedEquity(state, clock.now, override);
  return { loss: day.anchor_equity_paise + day.flows_paise - equity, stale, day };
}

function activeReservations(state: BookState, kind: Reservation["kind"], exclude?: string) {
  return state.reservations.filter(
    (r) => r.status === "ACTIVE" && r.kind === kind && r.order_id !== exclude,
  );
}

export function reservedCash(state: BookState, excludeOrderId?: string): Paise {
  return activeReservations(state, "CASH", excludeOrderId).reduce((t, r) => t + r.amount, 0);
}

export function availableCash(state: BookState, excludeOrderId?: string): Paise {
  return state.account.cash_paise - reservedCash(state, excludeOrderId);
}

export function availableShares(
  state: BookState,
  symbol: string,
  excludeOrderId?: string,
  excludeGroup?: string | null,
) {
  const held = state.holdings.find((h) => h.symbol === symbol)?.quantity ?? 0;
  const group =
    excludeGroup ?? state.orders.find((order) => order.id === excludeOrderId)?.oco_group_id;
  const amounts = new Map<string, number>();
  for (const reservation of activeReservations(state, "SHARES", excludeOrderId)) {
    if (reservation.symbol !== symbol) continue;
    const siblingGroup = state.orders.find(
      (order) => order.id === reservation.order_id,
    )?.oco_group_id;
    if (group && siblingGroup === group) continue;
    const key = siblingGroup ?? reservation.id;
    amounts.set(key, Math.max(amounts.get(key) ?? 0, reservation.amount));
  }
  const reserved = [...amounts.values()].reduce((total, amount) => total + amount, 0);
  return held - reserved;
}

/** New or increased exposure must pass every guard; reductions only need shares. */
export function exposureCheck(
  state: BookState,
  clock: Clock,
  order: Pick<BookOrder, "id" | "side" | "symbol" | "oco_group_id">,
  quantity: number,
  price: Paise,
) {
  if (order.side === "SELL") {
    if (availableShares(state, order.symbol, order.id, order.oco_group_id) < quantity)
      throw new Error("INSUFFICIENT_QUANTITY");
    return;
  }
  const limits = state.risk_limits;
  if (limits.trading_paused) throw new Error("TRADING_PAUSED");
  const { loss } = dayLoss(state, clock, { symbol: order.symbol, price });
  if (loss > 0 && loss >= limits.daily_loss_limit_paise) throw new Error("DAILY_LOSS_LIMIT");
  const value = notional(quantity, price);
  if (value > limits.max_order_value_paise) throw new Error("ORDER_VALUE_LIMIT");
  const { equity } = markedEquity(state, clock.now, { symbol: order.symbol, price });
  if (equity <= 0) throw new Error("NO_EQUITY");
  const held = state.holdings.find((h) => h.symbol === order.symbol)?.quantity ?? 0;
  if ((held + quantity) * price > (equity * limits.max_position_pct) / 100)
    throw new Error("POSITION_VALUE_LIMIT");
}

// ---------------------------------------------------------------- fills

export function fillQuote(side: Side, observation: QuoteObservation, slippageBps: number) {
  const { bid_paise: bid, ask_paise: ask, price_paise: last } = observation;
  const spreadOk =
    bid != null && ask != null && ask >= bid && (ask - bid) / last <= MAX_SPREAD_FRACTION;
  if (spreadOk) {
    const price = side === "BUY" ? ask : bid;
    const size = side === "BUY" ? observation.ask_size : observation.bid_size;
    return { price, reference: last, method: "QUOTE_BID_ASK" as const, size };
  }
  const adjustment = Math.round((last * slippageBps) / 10_000);
  return {
    price: side === "BUY" ? last + adjustment : Math.max(1, last - adjustment),
    reference: last,
    method: "LAST_TRADE" as const,
    size: null,
  };
}

function reservationBasis(order: BookOrder): Paise {
  const limit = order.limit_price_paise ?? order.price_paise;
  return order.order_type === "STOP" && order.side === "BUY"
    ? Math.ceil(limit * (1 + STOP_BUY_RESERVATION_BUFFER))
    : limit;
}

function syncReservation(state: BookState, clock: Clock, order: BookOrder) {
  const reservation = state.reservations.find(
    (r) => r.order_id === order.id && r.status === "ACTIVE",
  );
  const remaining = order.quantity - order.filled_quantity;
  const terminal = !["OPEN", "PARTIALLY_FILLED"].includes(order.status);
  if (!reservation) return;
  if (terminal || remaining <= 0) {
    reservation.status = order.status === "FILLED" ? "CONSUMED" : "RELEASED";
    reservation.updated_at = clock.iso;
    recordEvent(state, clock, `RESERVATION_${reservation.status}`, "reservation", reservation.id, {
      order_id: order.id,
    });
    return;
  }
  if (reservation.kind === "SHARES") reservation.amount = remaining;
  else {
    const value = notional(remaining, reservationBasis(order));
    reservation.amount = value + deliveryCharges("BUY", value, clock.iso).total_paise;
  }
  reservation.updated_at = clock.iso;
}

function reserve(state: BookState, clock: Clock, order: BookOrder) {
  const kind = order.side === "BUY" ? "CASH" : "SHARES";
  let amount: number;
  if (kind === "SHARES") {
    amount = order.quantity;
    if (availableShares(state, order.symbol, order.id, order.oco_group_id) < amount)
      throw new Error("INSUFFICIENT_QUANTITY");
  } else {
    const value = notional(order.quantity, reservationBasis(order));
    amount = value + deliveryCharges("BUY", value, clock.iso).total_paise;
    if (availableCash(state) < amount) throw new Error("INSUFFICIENT_FUNDS");
  }
  const reservation: Reservation = {
    id: randomUUID(),
    order_id: order.id,
    kind,
    symbol: order.symbol,
    amount,
    status: "ACTIVE",
    created_at: clock.iso,
    updated_at: clock.iso,
  };
  state.reservations.push(reservation);
  recordEvent(state, clock, "RESERVATION_CREATED", "reservation", reservation.id, {
    order_id: order.id,
    kind,
    amount,
  });
}

function upsertProtection(
  state: BookState,
  clock: Clock,
  order: BookOrder,
  quantity: number,
  price: Paise,
) {
  if (order.side !== "BUY") return;
  if (order.stop_loss_paise == null && order.target_paise == null && order.trailing_paise == null)
    return;
  let protection = state.protections.find((p) => p.parent_order_id === order.id);
  if (!protection) {
    protection = {
      id: randomUUID(),
      parent_order_id: order.id,
      symbol: order.symbol,
      company: order.company,
      quantity: 0,
      remaining_quantity: 0,
      stop_paise: order.stop_loss_paise,
      target_paise: order.target_paise,
      trailing_paise: order.trailing_paise,
      peak_paise: price,
      status: "ACTIVE",
      exits: [],
      last_error: null,
      attempts: 0,
      created_at: clock.iso,
      updated_at: clock.iso,
    };
    state.protections.push(protection);
    order.protection_id = protection.id;
    recordEvent(state, clock, "PROTECTION_CREATED", "protection", protection.id, {
      parent_order_id: order.id,
    });
  }
  protection.quantity += quantity;
  protection.remaining_quantity += quantity;
  protection.updated_at = clock.iso;
}

/**
 * Settle up to `maxQuantity` of an order against an observation. Rechecks risk
 * at fill time; the caller decides whether a failure rejects or retries.
 */
export function applyFill(
  state: BookState,
  clock: Clock,
  order: BookOrder,
  observation: QuoteObservation,
): Fill {
  const remaining = order.quantity - order.filled_quantity;
  if (remaining <= 0) throw new Error("ORDER_NOT_OPEN");
  const quote = fillQuote(order.side, observation, state.simulation.slippage_bps);
  const liquidity =
    quote.size == null ? remaining : Math.floor(quote.size * state.simulation.max_participation);
  const quantity = Math.min(remaining, liquidity);
  if (quantity <= 0) throw new Error("NO_LIQUIDITY");
  exposureCheck(state, clock, order, quantity, quote.price);
  const value = notional(quantity, quote.price);
  const charges = deliveryCharges(order.side, value, clock.iso, order.filled_quantity === 0);
  const fillId = randomUUID();
  const observed = Date.parse(observation.provider_time);
  const markedAt = Number.isFinite(observed) ? new Date(observed).toISOString() : clock.iso;
  const holding = state.holdings.find((h) => h.symbol === order.symbol);
  if (order.side === "BUY") {
    if (availableCash(state, order.id) < value + charges.total_paise)
      throw new Error("INSUFFICIENT_FUNDS");
    postLedger(state, clock, "BUY", -value, `BUY ${quantity} ${order.symbol}`, order.id, fillId);
    if (holding) {
      holding.quantity += quantity;
      holding.cost_paise += value;
      holding.mark_paise = observation.price_paise;
      holding.marked_at = markedAt;
      holding.mark_source = observation.provider;
    } else
      state.holdings.push({
        id: randomUUID(),
        symbol: order.symbol,
        company: order.company,
        sector: null,
        quantity,
        cost_paise: value,
        mark_paise: observation.price_paise,
        marked_at: markedAt,
        mark_source: observation.provider,
      });
  } else {
    if (!holding || holding.quantity < quantity) throw new Error("INSUFFICIENT_QUANTITY");
    const cost =
      quantity === holding.quantity
        ? holding.cost_paise
        : Math.round((holding.cost_paise * quantity) / holding.quantity);
    postLedger(state, clock, "SELL", value, `SELL ${quantity} ${order.symbol}`, order.id, fillId);
    holding.quantity -= quantity;
    holding.cost_paise -= cost;
    holding.mark_paise = observation.price_paise;
    holding.marked_at = markedAt;
    state.account.realised_gross_paise += value - cost;
    if (holding.quantity === 0) state.holdings = state.holdings.filter((h) => h !== holding);
  }
  if (charges.total_paise > 0)
    postLedger(
      state,
      clock,
      "CHARGES",
      -charges.total_paise,
      `Charges ${order.side} ${quantity} ${order.symbol}`,
      order.id,
      fillId,
    );
  state.account.charges_paise += charges.total_paise;
  const fill: Fill = {
    settlement_due_at: settlementDue(clock.iso),
    settlement_calendar_version: SETTLEMENT_CALENDAR_VERSION,
    id: fillId,
    order_id: order.id,
    symbol: order.symbol,
    side: order.side,
    quantity,
    price_paise: quote.price,
    reference_price_paise: quote.reference,
    method: quote.method,
    liquidity_limited: quantity < remaining,
    slippage_bps: quote.method === "LAST_TRADE" ? state.simulation.slippage_bps : 0,
    charges,
    charges_debited: true,
    quote: observation,
    created_at: clock.iso,
    seq: nextSeq(state),
  };
  state.fills.push(fill);
  const previous = order.avg_fill_paise == null ? 0 : order.avg_fill_paise * order.filled_quantity;
  order.filled_quantity += quantity;
  order.avg_fill_paise = Math.round((previous + value) / order.filled_quantity);
  order.price_paise = order.avg_fill_paise;
  order.charges_paise += charges.total_paise;
  order.status = order.filled_quantity === order.quantity ? "FILLED" : "PARTIALLY_FILLED";
  order.filled_at = clock.iso;
  order.updated_at = clock.iso;
  order.version += 1;
  order.quote_snapshot = observation;
  syncReservation(state, clock, order);
  upsertProtection(state, clock, order, quantity, quote.price);
  if (order.oco_group_id) {
    for (const sibling of state.orders) {
      if (
        sibling.id !== order.id &&
        sibling.oco_group_id === order.oco_group_id &&
        ["OPEN", "PARTIALLY_FILLED"].includes(sibling.status)
      )
        cancelOrder(state, clock, sibling.id, "OCO_SIBLING_FILLED");
    }
  }
  recordEvent(
    state,
    clock,
    order.status === "FILLED" ? "ORDER_FILLED" : "ORDER_PARTIALLY_FILLED",
    "order",
    order.id,
    {
      fill_id: fillId,
      quantity,
      price_paise: quote.price,
      method: quote.method,
      charges_paise: charges.total_paise,
      symbol: order.symbol,
      side: order.side,
    },
    true,
  );
  return fill;
}

// ---------------------------------------------------------------- commands

export type PlaceInput = {
  intent_id: string;
  symbol: string;
  company: string;
  side: Side;
  order_type: OrderType;
  quantity: number;
  limit_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
  trailing_stop: number | null;
  execution_mode: ExecutionMode;
  parent_order_id?: string | null;
  protection_id?: string | null;
  oco_group_id?: string | null;
};

const SYMBOL = /^[A-Z0-9][A-Z0-9&-]{0,29}$/;
const optionalPrice = (value: unknown) => (value == null ? null : pricePaise(value));

export function conditionMet(order: BookOrder, observation: QuoteObservation) {
  if (order.order_type === "MARKET") return true;
  const trigger = order.limit_price_paise!;
  if (order.order_type === "LIMIT") {
    const { price } = fillQuote(order.side, observation, 0);
    return order.side === "BUY" ? price <= trigger : price >= trigger;
  }
  const last = observation.price_paise;
  return order.side === "BUY" ? last >= trigger : last <= trigger;
}

export function placeOrder(
  state: BookState,
  clock: Clock,
  input: PlaceInput,
  observation: QuoteObservation,
): BookOrder {
  if (typeof input.symbol !== "string" || !SYMBOL.test(input.symbol))
    throw new Error("INVALID_SYMBOL");
  if (observation.symbol !== input.symbol) throw new Error("INVALID_SYMBOL");
  if (input.side !== "BUY" && input.side !== "SELL") throw new Error("INVALID_SIDE");
  if (!["MARKET", "LIMIT", "STOP"].includes(input.order_type))
    throw new Error("INVALID_ORDER_TYPE");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)
    throw new Error("INVALID_QUANTITY");
  const limit = optionalPrice(input.limit_price);
  if ((input.order_type === "MARKET") !== (limit == null)) throw new Error("INVALID_PRICE");
  const stop = optionalPrice(input.stop_loss);
  const target = optionalPrice(input.target_price);
  const trailing =
    input.trailing_stop == null ? null : toPaise(input.trailing_stop, "INVALID_TRAILING_STOP");
  if (trailing != null && trailing <= 0) throw new Error("INVALID_TRAILING_STOP");
  if ((stop != null || target != null || trailing != null) && input.side !== "BUY")
    throw new Error("INVALID_STOP_LOSS");
  const entry = limit ?? observation.price_paise;
  if (stop != null && stop >= entry) throw new Error("INVALID_STOP_LOSS");
  if (target != null && target <= entry) throw new Error("INVALID_TARGET");
  if (input.execution_mode === "LAST_SESSION_PRACTICE" && input.order_type !== "MARKET")
    throw new Error("INVALID_ORDER_TYPE");
  const expiry = dayOrderExpiry(clock.now);
  const order: BookOrder = {
    id: randomUUID(),
    intent_id: input.intent_id,
    symbol: input.symbol,
    company: (input.company || input.symbol).slice(0, 120),
    side: input.side,
    order_type: input.order_type,
    quantity: input.quantity,
    filled_quantity: 0,
    limit_price_paise: limit,
    price_paise: observation.price_paise,
    avg_fill_paise: null,
    charges_paise: 0,
    estimated_charges_paise: deliveryCharges(input.side, notional(input.quantity, entry), clock.iso)
      .total_paise,
    product: "DELIVERY",
    validity: "DAY",
    status: "OPEN",
    status_reason: null,
    stop_loss_paise: stop,
    target_paise: target,
    trailing_paise: trailing,
    parent_order_id: input.parent_order_id ?? null,
    protection_id: input.protection_id ?? null,
    oco_group_id: input.oco_group_id ?? null,
    execution_mode: input.execution_mode,
    quote_snapshot: observation,
    created_at: clock.iso,
    updated_at: clock.iso,
    filled_at: null,
    expires_at: expiry == null ? null : new Date(expiry).toISOString(),
    version: 1,
  };
  markHolding(state, observation);
  // Validate exposure with the entry price before anything is recorded.
  exposureCheck(state, clock, order, order.quantity, entry);
  state.orders.push(order);
  recordEvent(state, clock, "ORDER_ACCEPTED", "order", order.id, {
    intent_id: order.intent_id,
    symbol: order.symbol,
    side: order.side,
    order_type: order.order_type,
    quantity: order.quantity,
    limit_price_paise: limit,
    execution_mode: order.execution_mode,
    quote_provider_time: observation.provider_time,
  });
  if (order.order_type === "MARKET") {
    applyFill(state, clock, order, observation);
    if (order.status === "PARTIALLY_FILLED") {
      // Market intents are immediate-or-cancel against the observed liquidity.
      order.status = "CANCELLED";
      order.status_reason = "REMAINDER_CANCELLED_LIQUIDITY";
      order.version += 1;
      recordEvent(
        state,
        clock,
        "ORDER_REMAINDER_CANCELLED",
        "order",
        order.id,
        {
          filled_quantity: order.filled_quantity,
        },
        true,
      );
    }
    return order;
  }
  reserve(state, clock, order);
  // A marketable limit fills immediately at the observed price.
  if (
    input.execution_mode === "LIVE" &&
    order.order_type === "LIMIT" &&
    conditionMet(order, observation)
  )
    applyFill(state, clock, order, observation);
  return order;
}

export function findOrder(state: BookState, id: unknown) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  return order;
}

function assertOpen(order: BookOrder, clock: Clock) {
  if (order.status === "EXPIRED") throw new Error("ORDER_EXPIRED");
  if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED")
    throw new Error("ORDER_NOT_OPEN");
  if (order.expires_at && clock.now >= Date.parse(order.expires_at))
    throw new Error("ORDER_EXPIRED");
}

export function cancelOrder(state: BookState, clock: Clock, id: unknown, reason = "USER_REQUEST") {
  const order = findOrder(state, id);
  assertOpen(order, clock);
  order.status = "CANCELLED";
  order.status_reason = reason;
  order.updated_at = clock.iso;
  order.version += 1;
  syncReservation(state, clock, order);
  recordEvent(
    state,
    clock,
    "ORDER_CANCELLED",
    "order",
    order.id,
    { reason },
    reason !== "USER_REQUEST",
  );
  if (reason === "USER_REQUEST" && order.oco_group_id) {
    for (const sibling of state.orders) {
      if (
        sibling.id !== order.id &&
        sibling.oco_group_id === order.oco_group_id &&
        ["OPEN", "PARTIALLY_FILLED"].includes(sibling.status)
      )
        cancelOrder(state, clock, sibling.id, "OCO_GROUP_CANCELLED");
    }
  }
  return order;
}

/** Atomic standalone-order amendment; optimistic versioning rejects stale edits. */
export function amendOrder(
  state: BookState,
  clock: Clock,
  id: unknown,
  quantity: number,
  limitPrice: number,
  expectedVersion: number,
  observation: QuoteObservation,
) {
  const order = findOrder(state, id);
  assertOpen(order, clock);
  if (order.version !== expectedVersion) throw new Error("ORDER_VERSION_CONFLICT");
  if (order.order_type === "MARKET" || order.oco_group_id)
    throw new Error("ORDER_AMEND_UNSUPPORTED");
  if (observation.symbol !== order.symbol) throw new Error("INVALID_SYMBOL");
  if (!Number.isSafeInteger(quantity) || quantity <= order.filled_quantity)
    throw new Error("INVALID_QUANTITY");
  const price = pricePaise(limitPrice);
  if (order.stop_loss_paise != null && order.stop_loss_paise >= price)
    throw new Error("INVALID_STOP_LOSS");
  if (order.target_paise != null && order.target_paise <= price) throw new Error("INVALID_TARGET");
  const remaining = quantity - order.filled_quantity;
  exposureCheck(state, clock, order, remaining, price);
  const previous = {
    quantity: order.quantity,
    limit_price_paise: order.limit_price_paise,
    version: order.version,
  };
  order.quantity = quantity;
  order.limit_price_paise = price;
  const value = notional(remaining, reservationBasis(order));
  const charges = deliveryCharges(order.side, value, clock.iso).total_paise;
  if (order.side === "BUY" && availableCash(state, order.id) < value + charges)
    throw new Error("INSUFFICIENT_FUNDS");
  order.estimated_charges_paise = order.charges_paise + charges;
  order.updated_at = clock.iso;
  order.version++;
  syncReservation(state, clock, order);
  recordEvent(
    state,
    clock,
    "ORDER_AMENDED",
    "order",
    order.id,
    { previous, quantity, limit_price_paise: price },
    true,
  );
  if (conditionMet(order, observation)) applyFill(state, clock, order, observation);
  return order;
}

/** Independent resting stop/target orders for existing delivery holdings. */
export function placeOco(
  state: BookState,
  clock: Clock,
  input: {
    intent_id: string;
    symbol: string;
    company: string;
    quantity: number;
    stop: number;
    target: number;
  },
  observation: QuoteObservation,
) {
  const stop = pricePaise(input.stop);
  const target = pricePaise(input.target);
  if (stop >= observation.price_paise) throw new Error("INVALID_STOP_LOSS");
  if (target <= Math.max(observation.price_paise, observation.bid_paise ?? 0))
    throw new Error("INVALID_TARGET");
  const group = randomUUID();
  const base: PlaceInput = {
    intent_id: `oco:${group}:stop`,
    symbol: input.symbol,
    company: input.company,
    quantity: input.quantity,
    side: "SELL",
    order_type: "STOP",
    limit_price: input.stop,
    stop_loss: null,
    target_price: null,
    trailing_stop: null,
    execution_mode: "LIVE",
    oco_group_id: group,
  };
  const first = placeOrder(state, clock, base, observation);
  const second = placeOrder(
    state,
    clock,
    {
      ...base,
      intent_id: `oco:${group}:target`,
      order_type: "LIMIT",
      limit_price: input.target,
    },
    observation,
  );
  recordEvent(
    state,
    clock,
    "OCO_CREATED",
    "oco",
    group,
    {
      intent_id: input.intent_id,
      order_ids: [first.id, second.id],
      quantity: input.quantity,
      symbol: input.symbol,
    },
    true,
  );
  return [first, second];
}

/** Explicit fill request (from the UI) or worker evaluation of a resting order. */
export function fillRestingOrder(
  state: BookState,
  clock: Clock,
  id: unknown,
  observation: QuoteObservation,
) {
  const order = findOrder(state, id);
  assertOpen(order, clock);
  if (observation.symbol !== order.symbol) throw new Error("INVALID_SYMBOL");
  if (!conditionMet(order, observation)) throw new Error("PRICE_CONDITION_NOT_MET");
  applyFill(state, clock, order, observation);
  return order;
}

/** Reject a resting order whose fill-time risk check failed, releasing its reservation. */
export function rejectOrder(state: BookState, clock: Clock, order: BookOrder, reason: string) {
  order.status = order.filled_quantity > 0 ? "CANCELLED" : "REJECTED";
  order.status_reason = reason;
  order.updated_at = clock.iso;
  order.version += 1;
  syncReservation(state, clock, order);
  recordEvent(state, clock, "ORDER_REJECTED_AT_FILL", "order", order.id, { reason }, true);
}

export function expireOrders(state: BookState, clock: Clock): number {
  let count = 0;
  for (const order of state.orders) {
    if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED") continue;
    if (order.validity !== "DAY") continue;
    order.expires_at ??= (() => {
      const expiry = dayOrderExpiry(Date.parse(order.created_at));
      return expiry == null ? null : new Date(expiry).toISOString();
    })();
    if (!order.expires_at || clock.now < Date.parse(order.expires_at)) continue;
    order.status = "EXPIRED";
    order.status_reason = "SESSION_CLOSE";
    order.updated_at = clock.iso;
    order.version += 1;
    syncReservation(state, clock, order);
    recordEvent(
      state,
      clock,
      "ORDER_EXPIRED",
      "order",
      order.id,
      {
        expires_at: order.expires_at,
        filled_quantity: order.filled_quantity,
      },
      true,
    );
    count++;
  }
  return count;
}

/** Idempotent settlement notifications; the ledger is already booked at fill. */
export function settleCompletedFills(state: BookState, clock: Clock) {
  const completed = new Set(
    state.events
      .filter((event) => event.type === "SETTLEMENT_COMPLETED")
      .map((event) => event.entity_id),
  );
  for (const fill of state.fills) {
    const due = fillSettlementDue(fill);
    if (
      !due ||
      !Number.isFinite(Date.parse(due)) ||
      Date.parse(due) > clock.now ||
      completed.has(fill.id)
    )
      continue;
    recordEvent(
      state,
      clock,
      "SETTLEMENT_COMPLETED",
      "fill",
      fill.id,
      {
        order_id: fill.order_id,
        symbol: fill.symbol,
        quantity: fill.quantity,
        settlement_due_at: due,
        calendar_version: fill.settlement_calendar_version ?? SETTLEMENT_CALENDAR_VERSION,
      },
      true,
    );
    completed.add(fill.id);
  }
}

export function fundWallet(
  state: BookState,
  clock: Clock,
  amount: Paise,
  kind: "DEPOSIT" | "WITHDRAW",
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");
  const delta = kind === "WITHDRAW" ? -amount : amount;
  if (kind === "WITHDRAW" && availableCash(state) < amount) throw new Error("INSUFFICIENT_FUNDS");
  if (kind === "WITHDRAW") {
    const settlement = settlementBalances(state, clock.now);
    if (
      settlement.unverified_fills ||
      amount > Math.max(0, availableCash(state) - settlement.pending_sale_proceeds_paise)
    )
      throw new Error("SETTLEMENT_PENDING");
  }
  const day = ensureRiskDay(state, clock);
  postLedger(state, clock, kind, delta, `Local paper ${kind.toLowerCase()}`);
  state.account.net_deposits_paise += delta;
  day.flows_paise += delta;
  state.account.onboarded = true;
  recordEvent(state, clock, `WALLET_${kind}`, "account", state.account.user_id, {
    amount_paise: delta,
  });
}

// ---------------------------------------------------------------- worker evaluation

export function protectionTrigger(protection: Protection, price: Paise) {
  if (protection.target_paise != null && price >= protection.target_paise) return "TARGET";
  if (protection.stop_paise != null && price <= protection.stop_paise) return "STOP";
  if (
    protection.trailing_paise != null &&
    price <= protection.peak_paise - protection.trailing_paise
  )
    return "TRAIL";
  return null;
}

/**
 * Evaluate one protection against an eligible live observation. Peaks and
 * trigger evidence are persisted; exits use a deterministic intent per attempt.
 */
export function evaluateProtection(
  state: BookState,
  clock: Clock,
  protection: Protection,
  observation: QuoteObservation,
): BookOrder | null {
  if (protection.status !== "ACTIVE") return null;
  const price = observation.price_paise;
  if (price > protection.peak_paise) {
    protection.peak_paise = price;
    protection.updated_at = clock.iso;
  }
  const reason = protectionTrigger(protection, price);
  if (!reason) return null;
  const quantity = Math.min(
    protection.remaining_quantity,
    availableShares(state, protection.symbol),
  );
  if (quantity <= 0) {
    protection.status = "COMPLETED";
    protection.last_error = "NO_REMAINING_HOLDING";
    protection.updated_at = clock.iso;
    recordEvent(
      state,
      clock,
      "PROTECTION_CLOSED",
      "protection",
      protection.id,
      {
        reason: "NO_REMAINING_HOLDING",
      },
      true,
    );
    return null;
  }
  const intent = `protection:${protection.id}:${protection.exits.length + 1}`;
  const exit = placeOrder(
    state,
    clock,
    {
      intent_id: intent,
      symbol: protection.symbol,
      company: protection.company,
      side: "SELL",
      order_type: "MARKET",
      quantity,
      limit_price: null,
      stop_loss: null,
      target_price: null,
      trailing_stop: null,
      execution_mode: "LIVE",
      parent_order_id: protection.parent_order_id,
      protection_id: protection.id,
    },
    observation,
  );
  protection.exits.push(exit.id);
  protection.remaining_quantity -= exit.filled_quantity;
  protection.last_error = null;
  protection.updated_at = clock.iso;
  if (protection.remaining_quantity <= 0) protection.status = "COMPLETED";
  recordEvent(
    state,
    clock,
    "PROTECTION_TRIGGERED",
    "protection",
    protection.id,
    {
      reason,
      trigger_price_paise: price,
      peak_paise: protection.peak_paise,
      exit_order_id: exit.id,
      exit_quantity: exit.filled_quantity,
      quote_provider_time: observation.provider_time,
    },
    true,
  );
  return exit;
}

export function alertHit(type: unknown, threshold: unknown, observation: QuoteObservation) {
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) return false;
  const price = observation.price_paise / 100;
  if (type === "PRICE_ABOVE") return price >= threshold;
  if (type === "PRICE_BELOW") return price <= threshold;
  if (type === "MOVE_PERCENT")
    return observation.change_pct != null && Math.abs(observation.change_pct) >= threshold;
  return false;
}

export function evaluateAlerts(state: BookState, clock: Clock, observation: QuoteObservation) {
  let fired = 0;
  for (const alert of state.price_alerts) {
    if (
      alert["symbol"] !== observation.symbol ||
      alert["enabled"] !== true ||
      alert["triggered_at"]
    )
      continue;
    if (!alertHit(alert["alert_type"], alert["threshold"], observation)) continue;
    alert["triggered_at"] = clock.iso;
    alert["updated_at"] = clock.iso;
    const delivery = {
      id: randomUUID(),
      alert_id: alert["id"],
      symbol: observation.symbol,
      alert_type: alert["alert_type"],
      threshold: alert["threshold"],
      price: observation.price_paise / 100,
      change_pct: observation.change_pct,
      quote_provider_time: observation.provider_time,
      triggered_at: clock.iso,
    };
    state.alert_events.push(delivery);
    recordEvent(
      state,
      clock,
      "ALERT_TRIGGERED",
      "price_alert",
      String(alert["id"]),
      delivery,
      true,
    );
    fired++;
  }
  return fired;
}

export function cancelProtection(state: BookState, clock: Clock, id: unknown) {
  const protection = state.protections.find((p) => p.id === id);
  if (!protection) throw new Error("PROTECTION_NOT_FOUND");
  if (protection.status !== "ACTIVE") throw new Error("PROTECTION_NOT_ACTIVE");
  protection.status = "CANCELLED";
  protection.updated_at = clock.iso;
  recordEvent(state, clock, "PROTECTION_CANCELLED", "protection", protection.id, {});
  return protection;
}

/** Exact reconciliation of cash, positions and the ledger. Returns problems found. */
export function reconcile(state: BookState): string[] {
  const problems: string[] = [];
  const ledgerCash = state.ledger.reduce((t, e) => t + e.amount_paise, 0);
  if (ledgerCash !== state.account.cash_paise)
    problems.push(`cash ${state.account.cash_paise} != ledger ${ledgerCash}`);
  const last = state.ledger.at(-1);
  if (last && last.balance_after_paise !== state.account.cash_paise)
    problems.push("last ledger balance differs from cash");
  if (state.account.cash_paise < 0) problems.push("negative cash");
  const charges = state.ledger
    .filter((e) => e.kind === "CHARGES")
    .reduce((t, e) => t - e.amount_paise, 0);
  if (charges !== state.account.charges_paise) problems.push("charges do not reconcile");
  const deposits = state.ledger
    .filter((e) => e.kind === "DEPOSIT" || e.kind === "WITHDRAW")
    .reduce((t, e) => t + e.amount_paise, 0);
  if (deposits !== state.account.net_deposits_paise) problems.push("deposits do not reconcile");
  const positions = new Map<string, number>();
  for (const fill of state.fills)
    positions.set(
      fill.symbol,
      (positions.get(fill.symbol) ?? 0) + (fill.side === "BUY" ? fill.quantity : -fill.quantity),
    );
  for (const [symbol, quantity] of positions) {
    const held = state.holdings.find((h) => h.symbol === symbol)?.quantity ?? 0;
    if (held !== quantity) problems.push(`${symbol} holding ${held} != fills ${quantity}`);
  }
  for (const holding of state.holdings) {
    if (!positions.has(holding.symbol)) problems.push(`${holding.symbol} holding has no fills`);
    if (holding.quantity <= 0 || holding.cost_paise < 0) problems.push(`${holding.symbol} invalid`);
  }
  for (const symbol of new Set(state.holdings.map((h) => h.symbol)))
    if (availableShares(state, symbol) < 0) problems.push(`${symbol} over-reserved`);
  if (availableCash(state) < 0) problems.push("cash over-reserved");
  const seqs = [
    ...state.events.map((e) => e.seq),
    ...state.ledger.map((e) => e.seq),
    ...state.fills.map((f) => f.seq),
  ];
  if (new Set(seqs).size !== seqs.length || seqs.some((s) => s > state.seq))
    problems.push("event sequence is not unique and monotonic");
  for (const order of state.orders) {
    const filled = state.fills
      .filter((f) => f.order_id === order.id)
      .reduce((t, f) => t + f.quantity, 0);
    if (filled !== order.filled_quantity)
      problems.push(`order ${order.id} fills ${filled} != ${order.filled_quantity}`);
  }
  return problems;
}
