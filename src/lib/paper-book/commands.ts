/**
 * Book commands shared by every storage provider. Each function operates on an
 * in-memory BookState inside a provider transaction; a thrown error aborts the
 * transaction so nothing is persisted.
 */
import { randomUUID } from "node:crypto";
import { validateLocalValues } from "../local-schemas.ts";
import { toPaise } from "../money.ts";
import {
  amendOrder,
  cancelOrder,
  cancelProtection,
  ensureRiskDay,
  expireOrders,
  fillRestingOrder,
  findOrder,
  fundWallet,
  observationFromQuote,
  placeOrder,
  placeOco,
  recordEvent,
  settleCompletedFills,
  type PlaceInput,
} from "./engine.ts";
import type { BookState, Clock, Row } from "./types.ts";
import {
  deleteConversation,
  getConversation,
  listConversations,
  recordAiUsage,
  saveConversation,
} from "./conversations.ts";
import {
  accountView,
  bookReport,
  eventView,
  fillView,
  holdingView,
  ledgerView,
  orderView,
  protectionView,
  riskLimitsView,
  riskStatusView,
} from "./views.ts";

export type BookId = "main" | "practice";

// ---------------------------------------------------------------- idempotency

const INTENT = /^[A-Za-z0-9:_-]{8,160}$/;
function replay(state: BookState, key: unknown, fingerprint: string): unknown {
  if (typeof key !== "string" || !INTENT.test(key)) throw new Error("INVALID_INTENT_ID");
  const prior = state.intents[key];
  if (prior && prior.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
  return prior?.response;
}
function remember(
  state: BookState,
  clock: Clock,
  key: string,
  fingerprint: string,
  response: unknown,
) {
  state.intents[key] = { fingerprint, response: structuredClone(response), at: clock.iso };
}
function orderFingerprint(input: Record<string, unknown>) {
  return JSON.stringify([
    input["p_symbol"],
    input["p_company"],
    input["p_side"],
    input["p_type"],
    input["p_qty"],
    input["p_limit"] ?? null,
    input["p_product"],
    input["p_validity"],
    input["p_stop_loss"] ?? null,
    input["p_target"] ?? null,
    input["p_trailing"] ?? null,
    input["p_execution_mode"] ?? "LIVE",
  ]);
}

export function bookFor(input: Record<string, unknown>): BookId {
  return input["p_execution_mode"] === "LAST_SESSION_PRACTICE" || input["p_book"] === "practice"
    ? "practice"
    : "main";
}

export function replayIntent(state: BookState, input: Record<string, unknown>) {
  return replay(state, input["p_intent_id"], orderFingerprint(input));
}

export function maintain(state: BookState, clock: Clock) {
  expireOrders(state, clock);
  settleCompletedFills(state, clock);
  ensureRiskDay(state, clock);
}

function quoteFor(input: Record<string, unknown>, clock: Clock) {
  const quote = input["p_quote"];
  if (!quote || typeof quote !== "object") throw new Error("QUOTE_REQUIRED");
  return observationFromQuote(quote as Record<string, unknown>, clock);
}

export function paperCommand(
  state: BookState,
  clock: Clock,
  name: string,
  input: Record<string, unknown>,
) {
  maintain(state, clock);
  if (name === "amend_server_open_order" || name === "place_server_oco") {
    const key = input["p_intent_id"];
    const fingerprint = JSON.stringify(
      name === "place_server_oco"
        ? [
            name,
            input["p_symbol"],
            input["p_company"],
            input["p_qty"],
            input["p_stop"],
            input["p_target"],
          ]
        : [name, input["p_order_id"], input["p_qty"], input["p_limit"], input["p_version"]],
    );
    const prior = replay(state, key, fingerprint);
    if (prior) return prior;
    const observed = quoteFor(input, clock);
    const result =
      name === "place_server_oco"
        ? placeOco(
            state,
            clock,
            {
              intent_id: key as string,
              symbol: input["p_symbol"] as string,
              company: input["p_company"] as string,
              quantity: input["p_qty"] as number,
              stop: input["p_stop"] as number,
              target: input["p_target"] as number,
            },
            observed,
          ).map(orderView)
        : orderView(
            amendOrder(
              state,
              clock,
              input["p_order_id"],
              input["p_qty"] as number,
              input["p_limit"] as number,
              input["p_version"] as number,
              observed,
            ),
          );
    remember(state, clock, key as string, fingerprint, result);
    return result;
  }
  if (name === "place_server_advanced_order") {
    const key = input["p_intent_id"];
    const fingerprint = orderFingerprint(input);
    const prior = replay(state, key, fingerprint);
    if (prior) return prior as ReturnType<typeof orderView>;
    if (input["p_product"] !== "DELIVERY") throw new Error("INVALID_PRODUCT");
    if (input["p_validity"] !== "DAY") throw new Error("INVALID_VALIDITY");
    const order = placeOrder(
      state,
      clock,
      {
        intent_id: key as string,
        symbol: String(input["p_symbol"]),
        company: String(input["p_company"] ?? input["p_symbol"]),
        side: input["p_side"] as PlaceInput["side"],
        order_type: input["p_type"] as PlaceInput["order_type"],
        quantity: input["p_qty"] as number,
        limit_price: (input["p_limit"] ?? null) as number | null,
        stop_loss: (input["p_stop_loss"] ?? null) as number | null,
        target_price: (input["p_target"] ?? null) as number | null,
        trailing_stop: (input["p_trailing"] ?? null) as number | null,
        execution_mode:
          input["p_execution_mode"] === "LAST_SESSION_PRACTICE" ? "LAST_SESSION_PRACTICE" : "LIVE",
      },
      quoteFor(input, clock),
    );
    const view = orderView(order);
    remember(state, clock, key as string, fingerprint, view);
    return view;
  }
  if (name === "cancel_server_open_order")
    return orderView(cancelOrder(state, clock, input["p_order_id"]));
  if (name === "fill_server_open_order")
    return orderView(fillRestingOrder(state, clock, input["p_order_id"], quoteFor(input, clock)));
  throw new Error("Invalid paper action");
}

export function orderById(state: BookState, id: string) {
  return orderView(findOrder(state, id));
}

// ---------------------------------------------------------------- reads and editable tables

const READ_ONLY_TABLES = new Set([
  "accounts",
  "holdings",
  "orders",
  "wallet_transactions",
  "fills",
  "protections",
  "reservations",
  "alert_events",
  "events",
]);
const EDITABLE = new Set([
  "watchlist_items",
  "trading_preferences",
  "price_alerts",
  "trade_journal",
  "risk_limits",
  "research_items",
]);

function tableRows(state: BookState, table: string, clock: Clock): Row[] {
  switch (table) {
    case "accounts":
      return [{ user_id: state.account.user_id, ...accountView(state) }];
    case "holdings":
      return state.holdings.map((h) => holdingView(state, h, clock.now));
    case "orders":
      return state.orders.map(orderView);
    case "wallet_transactions":
      return state.ledger.map(ledgerView);
    case "fills":
      return state.fills.map(fillView);
    case "protections":
      return state.protections.map(protectionView);
    case "reservations":
      return state.reservations.map((r) => ({
        ...r,
        amount: r.kind === "CASH" ? r.amount / 100 : r.amount,
      }));
    case "alert_events":
      return state.alert_events;
    case "events":
      return state.events.map(eventView);
    case "risk_limits":
      return [riskLimitsView(state)];
    case "watchlist_items":
    case "trading_preferences":
    case "price_alerts":
    case "trade_journal":
      return state[table];
    case "research_items":
      return state.research_items ?? [];
    default:
      throw new Error("Unsupported local table");
  }
}

type Filter = [string, unknown] | [string, unknown, string];
function matches(row: Row, filters: Filter[]) {
  return filters.every(([field, value, op = "eq"]) => {
    const actual = row[field];
    if (op === "eq") return actual === value;
    if (op === "in") return Array.isArray(value) && value.includes(actual);
    if (op === "ilike")
      return (
        typeof actual === "string" &&
        typeof value === "string" &&
        actual.toLowerCase().includes(value.toLowerCase())
      );
    if (op === "gte") return String(actual ?? "") >= String(value);
    if (op === "lte") return String(actual ?? "") <= String(value);
    throw new Error("Invalid filters");
  });
}

function readFilters(input: Record<string, unknown>): Filter[] {
  const filters = input["filters"] ?? [];
  if (
    !Array.isArray(filters) ||
    filters.some(
      (f) =>
        !Array.isArray(f) ||
        (f.length !== 2 && f.length !== 3) ||
        typeof f[0] !== "string" ||
        (f.length === 3 && !["eq", "in", "ilike", "gte", "lte"].includes(f[2])),
    )
  )
    throw new Error("Invalid filters");
  return filters as Filter[];
}

function shape(rows: Row[], input: Record<string, unknown>) {
  const sorting = input["sorting"] as { field: string; ascending: boolean } | undefined;
  if (sorting)
    rows = [...rows].sort((a, b) => {
      const left = a[sorting.field];
      const right = b[sorting.field];
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left ?? "").localeCompare(String(right ?? ""));
      return order * (sorting.ascending ? 1 : -1);
    });
  const total = rows.length;
  const offset = Math.max(0, Math.floor(Number(input["offset"] ?? 0)) || 0);
  const limit = input["limit"] == null ? 1000 : Math.max(0, Math.min(Number(input["limit"]), 1000));
  rows = rows.slice(offset, offset + limit);
  if (input["count"]) return { rows, total, offset, limit };
  return input["singular"] ? (rows[0] ?? null) : rows;
}

