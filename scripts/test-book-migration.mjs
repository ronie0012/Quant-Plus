import assert from "node:assert/strict";
import { localTestModule } from "./local-test-module.mjs";

const { prepareOwnerMigration } = localTestModule("@/lib/book-migration.server");
const { newBook, fundWallet, reconcile } = localTestModule("@/lib/paper-book/engine");
const { clockAt } = localTestModule("@/lib/paper-book/types");
const clock = clockAt(Date.parse("2026-10-14T05:00:00Z"));
const source = newBook("00000000-0000-4000-8000-000000000001", clock);
fundWallet(source, clock, 1000, "DEPOSIT");
source.trading_preferences.push({ user_id: source.account.user_id, display_name: "Original User" });
source.conversations.push({
  user_id: source.account.user_id,
  messages: [{ text: "Preserve this" }],
});
source.worker = { owner: "old-worker", lease_until: clock.iso, heartbeat_at: clock.iso };
const raw = JSON.stringify(source);
const identity = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "owner@example.com",
  email_verified: true,
  is_project_admin: false,
  is_anonymous: false,
};
const prepared = prepareOwnerMigration(raw, identity, "OWNER@example.com", clock.now);
assert.equal(prepared.state.account.user_id, identity.id);
assert.equal(prepared.state.trading_preferences[0].user_id, identity.id);
assert.equal(prepared.state.conversations[0].user_id, identity.id);
assert.equal(prepared.state.conversations[0].messages[0].text, "Preserve this");
assert.equal(prepared.state.worker.owner, null);
assert.deepEqual(prepared.state.ledger, source.ledger);
assert.equal(prepared.state.events.at(-1).type, "OWNER_MIGRATED");
assert.deepEqual(reconcile(prepared.state), []);
assert.equal(JSON.stringify(source), raw);
for (const invalid of [
  { ...identity, email_verified: false },
  { ...identity, email: "another@example.com" },
  { ...identity, is_anonymous: true },
  { ...identity, is_project_admin: true },
])
  assert.throws(
    () => prepareOwnerMigration(raw, invalid, "owner@example.com"),
    /verified application-user/,
  );
assert.throws(
  () =>
    prepareOwnerMigration(
      JSON.stringify({ ...source, account: { ...source.account, cash_paise: 1 } }),
      identity,
      identity.email,
    ),
  /does not reconcile/,
);
assert.throws(
  () =>
    prepareOwnerMigration(
      JSON.stringify({ ...source, trading_preferences: [{ user_id: "foreign-owner" }] }),
      identity,
      identity.email,
    ),
  /Unexpected owner/,
);
console.log(
  "Owner migration checks passed: verified matching identity, nested ownership, preserved money/history/conversations, source immutability, lease reset, reconciliation and foreign-owner rejection.",
);

const { importEmptyHostedBook } = localTestModule("@/lib/insforge-book.server");
const config = { url: "https://migration.test", apiKey: "private-test-key" };
let requests = 0;
await assert.rejects(
  () =>
    importEmptyHostedBook(config, identity.id, prepared.state, async (url, init) => {
      requests++;
      assert.equal(JSON.parse(init.body).p_expected_version, 0);
      return new Response("BOOK_VERSION_CONFLICT", { status: 409 });
    }),
  /no overwrite/,
);
assert.equal(requests, 1, "migration must not retry over a concurrently initialized destination");
await importEmptyHostedBook(config, identity.id, prepared.state, async (url, init) => {
  if (init.method === "POST") {
    assert.equal(JSON.parse(init.body).p_expected_version, 0);
    return Response.json({ version: 1 });
  }
  return Response.json([
    { version: 1, state: { account: prepared.state.account, ...prepared.state } },
  ]);
});
console.log(
  "Migration commit checks passed: expected-version-zero CAS, no conflict retries, and verified read-back.",
);

const { checkHostedPortfolio } = localTestModule("@/lib/hosted-book-check.server");
let visible = [{ version: 1, state: prepared.state }];
let authStatus = 200;
let bookReads = 0;
const userFetch = async (url, init) => {
  assert.equal(init.headers.Authorization, "Bearer user-jwt");
  assert.equal(init.method, undefined, "check must never write");
  if (url.endsWith("/api/auth/sessions/current"))
    return Response.json({ user: { id: identity.id } }, { status: authStatus });
  bookReads++;
  assert.match(url, /paper_books\?select=version,state&limit=2$/);
  return Response.json(visible);
};
assert.deepEqual(await checkHostedPortfolio(config.url, "user-jwt", userFetch), {
  verified: true,
  cash_paise: 1000,
  holdings: 0,
  orders: 0,
  fills: 0,
});
visible = [];
await assert.rejects(() => checkHostedPortfolio(config.url, "user-jwt", userFetch), /No imported/);
visible = [{ version: 1, state: source }];
await assert.rejects(() => checkHostedPortfolio(config.url, "user-jwt", userFetch), /ownership/);
visible = [
  {
    version: 1,
    state: { ...prepared.state, account: { ...prepared.state.account, cash_paise: 1 } },
  },
];
await assert.rejects(
  () => checkHostedPortfolio(config.url, "user-jwt", userFetch),
  /reconciliation/,
);
authStatus = 401;
const readsBefore = bookReads;
await assert.rejects(() => checkHostedPortfolio(config.url, "user-jwt", userFetch), /Unauthorized/);
assert.equal(bookReads, readsBefore, "invalid identity must not reach portfolio storage");
console.log(
  "User-session import checks passed: owner RLS read, reconciliation, no writes/admin key, missing/foreign/corrupt book and unauthorized rejection.",
);
