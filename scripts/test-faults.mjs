// Run with: node scripts/test-faults.mjs
// Fault-injection matrix for the local paper book and the paper route:
// concurrent OS-process writers, a writer killed mid-run, an unwritable book file,
// malformed/skewed/out-of-order provider data, provider 429s, and a duplicate intent storm.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "qp-faults-"));
const saved = { ...process.env };
const originalNow = Date.now;
const originalFetch = globalThis.fetch;
const results = [];
const record = (name, detail) => results.push({ name, ...detail });

function child(file, count, label, pause = 0) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [
        new URL("./fault-writer.mjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
        String(count),
        label,
        String(pause),
      ],
      {
        env: { ...process.env, LOCAL_DATA_FILE: file, QUANT_PLUS_WORKER: "off" },
      },
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("exit", (code, signal) => resolve({ code, signal, out, err, proc }));
    proc.on("error", reject);
    child.last = proc;
  });
}

try {
  const engine = localTestModule("@/lib/paper-book/engine");
  const book = (file) => JSON.parse(readFileSync(file, "utf8"));

  // 1. Four OS processes writing one book: every success is recorded exactly once.
  const shared = join(directory, "shared.json");
  const runs = await Promise.all([0, 1, 2, 3].map((i) => child(shared, 40, `p${i}`)));
  for (const run of runs) assert.equal(run.code, 0, run.err);
  const totals = runs.map((r) => JSON.parse(r.out));
  const ok = totals.reduce((t, r) => t + r.ok, 0);
  const state = book(shared);
  assert.deepEqual(engine.reconcile(state), []);
  assert.equal(
    state.ledger.filter((e) => e.kind === "DEPOSIT").length,
    ok,
    "no lost or duplicated updates",
  );
  assert.equal(state.account.cash_paise, ok * 100);
  record("concurrent processes", { writers: 4, attempted: 160, committed: ok, busy: 160 - ok });

  // 2. A writer killed mid-run: the book still parses and reconciles; its lock is recovered later.
  const killed = join(directory, "killed.json");
  const pending = child(killed, 10_000, "victim", 1);
  for (let waited = 0; !existsSync(killed) && waited < 30_000; waited += 50)
    await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 300));
  child.last.kill("SIGKILL");
  const victim = await pending;
  assert.notEqual(victim.code, 0);
  const afterKill = book(killed);
  assert.deepEqual(engine.reconcile(afterKill), []);
  const lockFile = `${killed}.lock`;
  if (existsSync(lockFile)) {
    // Age the orphaned lock past the stale threshold, then a new writer recovers it.
    const { utimesSync } = await import("node:fs");
    const old = new Date(Date.now() - 120_000);
    utimesSync(lockFile, old, old);
  }
  const recovery = await child(killed, 1, "after-kill");
  assert.equal(recovery.code, 0, recovery.err);
  assert.deepEqual(engine.reconcile(book(killed)), []);
  record("writer killed mid-run", {
    deposits_before_kill: afterKill.ledger.length,
    lock_left: existsSync(lockFile),
  });

  // 2b. An orphaned lock from an exited process is recovered; a fresh one is respected.
  const { hostname } = await import("node:os");
  const { utimesSync, readdirSync } = await import("node:fs");
  const exited = await child(join(directory, "unused.json"), 0, "exit");
  const orphan = join(directory, "orphan.json");
  writeFileSync(
    `${orphan}.lock`,
    JSON.stringify({ pid: exited.proc.pid, host: hostname(), created_at: "2026-10-14T00:00:00Z" }),
  );
  const aged = new Date(Date.now() - 120_000);
  utimesSync(`${orphan}.lock`, aged, aged);
  const recovered = await child(orphan, 1, "orphan");
  assert.equal(recovered.code, 0, recovered.err);
  assert.equal(JSON.parse(recovered.out).ok, 1);
  assert.ok(
    readdirSync(directory).some(
      (f) => f.startsWith("orphan.json.lock.") && f.endsWith(".recovered"),
    ),
    "recovered lock is kept for inspection",
  );
  const live = join(directory, "live.json");
  writeFileSync(
    `${live}.lock`,
    JSON.stringify({ pid: process.pid, host: hostname(), created_at: new Date().toISOString() }),
  );
  const blocked = await child(live, 1, "blocked");
  assert.deepEqual(
    JSON.parse(blocked.out),
    { ok: 0, busy: 1 },
    "a live writer's lock is never stolen",
  );
  rmSync(`${live}.lock`);
  record("orphaned lock", { recovered: true, live_lock_respected: true });

  // 3. Unwritable book (stands in for disk-full/permission errors): actionable failure, data intact.
  const readonly = join(directory, "readonly.json");
  process.env.LOCAL_DATA_FILE = readonly;
  process.env.QUANT_PLUS_WORKER = "off";
  const store = localTestModule("@/lib/local-store.server");
  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 100, p_intent_id: "readonly-seed-1" },
  });
  const before = readFileSync(readonly, "utf8");
  chmodSync(readonly, 0o444);
  let failure = null;
  try {
    store.localDataQuery({
      rpc: "fund_wallet",
      values: { p_amount: 1, p_intent_id: "readonly-write-1" },
    });
  } catch (error) {
    failure = error;
  }
  chmodSync(readonly, 0o644);
  assert.ok(failure, "a write to an unwritable book must fail loudly");
  assert.match(String(failure.code ?? failure.message), /EPERM|EACCES|EBUSY/);
  assert.equal(readFileSync(readonly, "utf8"), before, "the book is unchanged");
  assert.equal(
    existsSync(`${readonly}.lock`),
    false,
    "the writer lock is released after the failure",
  );
  record("unwritable book", { error: String(failure.code ?? failure.message) });

  // 4. Provider faults through the real paper route.
  Date.now = () => Date.parse("2026-10-14T05:00:00Z");
  process.env.LOCAL_DATA_FILE = join(directory, "route.json");
  process.env.AGENT_SERVICE_URL = "https://agent.test";
  process.env.AGENT_SERVICE_API_KEY = "fault-key";
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
  const routeStore = localTestModule("@/lib/local-store.server");
  routeStore.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 100000, p_intent_id: "route-fault-fund" },
  });
  routeStore.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100 },
  });
  const good = {
    symbol: "TCS",
    price: 100,
    source: "fyers",
    delayed: false,
    stale: false,
    market_session: "open",
    as_of: new Date(Date.now()).toISOString(),
  };
  const cases = [
    ["HTTP 429 from provider", () => new Response("rate limited", { status: 429 })],
    ["HTTP 500 from provider", () => new Response("boom", { status: 500 })],
    ["malformed JSON", () => new Response("{not json", { status: 200 })],
    ["missing price", () => Response.json({ ...good, price: undefined })],
    ["negative price", () => Response.json({ ...good, price: -5 })],
    ["NaN price", () => new Response('{"symbol":"TCS","price":NaN}', { status: 200 })],
    [
      "clock skew +2 min",
      () => Response.json({ ...good, as_of: new Date(Date.now() + 120_000).toISOString() }),
    ],
    [
      "stale 5 min",
      () => Response.json({ ...good, as_of: new Date(Date.now() - 300_000).toISOString() }),
    ],
    ["wrong symbol", () => Response.json({ ...good, symbol: "INFY" })],
    ["delayed source", () => Response.json({ ...good, source: "yahoo", delayed: true })],
    [
      "network failure",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ];
  let index = 0;
  for (const [name, respond] of cases) {
    globalThis.fetch = async () => respond();
    const response = await route.paper(
      new Request("http://localhost:5173/api/paper/orders", {
        method: "POST",
        headers: {
          Authorization: "Bearer quant-plus-local-workspace",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: "TCS",
          side: "BUY",
          order_type: "MARKET",
          quantity: 1,
          intent_id: `fault-route-${index++}`,
        }),
      }),
    );
    assert.ok([409, 502, 503].includes(response.status), `${name}: ${response.status}`);
    assert.doesNotMatch(
      await response.text(),
      /fault-key|stack|at .*\(/,
      `${name} leaks internals`,
    );
  }
  assert.equal(
    routeStore.localDataQuery({ table: "orders", operation: "select" }).length,
    0,
    "no fault produced an order",
  );
  record("provider faults", { cases: cases.length, orders_created: 0 });

  // 5. Out-of-order ticks never move a mark backwards in time.
  const worker = localTestModule("@/lib/paper-worker.server");
  globalThis.fetch = async () => Response.json(good);
  await route.paper(
    new Request("http://localhost:5173/api/paper/orders", {
      method: "POST",
      headers: {
        Authorization: "Bearer quant-plus-local-workspace",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        order_type: "MARKET",
        quantity: 1,
        intent_id: "fault-mark-base",
      }),
    }),
  );
  await worker.runWorkerTick("fault-worker", async (s) => ({
    ...good,
    symbol: s,
    price: 90,
    as_of: new Date(Date.now() - 30_000).toISOString(),
  }));
  assert.equal(
    routeStore.localDataQuery({ table: "holdings", operation: "select" })[0].last_price,
    100,
    "an older tick does not replace a newer mark",
  );

  // 6. Duplicate-delivery storm: 50 concurrent submissions of one intent settle once.
  const storm = await Promise.all(
    Array.from({ length: 50 }, () =>
      route.paper(
        new Request("http://localhost:5173/api/paper/orders", {
          method: "POST",
          headers: {
            Authorization: "Bearer quant-plus-local-workspace",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol: "TCS",
            side: "BUY",
            order_type: "MARKET",
            quantity: 1,
            intent_id: "fault-storm-intent",
          }),
        }),
      ),
    ),
  );
  const statuses = storm.map((r) => r.status);
  const orders = routeStore
    .localDataQuery({ table: "orders", operation: "select" })
    .filter((o) => o.intent_id === "fault-storm-intent");
  assert.equal(orders.length, 1, "one settlement per intent under concurrent delivery");
  assert.ok(
    statuses.every((s) => s === 200 || s === 409),
    JSON.stringify(statuses),
  );
  record("duplicate delivery storm", {
    requests: 50,
    settlements: orders.length,
    busy: statuses.filter((s) => s === 409).length,
  });

  // 7. Worker restart: a second worker cannot run while the first holds the lease; after the
  // first dies, the lease expires and the replacement takes over without double processing.
  const source2 = async (s) => ({ ...good, symbol: s, as_of: new Date(Date.now()).toISOString() });
  const base = Date.parse("2026-10-14T05:00:30Z"); // the section-5 worker's lease has lapsed
  Date.now = () => base;
  const first = await worker.runWorkerTick("worker-A", source2);
  assert.equal(first.skipped, false);
  const blockedTick = await worker.runWorkerTick("worker-B", source2);
  assert.equal(blockedTick.reason, "LEASE_HELD_BY_OTHER_WORKER");
  Date.now = () => base + 25_000; // worker-A crashed; its 20 s lease lapses
  const takeover = await worker.runWorkerTick("worker-B", source2);
  assert.equal(takeover.skipped, false, "the replacement worker acquires the expired lease");
  const leaseEvents = routeStore
    .localDataQuery({ table: "events", operation: "select" })
    .filter((e) => e.type === "WORKER_LEASE_ACQUIRED" || e.event_type === "WORKER_LEASE_ACQUIRED");
  assert.ok(leaseEvents.length >= 2, "lease handovers are recorded");
  const lateA = await worker.runWorkerTick("worker-A", source2);
  assert.equal(
    lateA.reason,
    "LEASE_HELD_BY_OTHER_WORKER",
    "a revived old worker does not steal the lease back",
  );
  Date.now = () => Date.parse("2026-10-14T05:00:00Z");
  record("worker restart", { takeover: true, handovers_recorded: leaseEvents.length });

  // 8. Revoked provider key: refused cleanly, no order.
  globalThis.fetch = async () => new Response("invalid key", { status: 401 });
  const revoked = await route.paper(
    new Request("http://localhost:5173/api/paper/orders", {
      method: "POST",
      headers: {
        Authorization: "Bearer quant-plus-local-workspace",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        order_type: "MARKET",
        quantity: 1,
        intent_id: "fault-revoked-key",
      }),
    }),
  );
  assert.ok([502, 503].includes(revoked.status), `revoked key: ${revoked.status}`);
  assert.equal(
    routeStore
      .localDataQuery({ table: "orders", operation: "select" })
      .filter((o) => o.intent_id === "fault-revoked-key").length,
    0,
  );

  // 9. Model faults in Quant AI: rejected key, provider error, timeout, malformed and failed
  // streams all end in an error the client can show, never a fabricated answer or a leaked key.
  process.env.OPENROUTER_API_KEY = "fault-model-key";
  process.env.OPENROUTER_BASE_URL = "https://model.fault/api/v1";
  process.env.OPENROUTER_CHAT_MODEL = "fault-model";
  const chatSource = readFileSync(new URL("../src/routes/api/chat.ts", import.meta.url), "utf8");
  const chat = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(chatSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(chat, (name) =>
    name === "@tanstack/react-router" ? { createFileRoute: () => (x) => x } : localTestModule(name),
  );
  const sse = (...frames) =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const f of frames) c.enqueue(new TextEncoder().encode(f));
          c.close();
        },
      }),
      { status: 200 },
    );
  const modelCases = [
    ["model key revoked", () => new Response("no auth", { status: 401 }), 502],
    ["model 500", () => new Response("down", { status: 500 }), 500],
    ["model 429", () => new Response("busy", { status: 429 }), 429],
    [
      "model timeout",
      () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
      502,
    ],
    ["malformed stream", () => sse("data: {not json\n\n", "data: [DONE]\n\n"), "stream-error"],
    [
      "error event mid-stream",
      () =>
        sse(
          'data: {"choices":[{"delta":{"content":"TCS is"}}]}\n\n',
          'data: {"error":{"message":"overloaded"}}\n\n',
        ),
      "stream-error",
    ],
  ];
  const bookBefore = readFileSync(process.env.LOCAL_DATA_FILE, "utf8");
  for (const [name, respond, expected] of modelCases) {
    globalThis.fetch = async (url) =>
      String(url).startsWith("https://model.fault")
        ? respond()
        : new Response("n/a", { status: 503 });
    const reply = await chat.chat(
      new Request("http://localhost:5173/api/chat", {
        method: "POST",
        headers: { Authorization: "Bearer quant-plus-local-workspace" },
        body: JSON.stringify({ message: "How is TCS doing?" }),
      }),
    );
    if (expected === "stream-error") {
      assert.equal(reply.status, 200, name);
      await assert.rejects(
        reply.text(),
        undefined,
        `${name} must error the stream, not finish as an answer`,
      );
    } else {
      assert.equal(reply.status, expected, name);
      assert.doesNotMatch(await reply.text(), /fault-model-key|shorter question/, name);
    }
  }
  const bookAfter = JSON.parse(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"));
  assert.equal(
    bookAfter.orders.length,
    JSON.parse(bookBefore).orders.length,
    "model faults never touch orders",
  );
  record("model faults", { cases: modelCases.length });

  console.log(JSON.stringify({ fault_matrix: results }, null, 2));
  console.log(
    "Fault-injection checks passed: concurrent processes, killed writer, orphaned lock, unwritable book, provider faults, out-of-order ticks, duplicate delivery, worker restart, revoked keys and model faults.",
  );
} finally {
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    /* a killed child may briefly hold a handle on Windows */
  }
}