function editTable(state: BookState, clock: Clock, input: Record<string, unknown>) {
  const table = String(input["table"]);
  const operation = String(input["operation"]);
  if (!EDITABLE.has(table))
    throw new Error("Use the paper execution or wallet endpoint to change trading balances");
  const filters = readFilters(input);
  if (table === "risk_limits") {
    if (operation !== "upsert" && operation !== "update")
      throw new Error("Risk limits must be updated, not removed or duplicated");
    const values = input["values"] as Row;
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new Error("Invalid values");
    const parsed = validateLocalValues(table, values, false) as Record<string, unknown>;
    const limits = state.risk_limits;
    const money = (
      field: string,
      target: "daily_loss_limit_paise" | "max_order_value_paise" | "confirmation_above_paise",
    ) => {
      if (parsed[field] !== undefined)
        limits[target] = toPaise(parsed[field], "RISK_LIMITS_INVALID");
    };
    money("daily_loss_limit", "daily_loss_limit_paise");
    money("max_order_value", "max_order_value_paise");
    money("confirmation_above", "confirmation_above_paise");
    if (parsed["max_position_pct"] !== undefined)
      limits.max_position_pct = Number(parsed["max_position_pct"]);
    if (parsed["trading_paused"] !== undefined)
      limits.trading_paused = parsed["trading_paused"] === true;
    limits.updated_at = clock.iso;
    recordEvent(state, clock, "RISK_LIMITS_UPDATED", "risk_limits", limits.user_id, parsed);
    return [riskLimitsView(state)];
  }
  if (table === "research_items") state.research_items ??= [];
  const rows = state[table as "watchlist_items"];
  let selected = rows.filter((row) => matches(row, filters));
  if (operation === "delete") {
    state[table as "watchlist_items"] = rows.filter((row) => !matches(row, filters));
    return selected;
  }
  const values = input["values"] as Row;
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Invalid values");
  const insert = operation === "insert" || (operation === "upsert" && !selected.length);
  const parsed = validateLocalValues(table, values, insert) as Row;
  if (operation === "update" || (operation === "upsert" && selected.length)) {
    if (table === "trade_journal" && "decision_snapshot" in parsed)
      throw new Error("DECISION_SNAPSHOT_IMMUTABLE");
    selected.forEach((row) => {
      const values: Row = { ...parsed };
      if (table === "trade_journal" && "plan" in values)
        values["plan"] = revisePlan(
          row["plan"] as Row | null | undefined,
          values["plan"] as Row | null,
          clock,
        );
      if (table === "research_items") {
        // Every update keeps the prior version so research stays reproducible.
        const history = Array.isArray(row["history"]) ? (row["history"] as Row[]) : [];
        values["history"] = [
          ...history,
          {
            version: row["version"],
            title: row["title"],
            status: row["status"],
            body: row["body"],
            updated_at: row["updated_at"],
          },
        ].slice(-50);
        values["version"] = Number(row["version"] ?? 1) + 1;
      }
      Object.assign(row, values, {
        id: row["id"],
        user_id: state.account.user_id,
        updated_at: clock.iso,
      });
    });
    return selected;
  }
  if (!insert) throw new Error("Unsupported local operation");
  const defaults: Row =
    table === "trade_journal"
      ? {
          order_id: null,
          thesis: "",
          evidence: [],
          risks: [],
          invalidation: "",
          planned_exit: "",
          reflection: "",
          outcome: "OPEN",
        }
      : table === "price_alerts"
        ? { triggered_at: null, enabled: true, note: "", threshold: null }
        : table === "research_items"
          ? { ref: null, status: "DRAFT", body: {}, version: 1, history: [] }
          : {};
  if (table === "trade_journal" && parsed["plan"])
    parsed["plan"] = { ...(parsed["plan"] as Row), revisions: [] };
  const row = {
    ...defaults,
    ...parsed,
    id: randomUUID(),
    user_id: state.account.user_id,
    created_at: clock.iso,
    updated_at: clock.iso,
  };
  rows.push(row);
  selected = [row];
  return selected;
}

