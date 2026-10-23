import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateScreenerCandidate, type ScreenerFilters } from "./screener.ts";

const base: ScreenerFilters = {
  sector: "All",
  minMomentum: 0,
  maxVol: 100,
  minConviction: 0,
  verdict: "ANY",
};

const candidate = {
  sector: "Technology",
  momentum: 82,
  volatility: 24,
  verdict: "BUY",
  conviction: 76,
};

test("screener explains a passing candidate", () => {
  const result = evaluateScreenerCandidate(candidate, {
    ...base,
    sector: "Technology",
    minMomentum: 70,
    maxVol: 30,
    minConviction: 60,
    verdict: "BUY",
  });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, ["Passes all active rules."]);
});

test("screener reports failed rules with observed values", () => {
  const result = evaluateScreenerCandidate(candidate, {
    ...base,
    sector: "Financials",
    minMomentum: 90,
    verdict: "SELL",
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.reasons, [
    "Sector is Technology, not Financials.",
    "Momentum 82 is below 90.",
    "Research verdict is BUY, not SELL.",
  ]);
});

test("missing factors are distinct from failed factors", () => {
  const result = evaluateScreenerCandidate(
    { ...candidate, momentum: null, volatility: null, verdict: "UNAVAILABLE", conviction: null },
    {
      ...base,
      minMomentum: 70,
      maxVol: 30,
      minConviction: 60,
      verdict: "BUY",
    },
  );

  assert.equal(result.status, "MISSING");
  assert.equal(result.reasons.length, 4);
  assert.ok(result.reasons.every((reason) => reason.includes("unavailable")));
});

test("unfiltered missing factors do not hide a candidate", () => {
  const result = evaluateScreenerCandidate(
    { ...candidate, momentum: null, volatility: null, verdict: "UNAVAILABLE", conviction: null },
    base,
  );

  assert.equal(result.status, "PASS");
});
