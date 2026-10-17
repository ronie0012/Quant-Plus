import type { ChargeBreakdown } from "../paper-fees.ts";
import type { Paise } from "../money.ts";

export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderStatus =
  "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";
export type ExecutionMode = "LIVE" | "LAST_SESSION_PRACTICE";

/** Canonical record of the observation used for a decision. */
export type QuoteObservation = {
  symbol: string;
  price_paise: Paise;
  bid_paise: Paise | null;
  ask_paise: Paise | null;
  bid_size: number | null;
  ask_size: number | null;
  provider: string;
  provider_time: string;
  received_at: string;
  decision_at: string;
  market_session: string;
  delayed: boolean;
  stale: boolean;
  change_pct: number | null;
};

export type BookOrder = {
  id: string;
  intent_id: string;
  symbol: string;
  company: string;
  side: Side;
  order_type: OrderType;
  quantity: number;
  filled_quantity: number;
  limit_price_paise: Paise | null;
  /** Average fill price; the placement quote price while nothing has filled. */
  price_paise: Paise;
  avg_fill_paise: Paise | null;
  charges_paise: Paise;
  estimated_charges_paise: Paise;
  product: "DELIVERY";
  validity: "DAY";
  status: OrderStatus;
  status_reason: string | null;
  stop_loss_paise: Paise | null;
  target_paise: Paise | null;
  trailing_paise: Paise | null;
  parent_order_id: string | null;
  protection_id: string | null;
  /** Two resting SELL legs share one reservation; the first fill cancels its sibling. */
  oco_group_id?: string | null;
  execution_mode: ExecutionMode;
  quote_snapshot: QuoteObservation | Record<string, unknown>;
  created_at: string;
  updated_at: string;
  filled_at: string | null;
  expires_at: string | null;
  version: number;
};

export type Fill = {
  settlement_due_at?: string | null;
  settlement_calendar_version?: string;
  id: string;
  order_id: string;
  symbol: string;
  side: Side;
  quantity: number;
  price_paise: Paise;
  reference_price_paise: Paise;
  method: "QUOTE_BID_ASK" | "LAST_TRADE" | "LEGACY_V1";
  liquidity_limited: boolean;
  slippage_bps: number;
  charges: ChargeBreakdown | null;
  charges_debited: boolean;
  quote: QuoteObservation | Record<string, unknown>;
  created_at: string;
  seq: number;
};

export type Holding = {
  id: string;
  symbol: string;
  company: string;
  sector: string | null;
  quantity: number;
  /** Total purchase value of the remaining quantity, excluding charges. */
  cost_paise: Paise;
  mark_paise: Paise;
  marked_at: string;
  mark_source: string;
};

export type Reservation = {
  id: string;
  order_id: string;
  kind: "CASH" | "SHARES";
  symbol: string;
  amount: number;
  status: "ACTIVE" | "RELEASED" | "CONSUMED";
  created_at: string;
  updated_at: string;
};

export type Protection = {
  id: string;
  parent_order_id: string;
  symbol: string;
  company: string;
  quantity: number;
  remaining_quantity: number;
  stop_paise: Paise | null;
  target_paise: Paise | null;
  trailing_paise: Paise | null;
  peak_paise: Paise;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  exits: string[];
  last_error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

export type LedgerEntry = {
  id: string;
  seq: number;
  kind: "DEPOSIT" | "WITHDRAW" | "BUY" | "SELL" | "CHARGES" | "MIGRATION_ADJUSTMENT";
  amount_paise: Paise;
  balance_after_paise: Paise;
  order_id: string | null;
  fill_id: string | null;
  note: string;
  created_at: string;
};

export type BookEvent = {
  seq: number;
  type: string;
  entity: string;
  entity_id: string;
  at: string;
  notify: boolean;
  data: Record<string, unknown>;
};

export type RiskLimits = {
  user_id: string;
  daily_loss_limit_paise: Paise;
  max_order_value_paise: Paise;
  max_position_pct: number;
  confirmation_above_paise: Paise;
  trading_paused: boolean;
  updated_at: string;
};

export type RiskDay = {
  date: string;
  anchor_equity_paise: Paise;
  flows_paise: Paise;
  /** PRIOR_CLOSE_MARKS: anchored by the worker before the session from closing marks. */
  anchor_source: "PRIOR_CLOSE_MARKS" | "FIRST_MUTATION" | "MIGRATED";
  anchored_at: string;
};

export type Row = Record<string, unknown>;

export type Quarantined = {
  table: string;
  row: unknown;
  reason: string;
  quarantined_at: string;
};

export type BookState = {
  version: 2;
  created_at: string;
  migrated_from: { version: 1; sha256: string; migrated_at: string } | null;
  seq: number;
  account: {
    user_id: string;
    currency: "INR";
    cash_paise: Paise;
    net_deposits_paise: Paise;
    realised_gross_paise: Paise;
    charges_paise: Paise;
    onboarded: boolean;
    updated_at: string;
  };
  holdings: Holding[];
  orders: BookOrder[];
  fills: Fill[];
  reservations: Reservation[];
  protections: Protection[];
  ledger: LedgerEntry[];
  events: BookEvent[];
  intents: Record<string, { fingerprint: string; response: unknown; at: string }>;
  risk_limits: RiskLimits;
  risk_day: RiskDay | null;
  simulation: { slippage_bps: number; max_participation: number };
  worker: { owner: string | null; lease_until: string | null; heartbeat_at: string | null };
  watchlist_items: Row[];
  trading_preferences: Row[];
  price_alerts: Row[];
  alert_events: Row[];
  trade_journal: Row[];
  conversations: Row[];
  /** Versioned research memos, claim comments, strategy studies and bundles. Optional for older books. */
  research_items?: Row[];
  quarantine: Quarantined[];
  /** Copilot requests counted per IST day for the configured spending ceiling. */
  ai_usage?: { date: string; requests: number };
};

export type Clock = { now: number; iso: string };
export const clockAt = (now = Date.now()): Clock => ({ now, iso: new Date(now).toISOString() });
