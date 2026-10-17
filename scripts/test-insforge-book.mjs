// Run with: node scripts/test-insforge-book.mjs
// Hosted-book adapter against an in-process fake of the InsForge REST surface that
// enforces the same compare-and-swap, append-only and reconciliation rules as
// migrations/20261014130103_create-paper-book.sql. It does not prove the live
// database's RLS; see IMPLEMENTATION_STATUS.md for the live checks performed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const originalNow = Date.now;
Date.now = () => Date.parse("2026-10-14T05:00:00Z");
const hosted = localTestModule("@/lib/insforge-book.server");
const config = { url: "https://fake.insforge.test", apiKey: "admin-key" };
const USERS = {
  "token-a": "11111111-1111-4111-8111-111111111111",
  "token-b": "22222222-2222-4222-8222-222222222222",
};

function fakeInsForge() {
  const books = new Map();
  const ledger = [];
  const events = [];
  const fills = [];
  const orders = new Map();
  const intents = new Set();
  let interfere = null;
  const commits = { ok: 0, conflicts: 0 };
  const fetch = async (url, init = {}) => {
    const href = new URL(String(url));
    const auth = new Headers(init.headers).get("Authorization");
    if (href.pathname === "/api/auth/sessions/current") {
      const token = auth?.replace("Bearer ", "");
      if (token === "token-admin-role")
        return Response.json({ user: { id: USERS["token-a"], role: "project_admin" } });
      return USERS[token]
        ? Response.json({
            user: { id: USERS[token], email: "x@example.test", profile: { name: "T" } },
          })
        : new Response('{"error":"AUTH_UNAUTHORIZED"}', { status: 401 });
    }
    assert.equal(
      auth,
      "Bearer admin-key",
      "Book storage is only reached with the server admin key",
    );
    if (href.pathname === "/api/database/records/paper_books") {
      const user = href.searchParams.get("user_id")?.replace("eq.", "");
      if (!user) return Response.json([...books.keys()].map((user_id) => ({ user_id })));
      const row = books.get(user);
      return Response.json(
        row ? [{ version: row.version, state: structuredClone(row.state) }] : [],
      );
    }
    if (href.pathname === "/api/database/rpc/paper_commit_book") {
      const body = JSON.parse(init.body);
      if (interfere) {
        const action = interfere;
        interfere = null;
        await action();
      }
      const current = books.get(body.p_user_id);
      if ((current?.version ?? 0) !== body.p_expected_version) {
        commits.conflicts++;
        return new Response('{"message":"BOOK_VERSION_CONFLICT"}', { status: 400 });
      }
      if (body.p_state.account.user_id !== body.p_user_id)
        return new Response('{"message":"BOOK_OWNER_MISMATCH"}', { status: 400 });
      for (const row of body.p_ledger) {
        if (ledger.some((e) => e.user_id === body.p_user_id && e.seq === row.seq))
          return new Response('{"message":"duplicate ledger seq"}', { status: 409 });
      }
      for (const row of body.p_intents) {
        const key = `${body.p_user_id}:${row.intent_id}`;
        if (intents.has(key))
          return new Response('{"message":"duplicate intent"}', { status: 409 });
      }
      for (const row of body.p_ledger) ledger.push({ ...row, user_id: body.p_user_id });
      for (const row of body.p_events) events.push({ ...row, user_id: body.p_user_id });
      for (const row of body.p_fills) fills.push({ ...row, user_id: body.p_user_id });
      for (const row of body.p_orders) orders.set(row.id, { ...row, user_id: body.p_user_id });
      for (const row of body.p_intents) intents.add(`${body.p_user_id}:${row.intent_id}`);
      const cash = ledger
        .filter((e) => e.user_id === body.p_user_id)
        .reduce((t, e) => t + e.amount_paise, 0);
      if (cash !== body.p_state.account.cash_paise)
        return new Response('{"message":"BOOK_RECONCILIATION_FAILED"}', { status: 400 });
      books.set(body.p_user_id, { version: (current?.version ?? 0) + 1, state: body.p_state });
      commits.ok++;
      return Response.json(books.get(body.p_user_id).version);
    }
    throw new Error(`unexpected fake InsForge request ${href.pathname}`);
  };
  return {
    fetch,
    books,
    ledger,
    fills,
    orders,
    commits,
    setInterference: (action) => (interfere = action),
  };
}

const quote = (symbol, price) => ({
  symbol,
  price,
  source: "fyers",
  delayed: false,
  stale: false,
  market_session: "open",
  as_of: new Date(Date.now()).toISOString(),
});
const place = (overrides = {}) => ({
  p_intent_id: `intent-${Math.random().toString(16).slice(2)}`,
  p_symbol: "RELIANCE",
  p_company: "Reliance",
  p_side: "BUY",
  p_type: "MARKET",
  p_qty: 10,
  p_limit: null,
  p_product: "DELIVERY",
  p_validity: "DAY",
  p_execution_mode: "LIVE",
  p_quote: quote("RELIANCE", 100),
  ...overrides,
});

