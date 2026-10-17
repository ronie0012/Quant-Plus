// LIVE, opt-in: node scripts/live-insforge-isolation.mjs
// Exercises the linked InsForge project with two throwaway users, then deletes them.
// It temporarily disables email verification and always restores the previous value.
// Reads credentials from .insforge/project.json (never printed). Network required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { localTestModule } from "./local-test-module.mjs";

const project = JSON.parse(
  readFileSync(new URL("../.insforge/project.json", import.meta.url), "utf8"),
);
const base = project.oss_host.replace(/\/$/, "");
const admin = { Authorization: `Bearer ${project.api_key}`, "Content-Type": "application/json" };
// The public anon key (npx -y @insforge/cli secrets get ANON_KEY) authorises sign-up/sign-in.
const anonKey = process.env.INSFORGE_ANON_KEY;
if (!anonKey) throw new Error("Set INSFORGE_ANON_KEY (public anon key) to run this live test");
const anon = { Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" };
const hosted = localTestModule("@/lib/insforge-book.server");
const config = { url: base, apiKey: project.api_key };
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  assert.ok(ok, `${name} ${detail}`);
};

async function call(path, init = {}, headers = admin) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const priorConfig = await call("/api/auth/config");
assert.equal(
  priorConfig.status,
  200,
  `cannot read auth config: ${JSON.stringify(priorConfig.body)}`,
);
const priorVerification = priorConfig.body.requireEmailVerification ?? true;
const created = [];
try {
  const off = await call("/api/auth/config", {
    method: "PUT",
    body: JSON.stringify({ requireEmailVerification: false }),
  });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  const users = [];
  for (const label of ["a", "b"]) {
    const email = `qp-isolation-${label}-${randomUUID().slice(0, 8)}@example.com`;
    const password = `Qp-${randomUUID()}`;
    const signup = await call(
      "/api/auth/users?client_type=server",
      {
        method: "POST",
        body: JSON.stringify({ email, password, name: `Isolation ${label.toUpperCase()}` }),
      },
      anon,
    );
    assert.ok(
      [200, 201].includes(signup.status),
      `signup ${label}: ${JSON.stringify(signup.body)}`,
    );
    const id = signup.body.user?.id;
    created.push(id);
    let token = signup.body.accessToken;
    if (!token) {
      const session = await call(
        "/api/auth/sessions?client_type=server",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
        anon,
      );
      token = session.body.accessToken;
    }
    assert.ok(id && token, `no session for ${label}`);
    users.push({ id, token, auth: { Authorization: `Bearer ${token}` } });
  }
  const [a, b] = users;
  check("verified identity A", (await hosted.verifyInsForgeUser(config, a.token)) === a.id);
  check("verified identity B", (await hosted.verifyInsForgeUser(config, b.token)) === b.id);

  const now = new Date().toISOString();
  const quote = {
    symbol: "RELIANCE",
    price: 100,
    source: "fyers",
    delayed: false,
    stale: false,
    market_session: "open",
    as_of: now,
  };
  const bookA = hosted.hostedBook(config, a.id);
  const bookB = hosted.hostedBook(config, b.id);
  await bookA.query({
    rpc: "fund_wallet",
    values: { p_amount: 100000, p_intent_id: "live-fund-a-1" },
  });
  await bookA.query({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100 },
  });
  const order = await bookA.rpc("place_server_advanced_order", {
    p_intent_id: "live-order-a-1",
    p_symbol: "RELIANCE",
    p_company: "Reliance",
    p_side: "BUY",
    p_type: "MARKET",
    p_qty: 10,
    p_limit: null,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_execution_mode: "LIVE",
    p_quote: quote,
  });
  check("hosted order settles", order.status === "FILLED", order.status);
  const replay = await bookA.rpc("place_server_advanced_order", {
    p_intent_id: "live-order-a-1",
    p_symbol: "RELIANCE",
    p_company: "Reliance",
    p_side: "BUY",
    p_type: "MARKET",
    p_qty: 10,
    p_limit: null,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_execution_mode: "LIVE",
    p_quote: { ...quote, price: 120 },
  });
  check("replay returns original", replay.id === order.id && replay.price === order.price);
  await bookB.query({
    rpc: "fund_wallet",
    values: { p_amount: 5000, p_intent_id: "live-fund-b-1" },
  });
  check("A reconciles", (await bookA.query({ rpc: "book_report" })).reconciliation.length === 0);

  for (const table of [
    "paper_books",
    "paper_ledger",
    "paper_orders",
    "paper_fills",
    "paper_events",
  ]) {
    const ownA = await call(`/api/database/records/${table}?limit=1000`, {}, a.auth);
    check(
      `A reads only own ${table}`,
      ownA.status === 200 && ownA.body.every((r) => r.user_id === a.id) && ownA.body.length > 0,
      `status ${ownA.status}`,
    );
    const crossA = await call(`/api/database/records/${table}?user_id=eq.${b.id}`, {}, a.auth);
    check(`A cannot see B ${table}`, crossA.status === 200 && crossA.body.length === 0);
    const ownB = await call(`/api/database/records/${table}?limit=1000`, {}, b.auth);
    check(
      `B reads only own ${table}`,
      ownB.status === 200 && ownB.body.every((r) => r.user_id === b.id),
    );
  }
  const intents = await call("/api/database/records/paper_intents", {}, a.auth);
  check("intents are not browser-readable", intents.status >= 400);
  const insert = await call(
    "/api/database/records/paper_ledger",
    {
      method: "POST",
      body: JSON.stringify([
        {
          id: randomUUID(),
          user_id: a.id,
          seq: 999,
          kind: "DEPOSIT",
          amount_paise: 1,
          balance_after_paise: 1,
          created_at: now,
        },
      ]),
      headers: { "Content-Type": "application/json" },
    },
    a.auth,
  );
  check("browser cannot write the ledger", insert.status >= 400, `status ${insert.status}`);
  const update = await call(
    `/api/database/records/paper_books?user_id=eq.${a.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ cash_paise: 999999999 }),
      headers: { "Content-Type": "application/json" },
    },
    a.auth,
  );
  check("browser cannot change balances", update.status >= 400, `status ${update.status}`);
  const rpc = await call(
    "/api/database/rpc/paper_commit_book",
    {
      method: "POST",
      body: JSON.stringify({
        p_user_id: a.id,
        p_expected_version: 0,
        p_state: {},
        p_state_sha256: "a".repeat(64),
        p_orders: [],
        p_fills: [],
        p_ledger: [],
        p_events: [],
        p_intents: [],
      }),
      headers: { "Content-Type": "application/json" },
    },
    a.auth,
  );
  check("browser cannot call the commit function", rpc.status >= 400, `status ${rpc.status}`);

  // Two writers committing from the same version: exactly one wins.
  const current = await call(
    `/api/database/records/paper_books?user_id=eq.${b.id}&select=version,state`,
  );
  const { version, state } = current.body[0];
  const commit = () =>
    call("/api/database/rpc/paper_commit_book", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: b.id,
        p_expected_version: version,
        p_state: state,
        p_state_sha256: "b".repeat(64),
        p_orders: [],
        p_fills: [],
        p_ledger: [],
        p_events: [],
        p_intents: [],
      }),
    });
  const outcomes = await Promise.all([commit(), commit()]);
  const wins = outcomes.filter((o) => o.status < 300).length;
  check(
    "compare-and-swap admits one concurrent commit",
    wins === 1,
    JSON.stringify(outcomes.map((o) => o.status)),
  );
  const forged = await call("/api/database/rpc/paper_commit_book", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: b.id,
      p_expected_version: version + 1,
      p_state: {
        ...state,
        account: { ...state.account, cash_paise: state.account.cash_paise + 100 },
      },
      p_state_sha256: "c".repeat(64),
      p_orders: [],
      p_fills: [],
      p_ledger: [],
      p_events: [],
      p_intents: [],
    }),
  });
  check(
    "unreconciled cash is refused by the database",
    forged.status >= 400 && JSON.stringify(forged.body).includes("BOOK_RECONCILIATION_FAILED"),
    JSON.stringify(forged.body).slice(0, 120),
  );
} finally {
  if (created.filter(Boolean).length) {
    const removed = await call("/api/auth/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: created.filter(Boolean) }),
    });
    results.push({
      name: "test users deleted",
      ok: removed.status < 300,
      detail: `status ${removed.status}`,
    });
    const leftovers = await call(
      `/api/database/records/paper_books?user_id=in.(${created.filter(Boolean).join(",")})`,
    );
    results.push({
      name: "test books removed by cascade",
      ok: Array.isArray(leftovers.body) && leftovers.body.length === 0,
    });
  }
  const restore = await call("/api/auth/config", {
    method: "PUT",
    body: JSON.stringify({ requireEmailVerification: priorVerification }),
  });
  results.push({
    name: "email verification restored",
    ok:
      restore.status === 200 &&
      (await call("/api/auth/config")).body.requireEmailVerification === priorVerification,
  });
  console.log(
    JSON.stringify(
      { ran_at: new Date().toISOString(), project: project.project_name, results },
      null,
      2,
    ),
  );
}
