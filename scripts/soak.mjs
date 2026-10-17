// Run with: node --expose-gc scripts/soak.mjs [--minutes 5] [--sessions 10] [--step-seconds 1800]
// Accelerated soak: drives the real paper route and worker against a temporary book on a
// simulated exchange clock that walks through verified NSE sessions (open → close → next
// open), with random orders, cancels, sells, reads and worker ticks on a random-walk quote.
// Every checkpoint reconciles the book; memory, latency and error classes are recorded.
// This is NOT the roadmap's 10-trading-session real-time soak with live provider data;
// it exercises the same code paths at accelerated time and reports itself as such.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const minutes = arg("minutes", 5);
const targetSessions = arg("sessions", 10);
const stepMs = arg("step-seconds", 1800) * 1000;
assert.ok(Number.isFinite(minutes) && minutes > 0, "--minutes must be positive");
assert.ok(
  Number.isSafeInteger(targetSessions) && targetSessions > 0,
  "--sessions must be a positive integer",
);
assert.ok(
  Number.isFinite(stepMs) && stepMs > 0 && stepMs <= 6.25 * 3600_000,
  "--step-seconds must be positive and no longer than a trading session",
);
const directory = mkdtempSync(join(tmpdir(), "qp-soak-"));
const bookFile = join(directory, "soak.json");
Object.assign(process.env, {
  LOCAL_DATA_FILE: bookFile,
  QUANT_PLUS_WORKER: "off",
  AGENT_SERVICE_URL: "https://agent.soak",
  AGENT_SERVICE_API_KEY: "soak-key",
});

const realNow = Date.now;
const realFetch = globalThis.fetch;
let now = Date.parse("2026-10-01T03:45:00Z"); // 09:15 IST on a verified session
Date.now = () => now;

let seed = 20261014;
const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const symbols = ["TCS", "INFY", "HDFCBANK", "ITC", "RELIANCE"];
const prices = Object.fromEntries(symbols.map((s, i) => [s, 500 + i * 300]));
const quote = (symbol) => {
  const p = Math.round(prices[symbol] * 100) / 100;
  return {
    symbol,
    price: p,
    bid: p - 0.05,
    ask: p + 0.05,
    source: "fyers",
    delayed: false,
    stale: false,
    market_session: "open",
    as_of: new Date(now).toISOString(),
  };
};
globalThis.fetch = async (url) =>
  Response.json(quote(decodeURIComponent(String(url).split("/")[6] ?? "TCS")));