try {
  const fake = fakeInsForge();
  // Identity comes only from the verified session, never from client input.
  assert.equal(
    await hosted.verifyInsForgeUser(config, "token-a", undefined, fake.fetch),
    USERS["token-a"],
  );
  await assert.rejects(
    hosted.verifyInsForgeUser(config, "forged", undefined, fake.fetch),
    /Unauthorized/,
  );
  await assert.rejects(
    hosted.verifyInsForgeUser(config, "token-admin-role", undefined, fake.fetch),
    /Unauthorized/,
  );
  assert.equal(hosted.insforgeBookConfig({}), null, "Hosted books are disabled unless configured");
  assert.equal(
    hosted.insforgeBookConfig({
      QUANT_PLUS_BOOK_PROVIDER: "insforge",
      INSFORGE_URL: "https://x/",
      INSFORGE_API_KEY: "k",
    }).url,
    "https://x",
  );

  const a = hosted.hostedBook(config, USERS["token-a"], fake.fetch);
  const b = hosted.hostedBook(config, USERS["token-b"], fake.fetch);
  await a.query({ rpc: "fund_wallet", values: { p_amount: 100000, p_intent_id: "fund-a-0001" } });
  await b.query({ rpc: "fund_wallet", values: { p_amount: 5000, p_intent_id: "fund-b-0001" } });
  await a.query({ table: "risk_limits", operation: "update", values: { max_position_pct: 100 } });
  const order = await a.rpc(
    "place_server_advanced_order",
    place({ p_intent_id: "intent-a-order-1" }),
  );
  assert.equal(order.status, "FILLED");
  assert.deepEqual(
    await a.rpc(
      "place_server_advanced_order",
      place({ p_intent_id: "intent-a-order-1", p_quote: quote("RELIANCE", 120) }),
    ),
    order,
    "Replays return the original result",
  );
  assert.equal((await a.query({ table: "holdings", operation: "select" }))[0].quantity, 10);
  assert.equal(
    (await b.query({ table: "holdings", operation: "select" })).length,
    0,
    "Users are isolated",
  );
  assert.equal((await b.query({ table: "accounts", operation: "select" }))[0].wallet_balance, 5000);
  assert.ok(
    fake.ledger.every(
      (row) => row.user_id === USERS["token-a"] || row.user_id === USERS["token-b"],
    ),
  );
  assert.equal(fake.fills.length, 1);
  assert.equal(fake.orders.get(order.id).status, "FILLED");

  // A concurrent writer commits between load and commit: the change re-runs once, settling once.
  const before = fake.commits.conflicts;
  fake.setInterference(async () => {
    await a.query({
      rpc: "fund_wallet",
      values: { p_amount: 1, p_intent_id: "fund-a-concurrent" },
    });
  });
  const second = await a.rpc(
    "place_server_advanced_order",
    place({ p_intent_id: "intent-a-order-2", p_qty: 5 }),
  );
  assert.equal(second.status, "FILLED");
  assert.equal(fake.commits.conflicts, before + 1);
  assert.equal((await a.query({ table: "holdings", operation: "select" }))[0].quantity, 15);
  const report = await a.query({ rpc: "book_report" });
  assert.deepEqual(report.reconciliation, []);
  const ledgerA = fake.ledger.filter((row) => row.user_id === USERS["token-a"]);
  assert.equal(
    new Set(ledgerA.map((row) => row.seq)).size,
    ledgerA.length,
    "Relational ledger sequence is unique",
  );

  // Practice books are local-only.
  await assert.rejects(
    a.rpc("place_server_advanced_order", place({ p_execution_mode: "LAST_SESSION_PRACTICE" })),
    /local-only/,
  );

  // Route level: a hosted token reaches the hosted book only when configured.
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
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    QUANT_PLUS_BOOK_PROVIDER: "insforge",
    INSFORGE_URL: config.url,
    INSFORGE_API_KEY: config.apiKey,
    AGENT_SERVICE_URL: "https://agent.test",
    AGENT_SERVICE_API_KEY: "agent-key",
  });
  globalThis.fetch = async (url, init) =>
    String(url).startsWith("https://agent.test")
      ? Response.json(quote("TCS", 200))
      : fake.fetch(url, init);
  try {
    const response = await route.paper(
      new Request("https://app.example/api/paper/orders", {
        method: "POST",
        headers: { Authorization: "Bearer token-b", "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "TCS",
          side: "BUY",
          order_type: "MARKET",
          quantity: 2,
          intent_id: "route-hosted-1",
        }),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).price, 200);
    assert.equal((await b.query({ table: "holdings", operation: "select" }))[0].symbol, "TCS");
    const forged = await route.paper(
      new Request("https://app.example/api/paper/orders", {
        method: "POST",
        headers: { Authorization: "Bearer forged", "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(forged.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
  console.log(
    "Hosted book checks passed: verified identity, admin-only storage, isolation, replay, compare-and-swap retry, relational projection, reconciliation and hosted route.",
  );
} finally {
  Date.now = originalNow;
}
