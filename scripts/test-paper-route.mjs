// Run with: node scripts/test-paper-route.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

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

const directory = mkdtempSync(join(tmpdir(), "qp-route-"));
const saved = {
  LOCAL_DATA_FILE: process.env.LOCAL_DATA_FILE,
  AGENT_SERVICE_URL: process.env.AGENT_SERVICE_URL,
  AGENT_SERVICE_API_KEY: process.env.AGENT_SERVICE_API_KEY,
};
Object.assign(process.env, {
  LOCAL_DATA_FILE: join(directory, "book.json"),
  AGENT_SERVICE_URL: "https://agent.test",
  AGENT_SERVICE_API_KEY: "agent-test-key",
});
const originalNow = Date.now;
let now = Date.parse("2026-10-14T05:00:00Z");
Date.now = () => now;
const route = evaluate("../src/routes/api/paper/$.ts");
const store = localTestModule("@/lib/local-store.server");
const originalFetch = globalThis.fetch;
const calls = [];
let provider = {};
globalThis.fetch = async (input, init) => {
  const url = String(input);
  calls.push({ url, init });
  const symbol = decodeURIComponent(url.match(/market\/([^/]+)\/quote$/)?.[1] ?? "");
  if (!symbol) throw new Error(`unexpected fetch: ${url}`);
  return Response.json({
    symbol,
    price: 123.45,
    source: "fyers",
    delayed: false,
    stale: false,
    as_of: new Date(now).toISOString(),
    market_session: "open",
    ...(provider[symbol] ?? {}),
  });
};
const request = (body, path = "/api/paper/orders", token = "quant-plus-local-workspace") =>
  new Request(`http://localhost:5173${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const leg = (symbol, quantity, intent = `leg-${symbol}-${quantity}`) => ({
  symbol,
  side: "BUY",
  order_type: "MARKET",
  quantity,
  intent_id: intent,
});

try {
  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 10000, p_intent_id: "route-funding-1" },
  });
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100 },
  });

  // A browser estimate never reaches settlement; the server quote does.
  const placed = await route.paper(
    request({
      symbol: "RELIANCE.NS",
      company: "Reliance",
      side: "BUY",
      order_type: "MARKET",
      quantity: 2,
      price: 1,
      intent_id: "route-intent-1",
    }),
  );
  assert.equal(placed.status, 200);
  const order = await placed.json();
  assert.equal(order.price, 123.45);
  assert.equal(calls[0].url, "https://agent.test/api/v1/market/RELIANCE/quote");
  assert.equal(calls[0].init.headers["X-Quantplus-Key"], "agent-test-key");
  // Replays need no provider request.
  calls.length = 0;
  const replay = await route.paper(
    request({
      symbol: "RELIANCE",
      company: "Reliance",
      side: "BUY",
      order_type: "MARKET",
      quantity: 2,
      intent_id: "route-intent-1",
    }),
  );
  assert.deepEqual(await replay.json(), order);
  assert.equal(calls.length, 0);

  // Validation, intents and hosted-account boundary.
  for (const [body, status, text] of [
    [
      {
        symbol: "RELIANCE",
        side: "BUY",
        order_type: "MARKET",
        quantity: 1,
        product: "INTRADAY",
        intent_id: "route-intent-2",
      },
      400,
      "Invalid product",
    ],
    [
      { symbol: "RELIANCE", side: "BUY", order_type: "MARKET", quantity: 1 },
      400,
      "INVALID_INTENT_ID",
    ],
    [
      {
        symbol: "RELIANCE",
        side: "BUY",
        order_type: "LIMIT",
        quantity: 1,
        intent_id: "route-intent-3",
      },
      400,
      "A limit or trigger price is required",
    ],
    [
      {
        symbol: "RELIANCE",
        side: "BUY",
        order_type: "MARKET",
        quantity: 1.5,
        intent_id: "route-intent-4",
      },
      400,
      "Invalid quantity",
    ],
  ]) {
    const response = await route.paper(request(body));
    assert.equal(response.status, status);
    assert.equal(await response.text(), text);
  }
  calls.length = 0;
  const hosted = await route.paper(request({}, "/api/paper/orders", "hosted-token"));
  assert.equal(hosted.status, 503);
  assert.equal(calls.length, 0, "Hosted tokens are rejected before any network request");
  const anonymous = await route.paper(
    new Request("http://localhost:5173/api/paper/orders", { method: "POST" }),
  );
  assert.equal(anonymous.status, 401);

  // Holiday and stale quotes are rejected by the server authority.
  now = Date.parse("2026-10-20T05:00:00Z");
  const holiday = await route.paper(request({ ...leg("TCS", 1), intent_id: "route-holiday" }));
  assert.equal(holiday.status, 409);
  assert.match(await holiday.text(), /Dussehra/);
  now = Date.parse("2026-10-14T05:00:00Z");
  provider = { TCS: { stale: true } };
  const stale = await route.paper(request({ ...leg("TCS", 1), intent_id: "route-stale" }));
  assert.equal(stale.status, 409);
  provider = {};

  // Missing market-data credentials fail before any request.
  delete process.env.AGENT_SERVICE_API_KEY;
  calls.length = 0;
  const unconfigured = await route.paper(
    request({ ...leg("INFY", 1), intent_id: "route-unconfigured" }),
  );
  assert.equal(unconfigured.status, 503);
  assert.equal(calls.length, 0);
  process.env.AGENT_SERVICE_API_KEY = "agent-test-key";

  // Basket preflight reports unknowns; execution is per-leg and retry-safe.
  provider = { INFY: { price: 0 } };
  const preflight = await (
    await route.paper(
      request({ legs: [leg("TCS", 10), leg("INFY", 5)] }, "/api/paper/baskets/preflight"),
    )
  ).json();
  assert.equal(preflight.legs[0].status, "WOULD_FILL");
  assert.equal(preflight.legs[1].status, "UNKNOWN");
  assert.equal(preflight.available_cash_after, null);
  const first = await (
    await route.paper(request({ legs: [leg("TCS", 10), leg("INFY", 5)] }, "/api/paper/baskets"))
  ).json();
  assert.equal(first.policy, "INDEPENDENT_LEGS");
  assert.equal(first.results[0].ok, true);
  assert.equal(first.results[1].ok, false);
  provider = {};
  const retry = await (
    await route.paper(request({ legs: [leg("TCS", 10), leg("INFY", 5)] }, "/api/paper/baskets"))
  ).json();
  assert.deepEqual(
    retry.results[0].order,
    first.results[0].order,
    "Successful legs replay, never repeat",
  );
  assert.equal(retry.results[1].ok, true);
  const tcs = store
    .localDataQuery({ table: "holdings", operation: "select" })
    .find((h) => h.symbol === "TCS");
  assert.equal(tcs.quantity, 10);
  const duplicate = await route.paper(
    request(
      { legs: [leg("TCS", 1, "same-intent-x"), leg("INFY", 1, "same-intent-x")] },
      "/api/paper/baskets",
    ),
  );
  assert.equal(duplicate.status, 400);

  // Closed-session practice settles only in the separate practice book.
  now = Date.parse("2026-10-14T12:00:00Z"); // 17:30 IST, after the close
  provider = { ITC: { market_session: "closed", as_of: "2026-10-14T09:59:00Z", price: 410 } };
  const mainBefore = store.localDataQuery({ table: "holdings", operation: "select" });
  const liveClosed = await route.paper(
    request({ ...leg("ITC", 1), intent_id: "route-closed-live" }),
  );
  assert.equal(liveClosed.status, 409, "Live fills are refused after the close");
  store.localDataQuery({
    rpc: "fund_wallet",
    book: "practice",
    values: { p_amount: 10000, p_intent_id: "practice-fund-1" },
  });
  const practiced = await route.paper(
    request({
      ...leg("ITC", 2),
      intent_id: "route-practice-1",
      execution_mode: "LAST_SESSION_PRACTICE",
    }),
  );
  assert.equal(practiced.status, 200);
  const practiceOrder = await practiced.json();
  assert.equal(practiceOrder.execution_mode, "LAST_SESSION_PRACTICE");
  assert.equal(practiceOrder.price, 410);
  assert.deepEqual(store.localDataQuery({ table: "holdings", operation: "select" }), mainBefore);
  assert.equal(
    store.localDataQuery({ table: "holdings", operation: "select", book: "practice" })[0].symbol,
    "ITC",
  );
  const practiceLimit = await route.paper(
    request({
      symbol: "ITC",
      side: "BUY",
      order_type: "LIMIT",
      limit_price: 400,
      quantity: 1,
      intent_id: "route-practice-2",
      execution_mode: "LAST_SESSION_PRACTICE",
    }),
  );
  assert.equal(practiceLimit.status, 400, "Practice supports immediate market intents only");
  now = Date.parse("2026-10-14T05:00:00Z");
  provider = {};

  // Fill and cancel paths, audit and worker status.
  const resting = await (
    await route.paper(
      request({
        symbol: "RELIANCE",
        side: "BUY",
        order_type: "LIMIT",
        limit_price: 100,
        quantity: 1,
        intent_id: "route-resting",
      }),
    )
  ).json();
  assert.equal(resting.status, "OPEN");
  const early = await route.paper(request({}, `/api/paper/orders/${resting.id}/fill`));
  assert.equal(early.status, 409);
  assert.equal(await early.text(), "PRICE_CONDITION_NOT_MET");
  calls.length = 0;
  const cancelled = await route.paper(request({}, `/api/paper/orders/${resting.id}/cancel`));
  assert.equal(cancelled.status, 200);
  assert.equal(calls.length, 0, "Cancel does not need a market quote");
  const status = await (await route.paper(request({}, "/api/paper/worker"))).json();
  assert.deepEqual(status.book.reconciliation, []);
  const missing = await route.paper(
    request({}, "/api/paper/orders/00000000-0000-4000-8000-000000000072/fill"),
  );
  assert.equal(missing.status, 404);
  console.log(
    "Paper route checks passed: local authority, server quotes, replay without provider, validation, hosted boundary, holiday/stale rejection, baskets, fill/cancel, audit and worker status.",
  );
} finally {
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
}
