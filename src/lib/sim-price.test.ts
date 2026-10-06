// @ts-nocheck -- run with `bun test`
import { describe, expect, it } from "bun:test";
import { alertHit, bracketExit } from "./sim-price";

describe("price alerts", () => {
  it("fires above-alert at or over threshold", () => {
    expect(alertHit("PRICE_ABOVE", 100, 100)).toBe(true);
    expect(alertHit("PRICE_ABOVE", 100, 99.9)).toBe(false);
  });
  it("fires below-alert at or under threshold", () => {
    expect(alertHit("PRICE_BELOW", 100, 100)).toBe(true);
    expect(alertHit("PRICE_BELOW", 100, 100.1)).toBe(false);
  });
});

describe("bracket exits", () => {
  const o = { stop_loss: 90, target_price: 110, trailing_stop: null };
  it("exits at target", () => expect(bracketExit(o, 110, 110)).toBe("TARGET"));
  it("exits at stop-loss", () => expect(bracketExit(o, 90, 100)).toBe("STOP"));
  it("holds between levels", () => expect(bracketExit(o, 100, 100)).toBeNull());
  it("trails from the peak", () =>
    expect(bracketExit({ stop_loss: null, target_price: null, trailing_stop: 5 }, 104, 109)).toBe("TRAIL"));
});
