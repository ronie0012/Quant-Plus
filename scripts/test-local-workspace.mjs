import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const previousFile = process.env.LOCAL_DATA_FILE;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
// A fixed in-session clock keeps session-dependent behavior deterministic.
Date.now = () => Date.parse("2026-10-14T05:00:00Z");
const directory = mkdtempSync(join(tmpdir(), "qp-local-"));
const file = join(directory, "book.json");
process.env.LOCAL_DATA_FILE = file;
const { LOCAL_TOKEN, isLocalRequest } = localTestModule("@/lib/local-session");
const store = localTestModule("@/lib/local-store.server");
function evaluate(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) =>
    name === "@tanstack/react-router"
      ? { createFileRoute: () => (definition) => definition }
      : localTestModule(name),
  );
  return exports;
}
const route = evaluate("../src/routes/api/paper/$.ts");
const dataRoute = evaluate("../src/routes/api/local.ts");
function request(path, body, host = "http://localhost:5173", origin = host) {
  return new Request(`${host}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOCAL_TOKEN}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      path === "/api/paper/orders"
        ? { intent_id: randomUUID(), ...body }
        : body.rpc === "fund_wallet"
          ? { ...body, values: { p_intent_id: randomUUID(), ...body.values } }
          : body,
    ),
  });
}
const select = (table) => store.localDataQuery({ table, operation: "select" });
const charges = () => select("accounts")[0].charges_paid;
const orderInput = {
  symbol: "RELIANCE.NS",
  side: "BUY",
  order_type: "MARKET",
  quantity: 2,
  price: 1,
};
let price = 100;
const backendCalls = [];
globalThis.fetch = async (url) => {
  backendCalls.push(String(url));
  assert.match(String(url), /\/api\/v1\/market\/.+\/quote$/);
  return Response.json({
    price,
    symbol: "RELIANCE",
    source: "fyers",
    delayed: false,
    stale: false,
    as_of: new Date(Date.now()).toISOString(),
    market_session: "open",
  });
};
const previousKey = process.env.AGENT_SERVICE_API_KEY;
process.env.AGENT_SERVICE_API_KEY = "local-test-backend-key";
try {
  assert.equal(isLocalRequest(request("/api/local", {})), true);
  assert.equal(isLocalRequest(request("/api/local", {}, "https://public.example")), false);
  assert.equal(
    isLocalRequest(request("/api/local", {}, "http://localhost:5173", "https://foreign.example")),
    false,
  );
  assert.equal(
    (await dataRoute.local(request("/api/local", {}, "https://public.example"))).status,
    403,
  );
  assert.equal(
    (await route.paper(request("/api/paper/orders", orderInput, "https://public.example"))).status,
    403,
  );
  assert.equal(backendCalls.length, 0);

  const deposit = await dataRoute.local(
    request("/api/local", { rpc: "fund_wallet", values: { p_amount: 10000 } }),
  );
  assert.equal(deposit.status, 200);
  assert.equal((await deposit.json()).wallet_balance, 10000);
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100 },
  });
  const bought = await route.paper(request("/api/paper/orders", orderInput));
  assert.equal(bought.status, 200);
  const filled = await bought.json();
  assert.equal(filled.price, 100, "Fill uses the backend quote, never the browser price");
  assert.equal(filled.symbol, "RELIANCE");
  assert.equal(filled.quote_snapshot.source, "fyers");
  assert.ok(charges() > 0, "Charges are debited");
  assert.equal(select("accounts")[0].wallet_balance, Math.round((9800 - charges()) * 100) / 100);
  assert.equal(select("holdings")[0].quantity, 2);
  assert.equal(select("orders")[0].status, "FILLED");
  assert.equal(
    localTestModule("@/lib/local-store.server").localDataQuery({
      table: "holdings",
      operation: "select",
    })[0].quantity,
    2,
    "A freshly loaded store recovers positions from disk",
  );

  const beforeRejected = readFileSync(file, "utf8");
  const oversell = await route.paper(
    request("/api/paper/orders", { ...orderInput, side: "SELL", quantity: 3 }),
  );
  assert.equal(oversell.status, 409);
  assert.equal(await oversell.text(), "INSUFFICIENT_QUANTITY");
  assert.equal(
    readFileSync(file, "utf8"),
    beforeRejected,
    "Rejected trades leave the book unchanged",
  );
  assert.throws(() =>
    store.localDataQuery({
      table: "accounts",
      operation: "update",
      values: { wallet_balance: 999999 },
    }),
  );

  price = 120;
  const sold = await route.paper(
    request("/api/paper/orders", { ...orderInput, side: "SELL", quantity: 1 }),
  );
  assert.equal(sold.status, 200);
  const afterSale = select("accounts")[0];
  assert.equal(afterSale.funds_used, 100);
  assert.equal(afterSale.realised_gross, 20);
  assert.equal(afterSale.profit, Math.round((20 - charges()) * 100) / 100);
  const limitResponse = await route.paper(
    request("/api/paper/orders", {
      ...orderInput,
      order_type: "LIMIT",
      quantity: 1,
      limit_price: 90,
    }),
  );
  assert.equal(limitResponse.status, 200);
  const limit = await limitResponse.json();
  assert.equal(limit.status, "OPEN");
  const tooEarly = await route.paper(request(`/api/paper/orders/${limit.id}/fill`, {}));
  assert.equal(tooEarly.status, 409);
  assert.equal(await tooEarly.text(), "PRICE_CONDITION_NOT_MET");
  price = 85;
  assert.equal((await route.paper(request(`/api/paper/orders/${limit.id}/fill`, {}))).status, 200);
  assert.equal(select("holdings")[0].quantity, 2);
  assert.equal(select("holdings")[0].avg_price, 92.5);
  assert.equal(
    (await route.paper(request(`/api/paper/orders/${limit.id}/fill`, {}))).status,
    409,
    "Repeated fills cannot settle twice",
  );
  const audit = await route.paper(request(`/api/paper/orders/${limit.id}/audit`, {}));
  assert.equal(audit.status, 200);
  const trail = await audit.json();
  assert.equal(trail.fills.length, 1);
  assert.ok(trail.events.some((event) => event.type === "RESERVATION_CREATED"));
  const resting = await route.paper(
    request("/api/paper/orders", {
      ...orderInput,
      order_type: "STOP",
      quantity: 1,
      limit_price: 150,
    }),
  );
  const stop = await resting.json();
  assert.equal((await route.paper(request(`/api/paper/orders/${stop.id}/cancel`, {}))).status, 200);
  assert.equal(select("orders").find((order) => order.id === stop.id).status, "CANCELLED");
  store.localDataQuery({
    table: "risk_limits",
    operation: "upsert",
    values: { trading_paused: true },
  });
  const paused = await route.paper(request("/api/paper/orders", orderInput));
  assert.equal(await paused.text(), "TRADING_PAUSED");
  assert.throws(() =>
    store.localDataQuery({
      table: "risk_limits",
      operation: "upsert",
      values: { max_position_pct: 101 },
    }),
  );
  assert.throws(() =>
    store.localDataQuery({
      rpc: "fund_wallet",
      values: { p_amount: -1, p_intent_id: randomUUID() },
    }),
  );
  assert.throws(() =>
    store.localDataQuery({
      rpc: "fund_wallet",
      values: { p_amount: 20000, p_kind: "WITHDRAW", p_intent_id: randomUUID() },
    }),
  );
  const journal = store.localDataQuery({
    table: "trade_journal",
    operation: "insert",
    values: { symbol: "RELIANCE" },
    singular: true,
  });
  assert.deepEqual(journal.risks, []);
  const snapshot = { price: 100, source: "fyers", as_of: "2026-10-14T05:00:00.000Z" };
  const decided = store.localDataQuery({
    table: "trade_journal",
    operation: "insert",
    values: { symbol: "RELIANCE", thesis: "Test", decision_snapshot: snapshot },
    singular: true,
  });
  assert.deepEqual(decided.decision_snapshot, snapshot);
  assert.throws(
    () =>
      store.localDataQuery({
        table: "trade_journal",
        operation: "update",
        filters: [["id", decided.id]],
        values: { decision_snapshot: { ...snapshot, price: 1 } },
      }),
    /DECISION_SNAPSHOT_IMMUTABLE/,
  );
  const page = store.localDataQuery({
    table: "wallet_transactions",
    operation: "select",
    count: true,
    limit: 2,
    offset: 1,
  });
  assert.equal(page.rows.length, 2);
  assert.ok(page.total >= 4);
  const hosted = await route.paper(
    new Request("http://localhost:5173/api/paper/orders", {
      method: "POST",
      headers: { Authorization: "Bearer hosted-session", "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(hosted.status, 503, "Hosted accounts are not served until the InsForge gates pass");
  console.log(
    "Local workspace checks passed: loopback access, wallet, server-priced fills with charges, persistence, rollback, holdings, audit, triggers, cancellation, pagination and risk limits.",
  );
} finally {
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
  if (previousFile === undefined) delete process.env.LOCAL_DATA_FILE;
  else process.env.LOCAL_DATA_FILE = previousFile;
  if (previousKey === undefined) delete process.env.AGENT_SERVICE_API_KEY;
  else process.env.AGENT_SERVICE_API_KEY = previousKey;
  rmSync(directory, { recursive: true, force: true });
}
