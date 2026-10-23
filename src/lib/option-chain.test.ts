import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atmStrike, maxPain, type ChainRow } from "./options.ts";

const side = (oi: number) => ({
  ltp: 1,
  change: 0,
  change_pct: 0,
  oi,
  oi_change: 0,
  volume: 0,
  bid: null,
  ask: null,
});

describe("option chain analytics", () => {
  it("max pain minimises total writer payout across observed open interest", () => {
    const rows: ChainRow[] = [
      { strike: 100, call: side(10), put: side(0) },
      { strike: 110, call: side(10), put: side(10) },
      { strike: 120, call: side(0), put: side(10) },
    ];
    // Settling at 110: calls at 100 pay 10×10, puts at 120 pay 10×10 → 200, the minimum.
    assert.equal(maxPain(rows), 110);
    assert.equal(maxPain([{ strike: 100, call: side(0), put: null }]), null);
  });

  it("finds the at-the-money strike", () => {
    const rows: ChainRow[] = [100, 150, 200].map((strike) => ({ strike, call: null, put: null }));
    assert.equal(atmStrike(rows, 162), 150);
    assert.equal(atmStrike(rows, null), null);
  });
});
