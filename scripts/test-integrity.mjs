import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { backupBook, restoreBook } from "./local-book-recovery.mjs";
import { localTestModule } from "./local-test-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "qp-integrity-"));
const previousFile = process.env.LOCAL_DATA_FILE;
const previousKey = process.env.AGENT_SERVICE_API_KEY;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
Date.now = () => Date.parse("2026-10-14T05:00:00Z");
const store = localTestModule("@/lib/local-store.server");
const source = readFileSync(new URL("../src/routes/api/paper/$.ts", import.meta.url), "utf8");
const exports = {};
new Function(
  "exports",
  "require",
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
)(exports, (name) =>
  name === "@tanstack/react-router" ? { createFileRoute: () => (x) => x } : localTestModule(name),
);
let index = 0;
const select = (table) => store.localDataQuery({ table, operation: "select" });
const fund = (amount, key = randomUUID()) =>
  store.localDataQuery({ rpc: "fund_wallet", values: { p_amount: amount, p_intent_id: key } });
const fresh = () => {
  process.env.LOCAL_DATA_FILE = join(directory, `${index++}.json`);
  fund(10000);
};
const place = ({ p_price = 100, ...overrides } = {}) =>
  store.localPaperRpc("place_server_advanced_order", {
    p_intent_id: randomUUID(),
    p_symbol: "RELIANCE",
    p_company: "Reliance",
    p_side: "BUY",
    p_type: "MARKET",
    p_qty: 1,
    p_limit: null,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_quote: {
      symbol: "RELIANCE",
      price: p_price,
      source: "fyers",
      delayed: false,
      stale: false,
      market_session: "open",
      as_of: new Date(Date.now()).toISOString(),
    },
    ...overrides,
  });
