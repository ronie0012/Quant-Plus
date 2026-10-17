// Run with: node scripts/test-paper-engine.mjs
// Desired-behavior regressions for the v2 paper book: integer-money settlement,
// itemised charges, reservations, partial fills, session expiry, marked day loss,
// server protections/alerts with leases, v1 migration and randomized reconciliation.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { localTestModule } from "./local-test-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "qp-engine-"));
const previousFile = process.env.LOCAL_DATA_FILE;
const originalNow = Date.now;
let clock = Date.parse("2026-10-14T05:00:00Z"); // Wednesday 10:30 IST, a trading day
Date.now = () => clock;
const advance = (ms) => (clock += ms);

const load = () => ({
  store: localTestModule("@/lib/local-store.server"),
  engine: localTestModule("@/lib/paper-book/engine"),
  worker: localTestModule("@/lib/paper-worker.server"),
});
let { store, engine, worker } = load();
assert.equal(
  worker.shouldRunLocalWorker({ QUANT_PLUS_BOOK_PROVIDER: "insforge" }),
  false,
  "hosted mode must not mutate the preserved local book",
);
assert.equal(
  worker.shouldRunLocalWorker({ QUANT_PLUS_BOOK_PROVIDER: "local" }),
  true,
  "local mode keeps the local worker active",
);
let index = 0;
const fresh = (amount = 100000, maxPositionPct = 100) => {
  process.env.LOCAL_DATA_FILE = join(directory, `${index++}.json`);
  if (amount) fund(amount);
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: maxPositionPct },
  });
};
const fund = (amount, kind = "DEPOSIT", key = randomUUID()) =>
  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: amount, p_kind: kind, p_intent_id: key },
  });
const quote = (symbol = "RELIANCE", price = 100, extra = {}) => ({
  symbol,
  price,
  source: "fyers",
  delayed: false,
  stale: false,
  market_session: "open",
  as_of: new Date(clock).toISOString(),
  ...extra,
});
const place = (overrides = {}, q = quote(overrides.p_symbol, overrides.price)) =>
  store.localPaperRpc("place_server_advanced_order", {
    p_intent_id: randomUUID(),
    p_symbol: "RELIANCE",
    p_company: "Reliance",
    p_side: "BUY",
    p_type: "MARKET",
    p_qty: 10,
    p_limit: null,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_quote: q,
    ...overrides,
  });
const select = (table, extra = {}) =>
  store.localDataQuery({ table, operation: "select", ...extra });
