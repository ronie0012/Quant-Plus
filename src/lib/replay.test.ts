import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { queueOrder, replaySummary, startReplay, step, visibleBars } from "./replay.ts";

const day = (i: number) => Date.parse("2026-04-01T00:00:00Z") / 1000 + i * 86400;
const candles = Array.from({ length: 10 }, (_, i) => ({
  time: day(i),
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 1000,
}));

describe("replay", () => {
  it("never shows bars after the cursor", () => {
    const state = startReplay(candles, 3);
    assert.equal(visibleBars(candles, state).length, 4);
    assert.equal(visibleBars(candles, state).at(-1)!.time, candles[3]!.time);
  });
  it("fills a decision at the next bar's open, not the decision bar", () => {
    let state = queueOrder(startReplay(candles, 3), candles, "BUY", 10);
    assert.equal(state.trades.length, 0, "nothing fills before the next bar exists");
    state = step(state, candles);
    assert.equal(state.trades[0]!.price, 104, "open of bar 4");
    assert.equal(state.trades[0]!.decided_at, candles[3]!.time);
    assert.ok(state.trades[0]!.charges! > 0, "charges from the dated schedule");
    state = step(queueOrder(state, candles, "SELL", 10), candles);
    assert.equal(state.quantity, 0);
    const summary = replaySummary(state, candles);
    assert.equal(summary.bars_elapsed, 2);
    assert.equal(summary.buy_and_hold_pct, Math.round(((106 - 104) / 104) * 10000) / 100);
  });
  it("rejects orders the replay account cannot settle", () => {
    const state = step(queueOrder(startReplay(candles, 0), candles, "SELL", 1), candles);
    assert.match(state.rejected!, /Not enough/);
    assert.throws(
      () => queueOrder(step(startReplay(candles, 0), candles, 20), candles, "BUY", 1),
      /FINISHED/,
    );
  });
  it("reports charges as unknown before the verified schedule's effective date", () => {
    const old = candles.map((c, i) => ({
      ...c,
      time: Date.parse("2025-06-02T00:00:00Z") / 1000 + i * 86400,
    }));
    const state = step(queueOrder(startReplay(old, 1), old, "BUY", 1), old);
    assert.equal(state.trades[0]!.charges, null);
    assert.equal(replaySummary(state, old).charges_unknown, true);
  });
});
