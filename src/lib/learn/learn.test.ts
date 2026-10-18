import { test } from "node:test";
import assert from "node:assert/strict";
import {
  profileGap,
  QUESTIONS,
  revealedProfile,
  statedProfile,
  type Answers,
  type Trip,
} from "./investor-dna.ts";
import { currentLevel, licenceStages, suggestedLimits, type LicenceEvidence } from "./licence.ts";
import { CONCEPTS, MASTERED, nextConcept, updateMastery } from "./concepts.ts";
import {
  act,
  FOUNDER_SHARES,
  ipoTerms,
  newCompany,
  ownership,
  view,
  type CompanyState,
} from "./company-sim.ts";

const answersAt = (index: number): Answers =>
  Object.fromEntries(
    QUESTIONS.map((q) => [
      q.id,
      q.options.find((o) => o.score === index)?.value ?? q.options[0]!.value,
    ]),
  );

test("stated profile takes the more cautious of capacity and tolerance", () => {
  const bold = statedProfile(answersAt(3));
  assert.equal(bold.complete, true);
  assert.equal(bold.practice, "AGGRESSIVE");
  // High tolerance but no financial cushion → practice profile follows capacity.
  const answers = answersAt(3);
  answers.income = "NONE";
  answers.emergency_fund = "NONE";
  answers.horizon = "UNDER_1Y";
  const mixed = statedProfile(answers);
  assert.equal(mixed.tolerance, "AGGRESSIVE");
  assert.equal(mixed.practice, mixed.capacity);
  assert.notEqual(mixed.capacity, "AGGRESSIVE");
  assert.equal(statedProfile({}).complete, false);
});

test("revealed profile needs a sample and names the disposition effect", () => {
  const trip = (r: number, value: number, heldDays: number): Trip => ({
    return_pct: r,
    entry_value: value,
    entry_at: "2026-01-01T04:00:00Z",
    exit_at: new Date(Date.parse("2026-01-01T04:00:00Z") + heldDays * 86_400_000).toISOString(),
  });
  assert.equal(revealedProfile([trip(1, 1000, 1)], 100_000).level, null);
  const cautious = revealedProfile(
    [
      trip(-1, 2000, 1),
      trip(-1.5, 2000, 1),
      trip(-0.5, 2000, 1),
      trip(2, 2000, 2),
      trip(3, 2000, 2),
    ],
    100_000,
  );
  assert.equal(cautious.level, "CAUTIOUS");
  assert.equal(profileGap("AGGRESSIVE", cautious.level)?.includes("less risk"), true);
  const holder = revealedProfile(
    [
      trip(-12, 30000, 20),
      trip(-9, 30000, 18),
      trip(4, 30000, 2),
      trip(5, 30000, 3),
      trip(-3, 30000, 15),
    ],
    100_000,
  );
  assert.equal(holder.level, "AGGRESSIVE");
  assert.ok(holder.observations.some((o) => o.includes("disposition effect")));
});

test("licence levels are earned in order and never by profit", () => {
  const empty: LicenceEvidence = {
    profile_complete: false,
    company_completed: false,
    replays: [],
    plans: [],
    planned_trips: [],
  };
  assert.equal(currentLevel(licenceStages(empty)), 0);
  const l1 = {
    ...empty,
    profile_complete: true,
    company_completed: true,
    replays: [{ return_pct: -5, buy_and_hold_pct: 2, max_drawdown_pct: -6, finished: true }],
  };
  assert.equal(currentLevel(licenceStages(l1)), 1);
  const plans = Array.from({ length: 10 }, () => ({
    has_stop: true,
    planned_loss_pct: 1.5,
    decision: "TRADE" as const,
  }));
  assert.equal(currentLevel(licenceStages({ ...l1, plans })), 2);
  // Stops without discipline (one trade blew through its plan) do not earn L3.
  const crash = { return_pct: -3, buy_and_hold_pct: -15, max_drawdown_pct: -6, finished: true };
  const trips = Array.from({ length: 5 }, () => ({ loss: 900, max_acceptable_loss: 1000 }));
  const l3 = { ...l1, plans, replays: [...l1.replays, crash], planned_trips: trips };
  assert.equal(currentLevel(licenceStages(l3)), 3);
  const broken = { ...l3, planned_trips: [...trips, { loss: 2000, max_acceptable_loss: 1000 }] };
  assert.equal(currentLevel(licenceStages(broken)), 2);
  // Skipping a level is impossible: L2 evidence without L1 stays at Learner.
  assert.equal(currentLevel(licenceStages({ ...empty, plans })), 0);
});

test("suggested limits scale with level and tighten for cautious profiles", () => {
  const learner = suggestedLimits(0, null, 100_000)!;
  const l3 = suggestedLimits(3, null, 100_000)!;
  assert.equal(learner.max_order_value, 5000);
  assert.ok(l3.max_order_value > learner.max_order_value);
  assert.ok(suggestedLimits(3, "CAUTIOUS", 100_000)!.max_order_value < l3.max_order_value);
  assert.equal(suggestedLimits(1, null, 0), null);
});

test("knowledge tracing raises mastery on correct answers and lowers it on mistakes", () => {
  let p = 0.2;
  for (let i = 0; i < 4; i++) p = updateMastery(p, true);
  assert.ok(p >= MASTERED);
  assert.ok(updateMastery(0.6, false) < 0.6);
  assert.ok(CONCEPTS.every((c) => c.checks.every((k) => k.answer < k.options.length)));
  assert.equal(nextConcept({ share: 0.9 }).id, "ownership");
});

test("company simulation teaches dilution, IPO pricing and reaction to surprises", () => {
  let s: CompanyState = newCompany("Test Chai", 3);
  assert.equal(view(s).concept, "share");
  s = act(s, "NEXT");
  s = act(s, "GIVE_20");
  assert.equal(Math.round(ownership(s) * 100), 80);
  assert.equal(s.founder_shares, FOUNDER_SHARES);
  for (let q = 0; q < 4; q++) s = act(s, "STEADY");
  assert.equal(s.phase, "IPO");
  const terms = ipoTerms(s);
  assert.ok(Math.abs(terms.price - terms.eps * terms.pe) < 0.01);
  s = act(s, "IPO_10");
  assert.equal(s.phase, "LISTED");
  assert.equal(s.share_price, terms.price);
  assert.ok(ownership(s) < 0.8);
  // A disabled choice is ignored.
  assert.equal(act(s, "NOT_A_CHOICE"), s);
  for (let q = 0; q < 4; q++) s = act(s, "STEADY");
  assert.equal(s.phase, "DONE");
  for (const quarter of s.history.filter((h) => h.expected_profit != null)) {
    const prev = s.history[quarter.quarter - 2]!;
    const prevPrice = prev.share_price ?? terms.price;
    const surprise = quarter.profit / quarter.expected_profit! - 1;
    // A clear beat never lowers the price; a clear miss never raises it.
    if (surprise > 0.05) assert.ok(quarter.share_price! > prevPrice);
    if (surprise < -0.05) assert.ok(quarter.share_price! < prevPrice);
  }
  assert.ok(view(s).story.includes("started with"));
  // Deterministic for a seed.
  const replay = [..."x"].reduce(
    (state) => ["NEXT", "GIVE_20", "STEADY", "STEADY", "STEADY", "STEADY"].reduce(act, state),
    newCompany("Test Chai", 3),
  );
  assert.deepEqual(replay.history, s.history.slice(0, 4));
});
