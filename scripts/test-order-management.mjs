import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "qp-orders-"));
const prior = { ...process.env };
const realNow = Date.now;
const realFetch = globalThis.fetch;
let now = Date.parse("2026-10-14T05:00:00Z");
Date.now = () => now;
Object.assign(process.env, {
  LOCAL_DATA_FILE: join(directory, "book.json"),
  QUANT_PLUS_WORKER: "off",
  AGENT_SERVICE_URL: "https://orders.test",
  AGENT_SERVICE_API_KEY: "test-key",
});
delete process.env.QUANT_PLUS_BOOK_PROVIDER;
const store = localTestModule("@/lib/local-store.server");
const engine = localTestModule("@/lib/paper-book/engine");
const quote = (price, extra = {}) => ({
  symbol: "TCS",
  price,
  source: "fyers",
  market_session: "open",
  stale: false,
  delayed: false,
  as_of: new Date(now).toISOString(),
  ...extra,
});
const state = () => JSON.parse(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"));
const rpc = (name, values) => store.localPaperRpc(name, values);
const buy = (id, quantity = 10) =>
  rpc("place_server_advanced_order", {
    p_intent_id: id,
    p_symbol: "TCS",
    p_company: "TCS",
    p_side: "BUY",
    p_type: "MARKET",
    p_qty: quantity,
    p_limit: null,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_quote: quote(100),
  });
const oco = (id, quantity = 10) => ({
  p_intent_id: id,
  p_symbol: "TCS",
  p_company: "TCS",
  p_qty: quantity,
  p_stop: 90,
  p_target: 110,
  p_quote: quote(100),
});
try {
  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 100000, p_intent_id: "fund-orders-001" },
  });
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100 },
  });
  buy("initial-buy-001");
  const input = oco("oco-partial-001");
  const pair = rpc("place_server_oco", input);
  assert.equal(pair.length, 2);
  assert.equal(pair[0].oco_group_id, pair[1].oco_group_id);
  assert.equal(engine.availableShares(state(), "TCS"), 0, "OCO reserves the holding once");
  const before = JSON.stringify(state());
  assert.throws(() => rpc("place_server_oco", oco("over-reserve-001", 1)), /INSUFFICIENT_QUANTITY/);
  assert.equal(JSON.stringify(state()), before, "failed OCO is atomic");
  const target = pair.find((order) => order.order_type === "LIMIT");
  const stop = pair.find((order) => order.order_type === "STOP");
  rpc("fill_server_open_order", {
    p_order_id: target.id,
    p_quote: quote(110, { bid: 110, ask: 110.05, bid_size: 3 }),
  });
  assert.equal(store.localOrder(target.id).filled_quantity, 3);
  assert.equal(store.localOrder(stop.id).status, "CANCELLED");
  assert.equal(store.localOrder(stop.id).status_reason, "OCO_SIBLING_FILLED");
  assert.equal(
    engine.availableShares(state(), "TCS"),
    0,
    "only the unfilled winning remainder stays reserved",
  );
  assert.throws(
    () => rpc("fill_server_open_order", { p_order_id: stop.id, p_quote: quote(89) }),
    /ORDER_NOT_OPEN/,
  );
  const count = state().orders.length;
  assert.deepEqual(rpc("place_server_oco", input), pair);
  assert.equal(state().orders.length, count);
  assert.throws(() => rpc("place_server_oco", { ...input, p_target: 111 }), /IDEMPOTENCY_CONFLICT/);
  rpc("cancel_server_open_order", { p_order_id: target.id });
  const cancelPair = rpc("place_server_oco", oco("oco-cancel-001", 7));
  rpc("cancel_server_open_order", { p_order_id: cancelPair[0].id });
  assert.ok(cancelPair.every((order) => store.localOrder(order.id).status === "CANCELLED"));
  assert.equal(engine.availableShares(state(), "TCS"), 7);
  const longIntentPair = rpc("place_server_oco", oco("x".repeat(160), 1));
  assert.ok(
    longIntentPair.every((order) => /^[A-Za-z0-9:_-]{8,160}$/.test(order.intent_id)),
    "OCO leg IDs fit the hosted SQL constraint even for maximum-length parent intents",
  );
  rpc("cancel_server_open_order", { p_order_id: longIntentPair[0].id });

  const resting = rpc("place_server_advanced_order", {
    p_intent_id: "amend-original-001",
    p_symbol: "TCS",
    p_company: "TCS",
    p_side: "BUY",
    p_type: "LIMIT",
    p_qty: 5,
    p_limit: 95,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_quote: quote(100),
  });
  const amendment = {
    p_intent_id: "amend-intent-001",
    p_order_id: resting.id,
    p_qty: 6,
    p_limit: 96,
    p_version: resting.version,
    p_quote: quote(100),
  };
  const changed = rpc("amend_server_open_order", amendment);
  assert.equal(changed.quantity, 6);
  assert.equal(changed.limit_price, 96);
  assert.ok(changed.version > resting.version);
  assert.deepEqual(rpc("amend_server_open_order", amendment), changed);
  assert.throws(
    () => rpc("amend_server_open_order", { ...amendment, p_intent_id: "amend-stale-001" }),
    /ORDER_VERSION_CONFLICT/,
  );
  const snapshot = JSON.stringify(state());
  assert.throws(
    () =>
      rpc("amend_server_open_order", {
        ...amendment,
        p_intent_id: "amend-invalid-001",
        p_version: changed.version,
        p_qty: 1000000,
      }),
    /ORDER_VALUE_LIMIT|INSUFFICIENT_FUNDS|POSITION_VALUE_LIMIT/,
  );
  assert.equal(JSON.stringify(state()), snapshot);
  assert.ok(state().events.some((event) => event.type === "ORDER_AMENDED"));
  assert.deepEqual(engine.reconcile(state()), []);

  // The HTTP boundary verifies quotes and ownership, rather than accepting client fill prices.
  const route = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(readFileSync("src/routes/api/paper/$.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(route, (name) =>
    name === "@tanstack/react-router"
      ? { createFileRoute: () => (value) => value }
      : localTestModule(name),
  );
  globalThis.fetch = async () => Response.json(quote(100));
  const post = (path, body, authenticated = true) =>
    route.paper(
      new Request(`http://localhost/api/paper/${path}`, {
        method: "POST",
        headers: authenticated ? { Authorization: "Bearer quant-plus-local-workspace" } : {},
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await post("orders/oco", {}, false)).status, 401);
  assert.equal(
    (
      await post("orders/oco", {
        symbol: "TCS",
        quantity: 1,
        stop_price: 90,
        target_price: 110,
        intent_id: "route-oco-001",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(`orders/${resting.id}/amend`, {
        quantity: 6,
        limit_price: 97,
        expected_version: changed.version,
        intent_id: "route-amend-001",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(`orders/${resting.id}/amend`, {
        quantity: 6,
        limit_price: 97,
        expected_version: changed.version,
        intent_id: "route-amend-stale",
      })
    ).status,
    409,
  );
  now = Date.parse("2026-10-14T10:01:00Z");
  store.localDataQuery({ table: "orders", operation: "select" });
  assert.deepEqual(engine.reconcile(state()), []);
  assert.ok(state().orders.some((order) => order.status === "EXPIRED"));
  console.log(
    "Order management checks passed: atomic OCO, shared reservations, partial-fill sibling cancellation, cancellation, intent replay/conflicts, versioned amendments, rollback, HTTP auth/quotes, expiry and reconciliation.",
  );
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
  Object.assign(process.env, prior);
  rmSync(directory, { recursive: true, force: true });
}