const request = (body) =>
  new Request("http://localhost:5173/api/paper/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer quant-plus-local-workspace",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
try {
  fresh();
  const key = randomUUID();
  const first = place({ p_intent_id: key });
  assert.deepEqual(place({ p_intent_id: key, p_price: 110 }), first);
  assert.equal(select("holdings")[0].quantity, 1);
  assert.throws(() => place({ p_intent_id: key, p_qty: 2 }), /IDEMPOTENCY_CONFLICT/);
  place();
  assert.equal(
    select("holdings")[0].quantity,
    2,
    "Distinct intents can intentionally repeat orders",
  );
  const funding = randomUUID();
  const funded = fund(100, funding);
  assert.deepEqual(fund(100, funding), funded);
  assert.throws(() => fund(101, funding), /IDEMPOTENCY_CONFLICT/);

  fresh();
  place();
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { trading_paused: true, max_order_value: 1 },
  });
  assert.equal(
    place({ p_side: "SELL" }).status,
    "FILLED",
    "Pause and size cap allow a validated reduction",
  );
  assert.throws(() => place(), /TRADING_PAUSED/);
  assert.throws(() => place({ p_side: "SELL" }), /INSUFFICIENT_QUANTITY/);

  fresh();
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { daily_loss_limit: 1 },
  });
  place();
  place({ p_side: "SELL", p_price: 50 });
  assert.throws(() => place(), /DAILY_LOSS_LIMIT/);
  const lossState = readFileSync(process.env.LOCAL_DATA_FILE, "utf8");
  assert.throws(() => place(), /DAILY_LOSS_LIMIT/);
  assert.equal(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"), lossState);
  fund(500);
  assert.throws(() => place(), /DAILY_LOSS_LIMIT/, "Deposits do not conceal a daily loss");

  fresh();
  Date.now = () => Date.parse("2026-10-01T05:00:00Z");
  const resting = place({ p_type: "LIMIT", p_limit: 90 });
  Date.now = () => Date.parse("2026-10-14T05:00:00Z");
  assert.throws(
    () =>
      store.localPaperRpc("fill_server_open_order", {
        p_order_id: resting.id,
        p_quote: {
          symbol: "RELIANCE",
          price: 85,
          source: "fyers",
          market_session: "open",
          as_of: new Date(Date.now()).toISOString(),
        },
      }),
    /ORDER_EXPIRED|ORDER_NOT_OPEN/,
  );
  assert.equal(select("orders")[0].status, "EXPIRED");
  assert.equal(select("holdings").length, 0);

  for (const [table, values] of [
    ["trade_journal", { symbol: "RELIANCE", risks: null }],
    ["trade_journal", { symbol: "RELIANCE", evidence: [1] }],
    ["risk_limits", { daily_loss_limit: -1 }],
    ["risk_limits", { confirmation_above: -1 }],
    ["risk_limits", { surprise: true }],
    ["price_alerts", { symbol: "RELIANCE", alert_type: "NEWS", threshold: 1 }],
  ]) {
    assert.throws(() =>
      store.localDataQuery({
        table,
        operation: table === "risk_limits" ? "update" : "insert",
        values,
      }),
    );
  }

  fresh();
  process.env.AGENT_SERVICE_API_KEY = "isolated-test-key";
  const input = {
    symbol: "RELIANCE",
    side: "BUY",
    order_type: "MARKET",
    quantity: 1,
    intent_id: randomUUID(),
  };
  const quote = {
    symbol: "RELIANCE",
    price: 100,
    source: "fyers",
    stale: false,
    delayed: false,
    market_session: "open",
    as_of: new Date(Date.now()).toISOString(),
  };
  for (const change of [
    { as_of: new Date(Date.now() + 86400000).toISOString() },
    { market_session: "closed", as_of: "2020-01-01T00:00:00Z" },
    { symbol: "TCS" },
    { source: "yahoo" },
    { stale: true },
  ]) {
    globalThis.fetch = async () => Response.json({ ...quote, ...change });
    assert.equal((await exports.paper(request(input))).status, 409);
  }
  assert.equal(select("orders").length, 0);
  globalThis.fetch = async () => Response.json(quote);
  const accepted = await exports.paper(request(input));
  assert.equal(accepted.status, 200);
  const order = await accepted.json();
  assert.equal(order.quote_snapshot.as_of, quote.as_of);
  globalThis.fetch = async () => {
    throw new Error("Provider disconnected");
  };
  assert.deepEqual(
    await (await exports.paper(request(input))).json(),
    order,
    "A persisted replay needs no new quote or provider connection",
  );
  assert.equal((await exports.paper(request({ ...input, quantity: 2 }))).status, 409);

  const reloaded = localTestModule("@/lib/local-store.server");
  assert.equal(reloaded.localDataQuery({ table: "holdings", operation: "select" })[0].quantity, 1);
  writeFileSync(`${process.env.LOCAL_DATA_FILE}.lock`, "other writer");
  assert.throws(() => fund(1), /LOCAL_STORE_BUSY/);
  unlinkSync(`${process.env.LOCAL_DATA_FILE}.lock`);
  const snapshot = join(directory, "recovery.json");
  const report = backupBook(process.env.LOCAL_DATA_FILE, snapshot);
  const valid = readFileSync(snapshot, "utf8");
  writeFileSync(snapshot, valid + " ");
  assert.throws(() => restoreBook(snapshot, process.env.LOCAL_DATA_FILE), /checksum/);
  writeFileSync(snapshot, valid);
  writeFileSync(process.env.LOCAL_DATA_FILE, "{broken");
  assert.throws(() => fund(1));
  assert.equal(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"), "{broken");
  const restored = restoreBook(snapshot, process.env.LOCAL_DATA_FILE);
  assert.equal(restored.sha256, report.sha256);
  assert.equal(select("holdings")[0].quantity, 1);
  console.log(
    "Integrity regressions passed: idempotency, risk-reducing exits, cash-flow-adjusted loss, expiry, schemas, quotes, restart, lock and corruption.",
  );
} finally {
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
  if (previousFile === undefined) delete process.env.LOCAL_DATA_FILE;
  else process.env.LOCAL_DATA_FILE = previousFile;
  if (previousKey === undefined) delete process.env.AGENT_SERVICE_API_KEY;
  else process.env.AGENT_SERVICE_API_KEY = previousKey;
  for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
  rmdirSync(directory);
}