const REVISED_PLAN_FIELDS = [
  "entry",
  "stop",
  "target",
  "time_exit",
  "holding_period_days",
  "quantity",
] as const;

/**
 * Merge a plan edit. The market snapshot and compiled risk preview are frozen
 * once recorded, evidence availability times cannot be moved, and every change
 * to a risk level is appended to a server-owned revision list.
 */
function revisePlan(previous: Row | null | undefined, next: Row | null, clock: Clock): Row | null {
  if (!previous) return next ? { ...next, revisions: [] } : null;
  if (!next) throw new Error("DECISION_PLAN_IMMUTABLE");
  const frozen = (key: string) =>
    previous[key] != null && JSON.stringify(previous[key]) !== JSON.stringify(next[key]);
  if (frozen("market_snapshot") || frozen("risk_preview"))
    throw new Error("DECISION_PLAN_IMMUTABLE");
  const priorEvidence = new Map(
    ((previous["evidence_items"] as Row[] | undefined) ?? []).map((item) => [item["id"], item]),
  );
  for (const item of (next["evidence_items"] as Row[] | undefined) ?? []) {
    const before = priorEvidence.get(item["id"]);
    if (before && before["available_at"] !== item["available_at"])
      throw new Error("EVIDENCE_TIME_IMMUTABLE");
  }
  const revisions = Array.isArray(previous["revisions"])
    ? [...(previous["revisions"] as Row[])]
    : [];
  for (const field of REVISED_PLAN_FIELDS)
    if ((previous[field] ?? null) !== (next[field] ?? null))
      revisions.push({
        at: clock.iso,
        field,
        from: previous[field] ?? null,
        to: next[field] ?? null,
      });
  return { ...next, revisions: revisions.slice(-500) };
}