const raw = () => JSON.parse(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"));
const reconciled = () => assert.deepEqual(engine.reconcile(raw()), []);

try {
  // ---- Integer money and itemised, debited charges -------------------------------
  fresh(100000);
  const bought = place({ p_qty: 10 }, quote("RELIANCE", 1234.55));
  assert.equal(bought.status, "FILLED");
  const fill = select("fills")[0];
  const charges = Object.fromEntries(fill.charges.items.map((i) => [i.code, i.amount]));
  // turnover 12345.50: STT 0.1% = 12.35 -> rounded to Rs 12; exchange 307/crore = 0.38;
  // SEBI 10/crore = 0.01; stamp 0.015% = 1.85; GST 18% of (0 + 0.38 + 0.01) = 0.07.
  assert.deepEqual(charges, {
    STT: 12,
    EXCHANGE: 0.38,
    SEBI: 0.01,
    STAMP: 1.85,
    BROKERAGE: 0,
    GST: 0.07,
  });
  assert.equal(fill.charges.total, 14.31);
  const account = select("accounts")[0];
  assert.equal(account.wallet_balance, 100000 - 12345.5 - 14.31);
  assert.equal(account.charges_paid, 14.31);
  assert.equal(account.profit, -14.31, "Realised P&L is net of debited charges");
  assert.equal(select("holdings")[0].avg_price, 1234.55);
  reconciled();
  fresh(100000, 25);
  assert.throws(() => place({ p_qty: 30 }, quote("RELIANCE", 1000)), /POSITION_VALUE_LIMIT/);
  assert.throws(
    () => place({ p_qty: 2000 }, quote("RELIANCE", 1000)),
    /ORDER_VALUE_LIMIT|POSITION_VALUE_LIMIT/,
  );

  // ---- Reservations prevent double spending and overselling -----------------------
  fresh(10000);
  const first = place({ p_type: "LIMIT", p_limit: 90, p_qty: 100 }, quote("RELIANCE", 100));
  assert.equal(first.status, "OPEN");
  const reserved = select("accounts")[0];
  assert.ok(reserved.reserved_cash > 9000 && reserved.available_cash < 1000);
  assert.throws(() => place({ p_type: "LIMIT", p_limit: 90, p_qty: 100 }), /INSUFFICIENT_FUNDS/);
  assert.throws(
    () => place({ p_qty: 10 }),
    /INSUFFICIENT_FUNDS/,
    "Market buys respect reservations",
  );
  assert.throws(
    () => fund(5000, "WITHDRAW"),
    /INSUFFICIENT_FUNDS/,
    "Withdrawals respect reservations",
  );
  store.localPaperRpc("cancel_server_open_order", { p_order_id: first.id });
  assert.equal(select("accounts")[0].reserved_cash, 0, "Cancel releases the reservation");
  place({ p_qty: 10 });
  const sellStop = place({ p_side: "SELL", p_type: "STOP", p_limit: 95, p_qty: 10 });
  assert.equal(sellStop.status, "OPEN");
  assert.throws(
    () => place({ p_side: "SELL", p_qty: 1 }),
    /INSUFFICIENT_QUANTITY/,
    "Shares are reserved",
  );
  reconciled();

  // ---- Bid/ask fills, liquidity-limited partial fills and IOC market remainder ---
  fresh(1000000);
  const market = place(
    { p_qty: 50 },
    quote("RELIANCE", 100, { bid: 99.9, ask: 100.1, ask_quantity: 30 }),
  );
  assert.equal(market.status, "CANCELLED");
  assert.equal(market.status_reason, "REMAINDER_CANCELLED_LIQUIDITY");
  assert.equal(market.filled_quantity, 30);
  assert.equal(market.price, 100.1, "Buys fill at the observed ask");
  const resting = place({ p_type: "LIMIT", p_limit: 95, p_qty: 40 }, quote("RELIANCE", 100));
  const partial = store.localPaperRpc("fill_server_open_order", {
    p_order_id: resting.id,
    p_quote: quote("RELIANCE", 95, { bid: 94.9, ask: 95, ask_quantity: 15 }),
  });
  assert.equal(partial.status, "PARTIALLY_FILLED");
  assert.equal(partial.filled_quantity, 15);
  const completed = store.localPaperRpc("fill_server_open_order", {
    p_order_id: resting.id,
    p_quote: quote("RELIANCE", 94),
  });
  assert.equal(completed.status, "FILLED");
  assert.equal(completed.filled_quantity, 40);
  assert.equal(select("holdings")[0].quantity, 70);
  assert.equal(select("reservations").find((r) => r.order_id === resting.id).status, "CONSUMED");
  assert.throws(
    () =>
      store.localPaperRpc("fill_server_open_order", {
        p_order_id: resting.id,
        p_quote: quote("RELIANCE", 90),
      }),
    /ORDER_NOT_OPEN/,
    "A filled order cannot settle twice",
  );
  const marketable = place({ p_type: "LIMIT", p_limit: 101, p_qty: 1 }, quote("RELIANCE", 100));
  assert.equal(marketable.status, "FILLED", "A marketable limit fills at the observed price");
  assert.equal(marketable.price, 100);
  reconciled();

  // ---- Session expiry: holidays, after-close acceptance and reservation release --
  fresh(100000);
  clock = Date.parse("2026-10-19T09:00:00Z"); // Monday 14:30 IST; Tuesday is Dussehra
  const dayOrder = place({ p_type: "LIMIT", p_limit: 50, p_qty: 10 });
  assert.equal(dayOrder.expires_at, "2026-10-19T10:00:00.000Z");
  clock = Date.parse("2026-10-19T10:00:00Z");
  assert.equal(select("orders")[0].status, "EXPIRED");
  assert.equal(select("accounts")[0].reserved_cash, 0, "Expiry releases reservations");
  assert.ok(select("events").some((e) => e.type === "ORDER_EXPIRED" && e.notify));
  clock = Date.parse("2026-10-14T05:00:00Z");
  reconciled();

  // ---- Marked day loss, risk-reducing exits and cash-flow adjustment -------------
  fresh(100000);
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { daily_loss_limit: 1000, max_position_pct: 100 },
  });
  place({ p_qty: 100 }, quote("RELIANCE", 500));
  assert.equal(store.localDataQuery({ rpc: "risk_status" }).blocked, false);
  // An unrealised mark drop is a day loss even with no realised sale.
  advance(60_000);
  await worker.runWorkerTick("risk-marks", async (symbol) => quote(symbol, 480));
  assert.equal(select("holdings")[0].last_price, 480);
  assert.throws(() => place({ p_symbol: "TCS", p_qty: 1 }, quote("TCS", 3000)), /DAILY_LOSS_LIMIT/);
  const status = store.localDataQuery({ rpc: "risk_status" });
  assert.equal(status.blocked, true);
  assert.deepEqual(status.stale_marks, []);
  const exit = place({ p_side: "SELL", p_qty: 10 }, quote("RELIANCE", 480));
  assert.equal(exit.status, "FILLED", "Risk-reducing exits pass the loss guard");
  assert.equal(store.localDataQuery({ rpc: "risk_status" }).blocked_reason, "DAILY_LOSS_LIMIT");
  fund(50000);
  assert.throws(
    () => place({ p_symbol: "TCS", p_qty: 1 }, quote("TCS", 3000)),
    /DAILY_LOSS_LIMIT/,
    "Deposits do not conceal a loss",
  );
  // The next session starts a new loss window anchored at closing marks.
  clock = Date.parse("2026-10-15T05:00:00Z");
  assert.equal(place({ p_symbol: "TCS", p_qty: 1 }, quote("TCS", 3000)).status, "FILLED");
  clock = Date.parse("2026-10-14T05:00:00Z");

  // ---- Durable protections, alerts and worker leases -----------------------------
  fresh(100000);
  const parent = place({ p_qty: 10, p_stop_loss: 95, p_trailing: 4 }, quote("RELIANCE", 100));
  assert.equal(select("protections")[0].status, "ACTIVE");
  store.localDataQuery({
    table: "price_alerts",
    operation: "insert",
    values: { symbol: "RELIANCE", alert_type: "PRICE_ABOVE", threshold: 104 },
  });
  let price = 105;
  const source = async (symbol) => quote(symbol, price);
  let tick = await worker.runWorkerTick("worker-a", source);
  assert.equal(tick.alerts, 1);
  assert.equal(select("protections")[0].peak_price, 105, "Peaks persist server-side");
  assert.equal(select("price_alerts")[0].triggered_at !== null, true);
  assert.equal(
    (await worker.runWorkerTick("worker-b", source)).skipped,
    true,
    "Another live lease blocks a second worker",
  );
  price = 100.5; // trailing stop: 105 - 4 = 101
  tick = await worker.runWorkerTick("worker-a", source);
  assert.equal(tick.protections_triggered, 1);
  assert.equal(tick.alerts, 0, "Alerts fire once");
  assert.equal(select("holdings").length, 0);
  const exits = select("orders").filter((o) => o.parent_order_id === parent.id);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].side, "SELL");
  assert.equal(
    (await worker.runWorkerTick("worker-a", source)).protections_triggered,
    0,
    "No duplicate exit",
  );
  const notices = store.localDataQuery({ rpc: "notifications", values: { p_after_seq: 0 } });
  assert.ok(notices.events.some((e) => e.type === "PROTECTION_TRIGGERED"));
  assert.ok(notices.events.some((e) => e.type === "ALERT_TRIGGERED"));
  const audit = store.localDataQuery({ rpc: "order_audit", values: { p_order_id: parent.id } });
  assert.equal(audit.fills.length, 1);
  assert.ok(audit.events.some((e) => e.type === "ORDER_ACCEPTED"));
  assert.ok(audit.events.some((e) => e.type === "PROTECTION_TRIGGERED"));
  reconciled();

  // Lease expiry lets a different worker recover the book.
  advance(25_000);
  assert.equal((await worker.runWorkerTick("worker-b", source)).skipped, false);

  // ---- Resting orders fill from the worker with the browser closed ---------------
  fresh(100000);
  const restingBuy = place({ p_type: "LIMIT", p_limit: 95, p_qty: 10 }, quote("RELIANCE", 100));
  price = 99;
  await worker.runWorkerTick("worker-c", source);
  assert.equal(select("orders").find((o) => o.id === restingBuy.id).status, "OPEN");
  price = 94.5;
  await worker.runWorkerTick("worker-c", source);
  assert.equal(select("orders").find((o) => o.id === restingBuy.id).status, "FILLED");
  // A fill-time risk failure rejects and releases the reservation.
  const pausedBuy = place({ p_type: "LIMIT", p_limit: 90, p_qty: 10 }, quote("RELIANCE", 95));
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { trading_paused: true },
  });
  price = 89;
  await worker.runWorkerTick("worker-c", source);
  const rejected = select("orders").find((o) => o.id === pausedBuy.id);
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.status_reason, "TRADING_PAUSED");
  assert.equal(select("accounts")[0].reserved_cash, 0);
  // Stale or closed quotes never trigger executions.
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { trading_paused: false },
  });
  const guarded = place({ p_type: "LIMIT", p_limit: 80, p_qty: 1 }, quote("RELIANCE", 95));
  await worker.runWorkerTick("worker-c", async (s) => quote(s, 70, { stale: true }));
  await worker.runWorkerTick("worker-c", async (s) =>
    quote(s, 70, { as_of: new Date(clock - 120_000).toISOString() }),
  );
  assert.equal(select("orders").find((o) => o.id === guarded.id).status, "OPEN");
  reconciled();

  // ---- Holiday sessions reject live fills even if a provider claims "open" -------
  const eligibility = localTestModule("@/lib/quote-eligibility");
  const holiday = Date.parse("2026-10-20T05:00:00Z");
  assert.match(
    eligibility.executionQuoteError(
      { ...quote(), as_of: new Date(holiday).toISOString() },
      holiday,
      "LIVE",
      "RELIANCE",
    ),
    /Dussehra/,
  );

  // ---- Basket preflight with independent legs and unknown estimates --------------
  fresh(5000);
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100 },
  });
  const basket = localTestModule("@/lib/paper-basket.server");
  const leg = (symbol, qty, key = randomUUID()) => ({
    parameters: {
      p_intent_id: key,
      p_symbol: symbol,
      p_company: symbol,
      p_side: "BUY",
      p_type: "MARKET",
      p_qty: qty,
      p_limit: null,
      p_product: "DELIVERY",
      p_validity: "DAY",
    },
    quote: quote(symbol, 100),
    quote_error: null,
  });
  const preflight = basket.preflightBasket([
    leg("RELIANCE", 10),
    leg("TCS", 45),
    { ...leg("INFY", 1), quote: null, quote_error: "offline" },
  ]);
  assert.equal(preflight.legs[0].status, "WOULD_FILL");
  assert.equal(preflight.legs[1].status, "WOULD_REJECT", "Later legs see earlier legs' cash use");
  assert.equal(preflight.legs[1].error, "INSUFFICIENT_FUNDS");
  assert.equal(preflight.legs[2].status, "UNKNOWN");
  assert.equal(preflight.complete, false);
  assert.equal(preflight.available_cash_after, null, "Missing inputs make the total unknown");
  assert.equal(select("orders").length, 0, "Preflight persists nothing");

  // ---- v1 migration preserves IDs, reconciles, backs up and quarantines ----------
  process.env.LOCAL_DATA_FILE = join(directory, "legacy.json");
  const v1 = {
    version: 1,
    accounts: [
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        currency: "INR",
        total_funds: 1000000,
        funds_used: 7089.5,
        profit: 0,
        profit_pct: 0,
        wallet_balance: 992910.5,
        onboarded: true,
        updated_at: "2026-10-14T07:53:30.857Z",
      },
    ],
    holdings: [
      {
        id: "236a8f53-637b-47ff-ad0c-7f6c873238b4",
        symbol: "HDFCBANK",
        company: "HDFC Bank",
        sector: null,
        quantity: 10,
        avg_price: 708.95,
        last_price: 708.95,
      },
    ],
    orders: [
      {
        id: "12470872-7c63-4885-93cb-a2d4cf547d71",
        symbol: "HDFCBANK",
        company: "HDFC Bank",
        side: "BUY",
        order_type: "MARKET",
        quantity: 10,
        price: 708.95,
        limit_price: null,
        product: "DELIVERY",
        validity: "DAY",
        stop_loss: null,
        target_price: null,
        trailing_stop: null,
        status: "FILLED",
        filled_at: "2026-10-14T07:53:30.857Z",
        created_at: "2026-10-14T07:53:30.856Z",
        filled_quantity: 10,
        estimated_charges: 2.48,
      },
    ],
    wallet_transactions: [
      {
        id: "36dd2ade-7899-4d0e-8946-9ea8c6b95189",
        kind: "DEPOSIT",
        amount: 1000000,
        balance_after: 1000000,
        note: "Local paper deposit",
        created_at: "2026-10-14T07:53:27.775Z",
      },
      {
        id: "51947019-ca30-42f6-9344-a10c471b859a",
        kind: "BUY",
        amount: -7089.5,
        balance_after: 992910.5,
        note: "BUY 10 HDFCBANK",
        created_at: "2026-10-14T07:53:30.857Z",
      },
    ],
    watchlist_items: [],
    trading_preferences: [],
    price_alerts: [],
    trade_journal: [{ id: randomUUID(), symbol: "HDFCBANK", risks: null }],
    risk_limits: [
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        daily_loss_limit: 50000,
        max_order_value: 1000000,
        max_position_pct: 25,
        confirmation_above: 500000,
        trading_paused: false,
      },
    ],
  };
  writeFileSync(process.env.LOCAL_DATA_FILE, JSON.stringify(v1));
  const migratedAccount = select("accounts")[0];
  assert.equal(migratedAccount.wallet_balance, 992910.5);
  assert.equal(migratedAccount.total_funds, 1000000);
  assert.equal(migratedAccount.funds_used, 7089.5);
  assert.equal(select("orders")[0].id, "12470872-7c63-4885-93cb-a2d4cf547d71");
  assert.equal(select("holdings")[0].id, "236a8f53-637b-47ff-ad0c-7f6c873238b4");
  assert.equal(select("fills")[0].charges_debited, false, "Legacy history is not rewritten");
  const report = store.localDataQuery({ rpc: "book_report" });
  assert.deepEqual(report.reconciliation, []);
  assert.equal(report.quarantine.length, 1);
  assert.equal(report.quarantine[0].table, "trade_journal");
  const files = readdirSync(directory);
  assert.ok(files.some((f) => f.startsWith("legacy.json.v1-") && f.endsWith(".bak")));
  assert.ok(files.some((f) => f.startsWith("legacy.json.migration-v2-")));
  assert.equal(raw().version, 2);

  // ---- Malformed books are retained; stale locks from exited processes recover ---
  fresh(1000);
  writeFileSync(process.env.LOCAL_DATA_FILE, "{broken");
  assert.throws(() => fund(1));
  assert.equal(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"), "{broken");
  fresh(1000);
  const { hostname } = await import("node:os");
  writeFileSync(
    `${process.env.LOCAL_DATA_FILE}.lock`,
    JSON.stringify({ pid: process.pid, host: hostname() }),
  );
  const realNow = originalNow();
  assert.throws(() => fund(1), /LOCAL_STORE_BUSY/, "A live owner's lock is never removed");
  assert.ok(originalNow() - realNow >= 0);
  writeFileSync(
    `${process.env.LOCAL_DATA_FILE}.lock`,
    JSON.stringify({ pid: 999999, host: hostname() }),
  );
  const { utimesSync } = await import("node:fs");
  const old = new Date(originalNow() - 60_000);
  utimesSync(`${process.env.LOCAL_DATA_FILE}.lock`, old, old);
  fund(1);
  assert.equal(existsSync(`${process.env.LOCAL_DATA_FILE}.lock`), false);
  writeFileSync(`${process.env.LOCAL_DATA_FILE}.${randomUUID()}.tmp`, "partial write from a crash");
  assert.equal(
    select("accounts")[0].wallet_balance,
    1001,
    "Interrupted temporary files never replace the book",
  );

  // ---- Randomized accounting property test --------------------------------------
  let seed = 20261014;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const outcomes = { ok: 0, rejected: 0, fills: 0 };
  for (let run = 0; run < 6; run++) {
    fresh(200000);
    store.localDataQuery({
      table: "risk_limits",
      operation: "update",
      values: { max_position_pct: 100, daily_loss_limit: 10000000 },
    });
    for (let step = 0; step < 60; step++) {
      const symbol = pick(["RELIANCE", "TCS", "INFY"]);
      const level = Math.round((80 + random() * 40) * 100) / 100;
      const size =
        random() < 0.3
          ? {
              ask_quantity: 1 + Math.floor(random() * 20),
              bid_quantity: 1 + Math.floor(random() * 20),
              bid: level - 0.05,
              ask: level + 0.05,
            }
          : {};
      const action = pick([
        "buy",
        "sell",
        "limit",
        "stopsell",
        "cancel",
        "fill",
        "fund",
        "withdraw",
        "tick",
        "time",
      ]);
      try {
        if (action === "buy")
          place(
            { p_symbol: symbol, p_qty: 1 + Math.floor(random() * 30) },
            quote(symbol, level, size),
          );
        if (action === "sell")
          place(
            { p_symbol: symbol, p_side: "SELL", p_qty: 1 + Math.floor(random() * 30) },
            quote(symbol, level, size),
          );
        if (action === "limit")
          place(
            {
              p_symbol: symbol,
              p_type: "LIMIT",
              p_limit: Math.round(level * 0.98 * 100) / 100,
              p_qty: 1 + Math.floor(random() * 30),
            },
            quote(symbol, level),
          );
        if (action === "stopsell")
          place(
            {
              p_symbol: symbol,
              p_side: "SELL",
              p_type: "STOP",
              p_limit: Math.round(level * 0.97 * 100) / 100,
              p_qty: 1 + Math.floor(random() * 10),
            },
            quote(symbol, level),
          );
        if (action === "cancel" || action === "fill") {
          const open = select("orders").filter(
            (o) => o.status === "OPEN" || o.status === "PARTIALLY_FILLED",
          );
          if (open.length) {
            const order = pick(open);
            if (action === "cancel")
              store.localPaperRpc("cancel_server_open_order", { p_order_id: order.id });
            else
              store.localPaperRpc("fill_server_open_order", {
                p_order_id: order.id,
                p_quote: quote(order.symbol, Math.round(level * 0.9 * 100) / 100, size),
              });
          }
        }
        if (action === "fund") fund(Math.round(random() * 5000) + 1);
        if (action === "withdraw") fund(Math.round(random() * 5000) + 1, "WITHDRAW");
        if (action === "tick")
          await worker.runWorkerTick("prop", async (s) => quote(s, level, size));
        if (action === "time") advance(Math.floor(random() * 3 * 3600_000));
        outcomes.ok++;
      } catch (error) {
        outcomes.rejected++;
        assert.match(
          String(error.message),
          /^(INSUFFICIENT_FUNDS|INSUFFICIENT_QUANTITY|PRICE_CONDITION_NOT_MET|ORDER_NOT_OPEN|ORDER_EXPIRED|POSITION_VALUE_LIMIT|ORDER_VALUE_LIMIT|NO_LIQUIDITY|INVALID_STOP_LOSS|SETTLEMENT_PENDING)$/,
          `unexpected ${action} error ${error.message}`,
        );
      }
      const state = raw();
      assert.deepEqual(engine.reconcile(state), [], `run ${run} step ${step} ${action}`);
      assert.ok(state.account.cash_paise >= 0);
    }
    outcomes.fills += raw().fills.length;
    clock = Date.parse("2026-10-14T05:00:00Z");
  }
  assert.ok(outcomes.fills >= 60 && outcomes.ok >= 150, JSON.stringify(outcomes));

  console.log(
    "Paper engine checks passed: paise settlement, itemised charges, reservations, bid/ask and partial fills, holiday expiry, marked day loss, durable protections/alerts, leases, basket preflight, v1 migration, lock recovery and randomized reconciliation.",
  );
} finally {
  Date.now = originalNow;
  if (previousFile === undefined) delete process.env.LOCAL_DATA_FILE;
  else process.env.LOCAL_DATA_FILE = previousFile;
  rmSync(directory, { recursive: true, force: true });
}
