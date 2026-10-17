import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveInstruments } from "./entities.ts";
import { checkAnswer, groundingFooter, supportedBy } from "./grounding.ts";

describe("copilot instrument resolution", () => {
  it("never turns ordinary words into tickers", () => {
    const result = resolveInstruments("Tell me about the market please, what about ITC?");
    assert.deepEqual(
      result.resolved.map((r) => r.symbol),
      ["ITC"],
    );
    assert.equal(resolveInstruments("please tell about the news").resolved.length, 0);
  });
  it("resolves company names and aliases and keeps group names ambiguous", () => {
    const names = resolveInstruments("How did infosys and Larsen & Toubro do?");
    assert.deepEqual(names.resolved.map((r) => r.symbol).sort(), ["INFY", "LT"]);
    const group = resolveInstruments("Is tata a good group to study?");
    assert.equal(group.resolved.length, 0);
    assert.ok(group.ambiguous[0]!.candidates.includes("TATASTEEL"));
    const specific = resolveInstruments("compare tata steel with hdfc bank");
    assert.deepEqual(specific.resolved.map((r) => r.symbol).sort(), ["HDFCBANK", "TATASTEEL"]);
    assert.equal(specific.ambiguous.length, 0);
  });
  it("prioritises the attached page context", () => {
    assert.equal(resolveInstruments("why is it moving?", "TCS").resolved[0]!.via, "attached");
  });
});

describe("answer grounding", () => {
  const evidence = JSON.stringify({
    price: 2451.35,
    change_pct: -1.237,
    rsi: 61.42,
    cash: 992910.5,
  });
  it("accepts rounded figures present in the evidence", () => {
    assert.equal(supportedBy(2451.4, [2451.35]), true);
    assert.equal(supportedBy(-1.24, [-1.237]), true);
    assert.equal(supportedBy(9.3, [0.093]), false);
    assert.equal(supportedBy(-50, [50]), false);
  });
  it("flags invented figures and unknown citations", () => {
    const report = checkAnswer(
      "Price ₹2,451.35 [Q1], RSI 61.4 [Q1], target 2,900 [Q9].",
      evidence,
      ["Q1"],
    );
    assert.deepEqual(report.unsupported_figures, [2900]);
    assert.deepEqual(report.unknown_citations, ["Q9"]);
    assert.match(groundingFooter(report), /could not verify/);
    assert.match(
      groundingFooter(checkAnswer("Cash is ₹992,910.50 [P1].", evidence, ["P1"])),
      /all 1 figure/,
    );
  });
  it("rejects reversed signs, wrong fields and small invented quantities", () => {
    for (const [answer, data, value] of [
      ["Return was -50 percent [Q1].", { return_pct: 50 }, -50],
      ["Return was −50 percent [Q1].", { return_pct: 50 }, -50],
      ["Return was - 50 percent [Q1].", { return_pct: 50 }, -50],
      ["The stock price is 500 rupees [Q1].", { price: 100, volume: 500 }, 500],
      ["You hold 9 shares [Q1].", { quantity: 2 }, 9],
      ["Return was 50 percent [Q1].", { return_pct: 0.5 }, 50],
      ["Price is 100 percent [Q1].", { price: 100 }, 100],
      ["Return fell 50 percent [Q1].", { return_pct: 50 }, 50],
    ] as const) {
      assert.deepEqual(checkAnswer(answer, JSON.stringify(data), ["Q1"]).unsupported_figures, [
        value,
      ]);
    }
  });
  it("binds field, instrument and citation instead of searching the whole evidence", () => {
    const data = JSON.stringify([
      { id: "Q1", data: { symbol: "TCS", price: 100, volume: 500 } },
      { id: "Q2", data: { symbol: "INFY", price: 500 } },
      { id: "J1", data: { note: "Price is 999" } },
    ]);
    for (const answer of [
      "TCS price 500 [Q1].",
      "TCS price 500 [Q2].",
      "Price 999 [J1].",
      "TCS price 100.",
    ])
      assert.equal(
        checkAnswer(answer, data, ["Q1", "Q2", "J1"]).unsupported_figures.length,
        1,
        answer,
      );
    assert.deepEqual(
      checkAnswer("TCS price 100 [Q1].", data, ["Q1", "Q2"]).unsupported_figures,
      [],
    );
    assert.deepEqual(
      checkAnswer("TCS price 500 [Q1], INFY price 100 [Q2].", data, ["Q1", "Q2"])
        .unsupported_figures,
      [500, 100],
    );
    assert.equal(
      checkAnswer("1. Quantity 2 [P1].", JSON.stringify({ quantity: 2 }), ["P1"]).figures_checked,
      1,
    );
  });
});
