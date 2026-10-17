import assert from "node:assert/strict";
import { localTestModule } from "./local-test-module.mjs";

const { settlementDue, settlementBalances } = localTestModule("@/lib/paper-book/settlement");
const {
  newBook,
  fundWallet,
  placeOrder,
  observationFromQuote,
  availableCash,
  settleCompletedFills,
  reconcile,
} = localTestModule("@/lib/paper-book/engine");
const { clockAt } = localTestModule("@/lib/paper-book/types");
assert.equal(
  settlementDue("2026-02-18T05:00:00Z"),
  "2026-02-20T18:30:00.000Z",
  "Feb 19 is a clearing holiday even though trading is open",
);
assert.equal(
  settlementDue("2026-03-30T05:00:00Z"),
  "2026-04-02T18:30:00.000Z",
  "Mahavir Jayanti and bank closing are excluded",
);
assert.equal(
  settlementDue("2026-01-14T05:00:00Z"),
  "2026-01-16T18:30:00.000Z",
  "Jan 15 amendment is included",
);
assert.equal(
  settlementDue("2026-10-16T05:00:00Z"),
  "2026-10-19T18:30:00.000Z",
  "weekends are excluded",
);
assert.equal(
  settlementDue("2026-12-31T05:00:00Z"),
  null,
  "unknown next-year calendar fails closed",
);
assert.equal(settlementDue("invalid"), null);
const clock = clockAt(Date.parse("2026-10-14T05:00:00Z"));
const state = newBook("settlement-test", clock);
state.risk_limits.max_position_pct = 100;
fundWallet(state, clock, 200000, "DEPOSIT");
const input = {
  symbol: "TCS",
  company: "TCS",
  order_type: "MARKET",
  quantity: 10,
  limit_price: null,
  stop_loss: null,
  target_price: null,
  trailing_stop: null,
  execution_mode: "LIVE",
};
const quote = (price) =>
  observationFromQuote(
    { symbol: "TCS", price, source: "fyers", as_of: clock.iso, market_session: "open" },
    clock,
  );
placeOrder(state, clock, { ...input, intent_id: "settlement-buy", side: "BUY" }, quote(100));
placeOrder(
  state,
  clock,
  { ...input, intent_id: "settlement-sell", side: "SELL", quantity: 5 },
  quote(110),
);
const pending = settlementBalances(state, clock.now);
assert.ok(pending.pending_sale_proceeds_paise > 0);
assert.deepEqual(pending.holdings.get("TCS"), { settled_quantity: 0, unsettled_quantity: 5 });
assert.equal(pending.settled_cash_paise + pending.unsettled_cash_paise, state.account.cash_paise);
assert.throws(
  () =>
    fundWallet(
      state,
      clock,
      availableCash(state) - pending.pending_sale_proceeds_paise + 1,
      "WITHDRAW",
    ),
  /SETTLEMENT_PENDING/,
);
const due = Date.parse(state.fills[0].settlement_due_at);
assert.ok(settlementBalances(state, due - 1).pending_sale_proceeds_paise > 0);
assert.equal(settlementBalances(state, due).pending_sale_proceeds_paise, 0);
assert.deepEqual(settlementBalances(state, due).holdings.get("TCS"), {
  settled_quantity: 5,
  unsettled_quantity: 0,
});
settleCompletedFills(state, clockAt(due));
const once = state.events.filter((event) => event.type === "SETTLEMENT_COMPLETED").length;
settleCompletedFills(state, clockAt(due + 1000));
assert.equal(once, 2);
assert.equal(state.events.filter((event) => event.type === "SETTLEMENT_COMPLETED").length, once);
assert.deepEqual(reconcile(state), []);
const legacy = structuredClone(state);
legacy.fills[0].settlement_due_at = null;
assert.equal(settlementBalances(legacy, due).unverified_fills, 1);
assert.equal(settlementBalances(legacy, due).holdings.get("TCS").settled_quantity, null);
assert.throws(() => fundWallet(legacy, clockAt(due), 1, "WITHDRAW"), /SETTLEMENT_PENDING/);
fundWallet(state, clockAt(due), availableCash(state), "WITHDRAW");
assert.equal(state.account.cash_paise, 0);
assert.deepEqual(reconcile(state), []);
console.log(
  "Settlement checks passed: clearing-only holidays, amendment, weekends/year boundaries, FIFO share settlement, pending proceeds/withdrawals, exact maturity, deduplicated completion events, unknown-history refusal and reconciliation.",
);