const stats = {
  iterations: 0,
  requests: 0,
  by_status: {},
  rejections: {},
  server_errors: [],
  checkpoints: 0,
  sessions: 0,
  expired_orders: 0,
  expiry_proofs: [],
  latency: [],
  heap: [],
};
const startedAt = realNow();
try {
  const calendar = localTestModule("@/lib/exchange-calendar");
  const engine = localTestModule("@/lib/paper-book/engine");
  const store = localTestModule("@/lib/local-store.server");
  const worker = localTestModule("@/lib/paper-worker.server");
  const source = readFileSync(new URL("../src/routes/api/paper/$.ts", import.meta.url), "utf8");
  const route = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(route, (name) =>
    name === "@tanstack/react-router" ? { createFileRoute: () => (x) => x } : localTestModule(name),
  );
  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 5_000_000, p_intent_id: "soak-fund-000001" },
  });
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100, max_order_value: 5_000_000, daily_loss_limit: 5_000_000 },
  });

  const post = async (path, body) => {
    const start = performance.now();
    const response = await route.paper(
      new Request(`http://localhost/api/paper/${path}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer quant-plus-local-workspace",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      }),
    );
    stats.latency.push(performance.now() - start);
    stats.requests++;
    stats.by_status[response.status] = (stats.by_status[response.status] ?? 0) + 1;
    const text = await response.text();
    if (response.status >= 400 && response.status < 500) {
      const reason = text.replace(/^"|"$/g, "").slice(0, 70);
      stats.rejections[reason] = (stats.rejections[reason] ?? 0) + 1;
    }
    if (response.status >= 500)
      stats.server_errors.push({
        path,
        status: response.status,
        body: text.slice(0, 200),
        at: new Date(now).toISOString(),
      });
    return { status: response.status, body: response.status === 200 ? JSON.parse(text) : text };
  };

  const checkpoint = () => {
    const state = JSON.parse(readFileSync(bookFile, "utf8"));
    const problems = engine.reconcile(state);
    assert.deepEqual(problems, [], `reconciliation failed at ${new Date(now).toISOString()}`);
    stats.checkpoints++;
    globalThis.gc?.();
    stats.heap.push(Math.round(process.memoryUsage().heapUsed / 2 ** 20));
    return state;
  };

  let intent = 0;
  const open = [];
  let expiryProof = null;
  while (realNow() - startedAt < minutes * 60_000 && stats.sessions < targetSessions) {
    const session = calendar.exchangeSession(now);
    if (!session.open) {
      // Close: run the worker once (expires DAY orders), reconcile, then jump to the next open.
      await worker.runWorkerTick("soak", async (s) => quote(s));
      const state = checkpoint();
      stats.expired_orders = state.orders.filter((o) => o.status === "EXPIRED").length;
      const proof = state.orders.find((order) => order.id === expiryProof);
      assert.equal(proof?.status, "EXPIRED", "Every completed session must exercise DAY expiry");
      stats.expiry_proofs.push({
        order_id: proof.id,
        expires_at: proof.expires_at,
        status: proof.status,
      });
      expiryProof = null;
      stats.sessions++;
      const next = calendar.nextSessionAtOrAfter(calendar.istDate(now + 24 * 3600_000));
      assert.ok(next, "calendar has a next verified session");
      now = Date.parse(`${next.date}T03:45:00Z`) + 1000;
      open.length = 0;
      continue;
    }
    if (!expiryProof) {
      const proof = await post("orders", {
        symbol: "TCS",
        side: "BUY",
        order_type: "LIMIT",
        limit_price: Math.floor(prices.TCS * 10) / 100,
        quantity: 1,
        intent_id: `soak-expiry-${stats.sessions}`,
      });
      assert.equal(proof.status, 200, "DAY expiry proof order must be accepted");
      expiryProof = proof.body.id;
    }
    for (const s of symbols) prices[s] = Math.max(1, prices[s] * (1 + (random() - 0.5) * 0.004));
    const roll = random();
    const symbol = symbols[Math.floor(random() * symbols.length)];
    const id = () => `soak-${++intent}-${Math.floor(random() * 1e9)}`;
    if (roll < 0.35) {
      await post("orders", {
        symbol,
        side: "BUY",
        order_type: "MARKET",
        quantity: 1 + Math.floor(random() * 5),
        intent_id: id(),
      });
    } else if (roll < 0.55) {
      const r = await post("orders", {
        symbol,
        side: "BUY",
        order_type: "LIMIT",
        limit_price: Math.round(prices[symbol] * 0.995 * 100) / 100,
        quantity: 1 + Math.floor(random() * 3),
        intent_id: id(),
      });
      if (r.status === 200 && r.body?.id) open.push(r.body.id);
    } else if (roll < 0.7) {
      await post("orders", {
        symbol,
        side: "SELL",
        order_type: "MARKET",
        quantity: 1 + Math.floor(random() * 3),
        intent_id: id(),
      });
    } else if (roll < 0.78 && open.length) {
      await post(`orders/${open.splice(Math.floor(random() * open.length), 1)[0]}/cancel`);
    } else if (roll < 0.83) {
      // A retried delivery of an already-used intent must be idempotent.
      await post("orders", {
        symbol: "TCS",
        side: "BUY",
        order_type: "MARKET",
        quantity: 1,
        intent_id: `soak-dup-${stats.sessions}`,
      });
    } else {
      store.localDataQuery({ table: "orders", operation: "select", limit: 50 });
      store.localDataQuery({ table: "holdings", operation: "select" });
    }
    if (stats.iterations % 3 === 0) await worker.runWorkerTick("soak", async (s) => quote(s));
    if (stats.iterations % 200 === 0) checkpoint();
    stats.iterations++;
    now += stepMs;
  }
  const final = checkpoint();
  const sorted = [...stats.latency].sort((a, b) => a - b);
  const pct = (p) =>
    Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] * 10) /
    10;
  const dupOrders = final.orders.filter((o) => String(o.intent_id).startsWith("soak-dup-"));
  const intents = new Set(final.orders.map((o) => o.intent_id));
  const report = {
    status:
      stats.sessions >= targetSessions && stats.expired_orders > 0 ? "complete" : "incomplete",
    requested_sessions: targetSessions,
    simulated_step_seconds: stepMs / 1000,
    session_expiry_proofs: stats.expiry_proofs,
    kind: "accelerated simulated-clock soak (not the real-time 10-session soak)",
    generated_at: new Date(realNow()).toISOString(),
    wall_minutes: Math.round((realNow() - startedAt) / 600) / 100,
    simulated_sessions_completed: stats.sessions,
    simulated_range: { from: "2026-10-01", to: calendar.istDate(now) },
    iterations: stats.iterations,
    requests: stats.requests,
    responses_by_status: stats.by_status,
    rejection_reasons: stats.rejections,
    server_errors: stats.server_errors.length,
    reconciliation_checkpoints: stats.checkpoints,
    reconciliation_failures: 0,
    orders: final.orders.length,
    filled: final.orders.filter((o) => o.status === "FILLED").length,
    expired_day_orders: stats.expired_orders,
    duplicate_intent_settlements: final.orders.length - intents.size,
    retried_intents_settled_once: dupOrders.length <= stats.sessions + 1,
    route_latency_ms: { p50: pct(50), p95: pct(95), p99: pct(99) },
    heap_mb: { first: stats.heap[0], last: stats.heap.at(-1), max: Math.max(...stats.heap) },
    book_bytes: readFileSync(bookFile).length,
    machine: { platform: platform(), cpu: cpus()[0]?.model, node: process.version },
  };
  assert.equal(report.server_errors, 0, JSON.stringify(stats.server_errors.slice(0, 3)));
  assert.equal(report.duplicate_intent_settlements, 0);
  assert.equal(report.retried_intents_settled_once, true);
  const outDir = new URL("../audit/implementation/soak/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    new URL(`accelerated-soak-${report.generated_at.replaceAll(/[:.]/g, "-")}.json`, outDir),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  assert.equal(
    stats.sessions,
    targetSessions,
    "Incomplete soak: requested session coverage was not reached before the deadline",
  );
  assert.ok(stats.expired_orders > 0, "Incomplete soak: DAY expiry was not exercised");
} finally {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  rmSync(directory, { recursive: true, force: true });
}