/** Bounded read-only RPCs that the UI and copilot tools use. */
function readRpc(state: BookState, clock: Clock, name: string, values: Row) {
  switch (name) {
    case "risk_status":
      return riskStatusView(state, clock);
    case "book_report":
      return bookReport(state);
    case "order_audit": {
      const order = findOrder(state, values["p_order_id"]);
      const ids = new Set([
        order.id,
        ...state.fills.filter((f) => f.order_id === order.id).map((f) => f.id),
      ]);
      const reservations = state.reservations.filter((r) => r.order_id === order.id);
      for (const r of reservations) ids.add(r.id);
      if (order.protection_id) ids.add(order.protection_id);
      return {
        order: orderView(order),
        fills: state.fills.filter((f) => f.order_id === order.id).map(fillView),
        reservations: reservations.map((r) => ({
          ...r,
          amount: r.kind === "CASH" ? r.amount / 100 : r.amount,
        })),
        ledger: state.ledger.filter((e) => e.order_id === order.id).map(ledgerView),
        protection: state.protections
          .filter((p) => p.parent_order_id === order.id || p.id === order.protection_id)
          .map(protectionView),
        events: state.events.filter(
          (e) =>
            ids.has(e.entity_id) ||
            e.data["order_id"] === order.id ||
            e.data["exit_order_id"] === order.id,
        ),
      };
    }
    case "ai_usage":
      return state.ai_usage ?? null;
    case "conversation_list":
      return listConversations(state, values["p_query"]);
    case "conversation_get":
      return getConversation(state, values["p_id"]);
    case "notifications": {
      const after = Number(values["p_after_seq"] ?? 0);
      const events = state.events.filter((e) => e.notify && e.seq > after).slice(-100);
      return { latest_seq: state.seq, events };
    }
    default:
      throw new Error("Unsupported local action");
  }
}

