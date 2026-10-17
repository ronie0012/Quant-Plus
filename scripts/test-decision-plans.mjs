// Decision Plan and research-item guarantees enforced by the local book:
// frozen market snapshot and risk preview, immutable evidence availability
// times, server-recorded risk-level revisions and versioned research history.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localTestModule } from "./local-test-module.mjs";

const previousFile = process.env.LOCAL_DATA_FILE;
const directory = mkdtempSync(join(tmpdir(), "qp-plans-"));
process.env.LOCAL_DATA_FILE = join(directory, "book.json");
const store = localTestModule("@/lib/local-store.server");
const query = (input) => store.localDataQuery(input);

const snapshot = {
  symbol: "RELIANCE",
  price: 2500,
  bid: 2499.9,
  ask: 2500.1,
  change_pct: 0.4,
  volume: 1000,
  source: "fyers",
  as_of: "2026-10-14T05:00:00.000Z",
  captured_at: "2026-10-14T05:00:01.000Z",
  market_session: "open",
  delayed: false,
  stale: false,
};
const plan = {
  plan_version: 1,
  side: "BUY",
  decision: "TRADE",
  expected_outcome: "Clears 2600 within ten sessions",
  counter_thesis: "Energy sector rotation",
  holding_period_days: 10,
  entry: 2500,
  stop: 2450,
  target: 2650,
  time_exit: "2026-10-28T10:00:00.000Z",
  quantity: 20,
  sizing_method: "FIXED_RISK",
  sizing_logic: "Risk 1000 at 50 per share",
  expected_fees: 12,
  expected_slippage: 5,
  max_acceptable_loss: 1000,
  no_trade_reason: "",
  evidence_items: [
    {
      id: "e1",
      claim: "Breakout on 2x volume",
      kind: "OBSERVATION",
      source: "fyers",
      published_at: null,
      available_at: "2026-10-14T05:00:00.000Z",
    },
  ],
  market_snapshot: snapshot,
  risk_preview: null,
  revisions: [{ forged: true }],
  behavior_note: "",
};

try {
  const [created] = query({
    table: "trade_journal",
    operation: "insert",
    values: {
      symbol: "RELIANCE",
      thesis: "Demand recovery",
      invalidation: "Close below 2450",
      plan,
    },
  });
  assert.deepEqual(created.plan.revisions, [], "client-supplied revisions are discarded");

  // Widening the stop is allowed but recorded by the server.
  query({
    table: "trade_journal",
    operation: "update",
    values: { plan: { ...plan, stop: 2400 } },
    filters: [["id", created.id]],
  });
  const [after] = query({ table: "trade_journal", filters: [["id", created.id]] });
  assert.equal(after.plan.revisions.length, 1);
  assert.equal(after.plan.revisions[0].field, "stop");
  assert.equal(after.plan.revisions[0].from, 2450);
  assert.equal(after.plan.revisions[0].to, 2400);

  // A client cannot erase the revision history by resubmitting the plan.
  query({
    table: "trade_journal",
    operation: "update",
    values: { plan: { ...after.plan, revisions: [] } },
    filters: [["id", created.id]],
  });
  const [kept] = query({ table: "trade_journal", filters: [["id", created.id]] });
  assert.equal(kept.plan.revisions.length, 1);

  assert.throws(
    () =>
      query({
        table: "trade_journal",
        operation: "update",
        values: { plan: { ...kept.plan, market_snapshot: { ...snapshot, price: 2400 } } },
        filters: [["id", created.id]],
      }),
    /DECISION_PLAN_IMMUTABLE/,
  );
  assert.throws(
    () =>
      query({
        table: "trade_journal",
        operation: "update",
        values: {
          plan: {
            ...kept.plan,
            evidence_items: [
              { ...plan.evidence_items[0], available_at: "2026-10-13T05:00:00.000Z" },
            ],
          },
        },
        filters: [["id", created.id]],
      }),
    /EVIDENCE_TIME_IMMUTABLE/,
  );
  assert.throws(
    () =>
      query({
        table: "trade_journal",
        operation: "insert",
        values: { symbol: "RELIANCE", thesis: "x", plan: { ...plan, unknown: 1 } },
      }),
    /INVALID_RECORD/,
  );

  // Research items keep every prior version.
  const [memo] = query({
    table: "research_items",
    operation: "insert",
    values: { kind: "MEMO", title: "Energy thesis", body: { text: "v1" } },
  });
  assert.equal(memo.version, 1);
  assert.equal(memo.status, "DRAFT");
  query({
    table: "research_items",
    operation: "update",
    values: { body: { text: "v2" }, status: "IN_REVIEW" },
    filters: [["id", memo.id]],
  });
  const [revised] = query({ table: "research_items", filters: [["id", memo.id]] });
  assert.equal(revised.version, 2);
  assert.equal(revised.history.length, 1);
  assert.deepEqual(revised.history[0].body, { text: "v1" });
  assert.throws(
    () => query({ table: "research_items", operation: "insert", values: { kind: "MEMO" } }),
    /INVALID_RECORD/,
  );

  // Behaviour and workspace preferences validate strictly.
  query({
    table: "trading_preferences",
    operation: "upsert",
    values: {
      behavior: {
        consent: true,
        cooling_off_minutes: 30,
        cooling_off_after_losses: 2,
        max_daily_decisions: 5,
        mandatory_thesis: true,
        drawdown_trigger_pct: 5,
        drawdown_size_pct: 50,
        explain_prompt: true,
      },
      workspace: { mode: "TRADER", review_mode: true },
    },
  });
  const prefs = query({ table: "trading_preferences", singular: true });
  assert.equal(prefs.behavior.consent, true);
  assert.equal(prefs.workspace.review_mode, true);
  assert.throws(
    () =>
      query({
        table: "trading_preferences",
        operation: "upsert",
        values: { workspace: { mode: "GOD" } },
      }),
    /INVALID_RECORD/,
  );
  console.log("decision plans: ok");
} finally {
  if (previousFile === undefined) delete process.env.LOCAL_DATA_FILE;
  else process.env.LOCAL_DATA_FILE = previousFile;
  rmSync(directory, { recursive: true, force: true });
}
