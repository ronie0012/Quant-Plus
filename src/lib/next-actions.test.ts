import assert from "node:assert/strict";
import test from "node:test";
import { buildNextActions } from "./next-actions.ts";

const basePlan = {
  plan_version: 1 as const,
  side: "BUY" as const,
  decision: "TRADE" as const,
  expected_outcome: "Revenue confirms the thesis",
  counter_thesis: "Demand could slow",
  holding_period_days: 5,
  entry: 100,
  stop: 95,
  target: 110,
  time_exit: "2026-10-21T10:00:00.000Z",
  quantity: 10,
  sizing_method: "FIXED_RISK" as const,
  sizing_logic: "Risk one percent of equity",
  expected_fees: 10,
  expected_slippage: 2,
  max_acceptable_loss: 60,
  no_trade_reason: "",
  evidence_items: [
    {
      id: "evidence-1",
      claim: "Observed revenue growth",
      kind: "OBSERVATION" as const,
      source: "Provider",
      published_at: null,
      available_at: "2026-10-17T10:00:00.000Z",
    },
  ],
  market_snapshot: {
    symbol: "TCS",
    price: 100,
    bid: 99.9,
    ask: 100.1,
    change_pct: 1,
    volume: 1000,
    source: "fyers",
    as_of: "2026-10-17T10:00:00.000Z",
    captured_at: "2026-10-17T10:00:01.000Z",
    market_session: "open",
    delayed: false,
    stale: false,
  },
  risk_preview: null,
  revisions: [],
  behavior_note: "",
};

test("next actions prioritise alerts and preserve target routes", () => {
  const actions = buildNextActions({
    now: "2026-10-17T12:00:00.000Z",
    alerts: [
      {
        id: "alert-1",
        symbol: "TCS",
        alert_type: "PRICE_ABOVE",
        threshold: 100,
        note: "Check the breakout",
        enabled: true,
        triggered_at: "2026-10-17T11:00:00.000Z",
        created_at: "2026-10-16T11:00:00.000Z",
      },
    ],
    plans: [
      {
        id: "plan-1",
        order_id: null,
        symbol: "TCS",
        thesis: "Revenue confirms the thesis",
        evidence: [],
        risks: [],
        invalidation: "Revenue falls",
        planned_exit: "",
        reflection: "",
        outcome: "OPEN",
        plan: { ...basePlan, evidence_items: [] },
        created_at: "2026-10-17T10:00:00.000Z",
        updated_at: "2026-10-17T10:00:00.000Z",
      },
    ],
  });

  assert.equal(actions[0]?.id, "alert:alert-1");
  assert.equal(actions[0]?.priority, "high");
  assert.match(actions.find((action) => action.id === "plan:plan-1")?.href ?? "", /plan-1/);
});

test("next actions add a review for a completed decision and stay empty when current", () => {
  const reviewed = buildNextActions({
    now: "2026-10-17T12:00:00.000Z",
    plans: [
      {
        id: "plan-2",
        order_id: "order-2",
        symbol: "INFY",
        thesis: "Margins improve",
        evidence: [],
        risks: [],
        invalidation: "Margins contract",
        planned_exit: "",
        reflection: "",
        outcome: "WIN",
        plan: basePlan,
        created_at: "2026-10-17T10:00:00.000Z",
        updated_at: "2026-10-17T10:00:00.000Z",
      },
    ],
  });
  assert.equal(reviewed[0]?.id, "plan:plan-2:review");
  assert.match(reviewed[0]?.href ?? "", /plan-2/);

  const current = buildNextActions({ now: "2026-10-17T12:00:00.000Z" });
  assert.deepEqual(current, []);
});