const WRITE_RPCS = new Set([
  "fund_wallet",
  "cancel_protection",
  "conversation_save",
  "conversation_delete",
  "ai_usage_record",
]);

export function queryBookId(input: Record<string, unknown>): BookId {
  return input["book"] === "practice" ? "practice" : "main";
}

/** Whether a query mutates the book (and so needs a write transaction). */
export function queryWrites(input: Record<string, unknown>) {
  const rpc = input["rpc"];
  return (
    (typeof rpc === "string" && WRITE_RPCS.has(rpc)) ||
    (!rpc && (input["operation"] ?? "select") !== "select")
  );
}

/** Reads that should observe expiry maintenance first. */
export function queryMaintains(input: Record<string, unknown>) {
  return (
    input["table"] === "orders" ||
    input["table"] === "accounts" ||
    input["table"] === "holdings" ||
    input["table"] === "reservations" ||
    input["rpc"] === "risk_status"
  );
}

export function dataCommand(
  state: BookState,
  clock: Clock,
  input: Record<string, unknown>,
): unknown {
  const rpc = input["rpc"];
  const operation = input["operation"] ?? "select";
  const write = queryWrites(input);
  {
    {
      if (write) ensureRiskDay(state, clock);
      if (rpc === "conversation_save")
        return saveConversation(state, clock, (input["values"] ?? {}) as Row);
      if (rpc === "conversation_delete")
        return deleteConversation(state, ((input["values"] ?? {}) as Row)["p_id"]);
      if (rpc === "ai_usage_record")
        return recordAiUsage(
          state,
          clock,
          Number(((input["values"] ?? {}) as Row)["p_limit"]) || 300,
        );
      if (typeof rpc === "string") {
        const values = (input["values"] ?? {}) as Row;
        if (rpc === "fund_wallet") {
          const kind = values["p_kind"] ?? "DEPOSIT";
          const fingerprint = JSON.stringify(["fund_wallet", values["p_amount"], kind]);
          const prior = replay(state, values["p_intent_id"], fingerprint);
          if (prior) return prior;
          if (kind !== "DEPOSIT" && kind !== "WITHDRAW") throw new Error("INVALID_AMOUNT");
          const amount = toPaise(values["p_amount"]);
          fundWallet(state, clock, amount, kind);
          const response = { user_id: state.account.user_id, ...accountView(state) };
          remember(state, clock, String(values["p_intent_id"]), fingerprint, response);
          return response;
        }
        if (rpc === "cancel_protection")
          return protectionView(cancelProtection(state, clock, values["p_protection_id"]));
        return readRpc(state, clock, rpc, values);
      }
      const table = String(input["table"]);
      if (operation !== "select") return shape(editTable(state, clock, input), input);
      if (!READ_ONLY_TABLES.has(table) && !EDITABLE.has(table))
        throw new Error("Unsupported local table");
      const filters = readFilters(input);
      return shape(
        tableRows(state, table, clock).filter((row) => matches(row, filters)),
        input,
      );
    }
  }
}
