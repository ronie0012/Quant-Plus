/**
 * One-way, validated migration of the original JSON v1 book into v2. The
 * storage layer keeps a hashed copy of the v1 file before writing v2.
 * Trading records that cannot be represented exactly abort the migration;
 * invalid user-editable rows are quarantined and reported instead.
 */
import { createHash, randomUUID } from "node:crypto";
import { dayOrderExpiry } from "../exchange-calendar.ts";
import { toPaise } from "../money.ts";
import { validateLocalValues } from "../local-schemas.ts";
import { newBook, reconcile, recordEvent, nextSeq } from "./engine.ts";
import type { BookOrder, BookState, Clock, Fill, OrderStatus, Row } from "./types.ts";

export type MigrationReport = {
  from_version: 1;
  to_version: 2;
  source_sha256: string;
  migrated_at: string;
  orders: number;
  fills: number;
  holdings: number;
  ledger_entries: number;
  quarantined: { table: string; reason: string }[];
  adjustments: string[];
  reconciliation: string[];
};

const STATUSES = new Set<OrderStatus>(["OPEN", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"]);
const EDITABLE = [
  "watchlist_items",
  "trading_preferences",
  "price_alerts",
  "trade_journal",
] as const;
const SERVER_FIELDS = new Set(["id", "user_id", "created_at", "updated_at"]);

function array(value: unknown, table: string): Row[] {
  if (!Array.isArray(value)) throw new Error(`MIGRATION_INVALID: ${table} is not a table`);
  return value as Row[];
}

function nullablePaise(value: unknown) {
  return value == null ? null : toPaise(value, "MIGRATION_INVALID_PRICE");
}

export function migrateV1(raw: string, userId: string, clock: Clock) {
  const source = JSON.parse(raw) as Record<string, unknown>;
  if (source["version"] !== 1) throw new Error("Unsupported local data version");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const state = newBook(userId, clock);
  const report: MigrationReport = {
    from_version: 1,
    to_version: 2,
    source_sha256: sha256,
    migrated_at: clock.iso,
    orders: 0,
    fills: 0,
    holdings: 0,
    ledger_entries: 0,
    quarantined: [],
    adjustments: [],
    reconciliation: [],
  };
  state.migrated_from = { version: 1, sha256, migrated_at: clock.iso };
  const [account] = array(source["accounts"], "accounts");
  if (!account || array(source["accounts"], "accounts").length !== 1)
    throw new Error("MIGRATION_INVALID: exactly one account is required");
  state.account.cash_paise = toPaise(account["wallet_balance"], "MIGRATION_INVALID_CASH");
  state.account.net_deposits_paise = toPaise(account["total_funds"], "MIGRATION_INVALID_CASH");
  state.account.realised_gross_paise = toPaise(account["profit"], "MIGRATION_INVALID_CASH");
  state.account.onboarded = account["onboarded"] === true;
  state.account.updated_at = String(account["updated_at"] ?? clock.iso);
  if (state.account.cash_paise < 0) throw new Error("MIGRATION_INVALID: negative cash");

  let ledgerCash = 0;
  for (const txn of array(source["wallet_transactions"], "wallet_transactions")) {
    const kind = String(txn["kind"]);
    if (!["DEPOSIT", "WITHDRAW", "BUY", "SELL"].includes(kind))
      throw new Error(`MIGRATION_INVALID: ledger kind ${kind}`);
    const amount = toPaise(txn["amount"], "MIGRATION_INVALID_LEDGER");
    ledgerCash += amount;
    const after = toPaise(txn["balance_after"], "MIGRATION_INVALID_LEDGER");
    if (after !== ledgerCash)
      report.adjustments.push(
        `ledger ${String(txn["id"])} balance_after ${after} != running ${ledgerCash}`,
      );
    state.ledger.push({
      id: typeof txn["id"] === "string" ? txn["id"] : randomUUID(),
      seq: nextSeq(state),
      kind: kind as "DEPOSIT",
      amount_paise: amount,
      balance_after_paise: ledgerCash,
      order_id: null,
      fill_id: null,
      note: String(txn["note"] ?? ""),
      created_at: String(txn["created_at"] ?? clock.iso),
    });
  }
  if (ledgerCash !== state.account.cash_paise) {
    // An explicit, reported opening adjustment; never a silent rewrite of cash.
    const difference = state.account.cash_paise - ledgerCash;
    state.ledger.push({
      id: randomUUID(),
      seq: nextSeq(state),
      kind: "MIGRATION_ADJUSTMENT",
      amount_paise: difference,
      balance_after_paise: state.account.cash_paise,
      order_id: null,
      fill_id: null,
      note: "v1 cash carried forward; the v1 ledger did not reconcile",
      created_at: clock.iso,
    });
    report.adjustments.push(`cash adjustment ${difference} paise`);
  }
  report.ledger_entries = state.ledger.length;

  const ids = new Set<string>();
  for (const row of array(source["orders"], "orders")) {
    const id = String(row["id"] ?? "");
    if (!id || ids.has(id)) throw new Error("MIGRATION_INVALID: duplicate or missing order id");
    ids.add(id);
    const status = String(row["status"]) as OrderStatus;
    if (!STATUSES.has(status)) throw new Error(`MIGRATION_INVALID: order status ${status}`);
    const quantity = row["quantity"];
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0)
      throw new Error("MIGRATION_INVALID: order quantity");
    const price = toPaise(row["price"], "MIGRATION_INVALID_PRICE");
    const created = String(row["created_at"] ?? clock.iso);
    const expiry = status === "OPEN" ? dayOrderExpiry(Date.parse(created)) : null;
    const filled = status === "FILLED" ? quantity : 0;
    const order: BookOrder = {
      id,
      intent_id: typeof row["intent_id"] === "string" ? row["intent_id"] : `legacy:${id}`,
      symbol: String(row["symbol"]),
      company: String(row["company"] ?? row["symbol"]),
      side: row["side"] === "SELL" ? "SELL" : "BUY",
      order_type: (["MARKET", "LIMIT", "STOP"].includes(String(row["order_type"]))
        ? row["order_type"]
        : "MARKET") as BookOrder["order_type"],
      quantity,
      filled_quantity: filled,
      limit_price_paise: nullablePaise(row["limit_price"]),
      price_paise: price,
      avg_fill_paise: filled ? price : null,
      charges_paise: 0,
      estimated_charges_paise: toPaise(row["estimated_charges"] ?? 0, "MIGRATION_INVALID_PRICE"),
      product: "DELIVERY",
      validity: "DAY",
      status,
      status_reason: status === "EXPIRED" ? "SESSION_CLOSE" : null,
      stop_loss_paise: nullablePaise(row["stop_loss"]),
      target_paise: nullablePaise(row["target_price"]),
      trailing_paise: nullablePaise(row["trailing_stop"]),
      parent_order_id: null,
      protection_id: null,
      execution_mode:
        row["execution_mode"] === "LAST_SESSION_PRACTICE" ? "LAST_SESSION_PRACTICE" : "LIVE",
      quote_snapshot: (row["quote_snapshot"] ?? {}) as Record<string, unknown>,
      created_at: created,
      updated_at: String(row["filled_at"] ?? created),
      filled_at: (row["filled_at"] as string | null) ?? null,
      expires_at: expiry == null ? null : new Date(expiry).toISOString(),
      version: 1,
    };
    state.orders.push(order);
    if (filled) {
      const fill: Fill = {
        id: randomUUID(),
        order_id: id,
        symbol: order.symbol,
        side: order.side,
        quantity: filled,
        price_paise: price,
        reference_price_paise: price,
        method: "LEGACY_V1",
        liquidity_limited: false,
        slippage_bps: 0,
        charges: null,
        // v1 estimated charges but never debited them; history is not rewritten.
        charges_debited: false,
        quote: order.quote_snapshot,
        created_at: order.filled_at ?? created,
        seq: nextSeq(state),
      };
      state.fills.push(fill);
      const ledger = state.ledger.find(
        (e) =>
          e.order_id == null &&
          e.kind === order.side &&
          e.note === `${order.side} ${quantity} ${order.symbol}` &&
          e.amount_paise === (order.side === "BUY" ? -1 : 1) * quantity * price,
      );
      if (ledger) {
        ledger.order_id = id;
        ledger.fill_id = fill.id;
      }
    }
  }
  report.orders = state.orders.length;
  report.fills = state.fills.length;

  const symbols = new Set<string>();
  for (const row of array(source["holdings"], "holdings")) {
    const symbol = String(row["symbol"]);
    const quantity = row["quantity"];
    if (
      symbols.has(symbol) ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    )
      throw new Error("MIGRATION_INVALID: holding");
    symbols.add(symbol);
    const avg = row["avg_price"];
    if (typeof avg !== "number" || !Number.isFinite(avg) || avg <= 0)
      throw new Error("MIGRATION_INVALID: holding average");
    const lastFill = state.fills.filter((f) => f.symbol === symbol).at(-1);
    state.holdings.push({
      id: String(row["id"] ?? randomUUID()),
      symbol,
      company: String(row["company"] ?? symbol),
      sector: (row["sector"] as string | null) ?? null,
      quantity,
      cost_paise: Math.round(quantity * avg * 100),
      mark_paise: toPaise(row["last_price"] ?? avg, "MIGRATION_INVALID_PRICE"),
      marked_at: lastFill?.created_at ?? state.account.updated_at,
      mark_source: "legacy-v1",
    });
  }
  report.holdings = state.holdings.length;
  for (const holding of state.holdings) {
    const fromFills = state.fills
      .filter((f) => f.symbol === holding.symbol)
      .reduce((t, f) => t + (f.side === "BUY" ? f.quantity : -f.quantity), 0);
    if (fromFills !== holding.quantity) {
      const difference = holding.quantity - fromFills;
      state.fills.push({
        id: randomUUID(),
        order_id: `migration:${holding.symbol}`,
        symbol: holding.symbol,
        side: difference > 0 ? "BUY" : "SELL",
        quantity: Math.abs(difference),
        price_paise: Math.max(1, Math.round(holding.cost_paise / holding.quantity)),
        reference_price_paise: Math.max(1, Math.round(holding.cost_paise / holding.quantity)),
        method: "LEGACY_V1",
        liquidity_limited: false,
        slippage_bps: 0,
        charges: null,
        charges_debited: false,
        quote: { note: "Opening position carried forward from v1 holdings" },
        created_at: clock.iso,
        seq: nextSeq(state),
      });
      report.adjustments.push(
        `${holding.symbol} opening position ${difference} carried from v1 holdings`,
      );
    }
  }

  const intents = (source["intents"] ?? {}) as Record<
    string,
    { fingerprint: string; response: unknown }
  >;
  for (const [key, value] of Object.entries(intents))
    state.intents[key] = {
      fingerprint: value.fingerprint,
      response: value.response,
      at: clock.iso,
    };

  // Browser-era brackets become server protections unless the v1 exit intent exists.
  for (const order of state.orders) {
    if (order.status !== "FILLED" || order.side !== "BUY") continue;
    if (order.stop_loss_paise == null && order.target_paise == null && order.trailing_paise == null)
      continue;
    const exited = Boolean(state.intents[`bracket:${order.id}`]);
    const held = state.holdings.find((h) => h.symbol === order.symbol)?.quantity ?? 0;
    const remaining = exited ? 0 : Math.min(order.quantity, held);
    const id = randomUUID();
    state.protections.push({
      id,
      parent_order_id: order.id,
      symbol: order.symbol,
      company: order.company,
      quantity: order.quantity,
      remaining_quantity: remaining,
      stop_paise: order.stop_loss_paise,
      target_paise: order.target_paise,
      trailing_paise: order.trailing_paise,
      peak_paise: order.price_paise,
      status: remaining > 0 ? "ACTIVE" : "COMPLETED",
      exits: [],
      last_error: exited
        ? "EXITED_BY_V1_BROWSER_MONITOR"
        : remaining
          ? null
          : "NO_REMAINING_HOLDING",
      attempts: 0,
      created_at: clock.iso,
      updated_at: clock.iso,
    });
    order.protection_id = id;
  }

  const limits = array(source["risk_limits"], "risk_limits")[0] ?? {};
  try {
    validateLocalValues(
      "risk_limits",
      {
        daily_loss_limit: limits["daily_loss_limit"],
        max_order_value: limits["max_order_value"],
        max_position_pct: limits["max_position_pct"],
        confirmation_above: limits["confirmation_above"],
        trading_paused: limits["trading_paused"],
      },
      false,
    );
    state.risk_limits = {
      user_id: userId,
      daily_loss_limit_paise: toPaise(limits["daily_loss_limit"]),
      max_order_value_paise: toPaise(limits["max_order_value"]),
      max_position_pct: Number(limits["max_position_pct"]),
      confirmation_above_paise: toPaise(limits["confirmation_above"]),
      trading_paused: limits["trading_paused"] === true,
      updated_at: clock.iso,
    };
  } catch {
    // Invalid persisted policy is quarantined; the safe default pauses new exposure.
    state.quarantine.push({
      table: "risk_limits",
      row: limits,
      reason: "Invalid risk policy",
      quarantined_at: clock.iso,
    });
    state.risk_limits.trading_paused = true;
    report.quarantined.push({
      table: "risk_limits",
      reason: "Invalid risk policy; trading paused",
    });
  }

  const riskDay = source["risk_day"] as
    { day?: string; equity?: number; flows?: number } | undefined;
  if (riskDay?.day && Number.isFinite(riskDay.equity) && Number.isFinite(riskDay.flows))
    state.risk_day = {
      date: riskDay.day,
      anchor_equity_paise: Math.round(riskDay.equity! * 100),
      flows_paise: Math.round(riskDay.flows! * 100),
      anchor_source: "MIGRATED",
      anchored_at: clock.iso,
    };

  for (const table of EDITABLE) {
    for (const row of array(source[table], table)) {
      const values = Object.fromEntries(
        Object.entries(row).filter(([key]) => !SERVER_FIELDS.has(key)),
      );
      if (table === "watchlist_items") {
        delete values["price"];
        delete values["change_pct"];
      }
      if (table === "price_alerts") delete values["user_id"];
      try {
        validateLocalValues(table, values, true);
        state[table].push(row);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Invalid record";
        state.quarantine.push({ table, row, reason, quarantined_at: clock.iso });
        report.quarantined.push({ table, reason });
      }
    }
  }

  recordEvent(state, clock, "BOOK_MIGRATED", "book", "v2", {
    source_sha256: sha256,
    adjustments: report.adjustments,
    quarantined: report.quarantined.length,
  });
  report.reconciliation = reconcile(state);
  if (report.reconciliation.length)
    throw new Error(`MIGRATION_RECONCILIATION_FAILED: ${report.reconciliation.join("; ")}`);
  return { state, report };
}
