import { describe, expect, it } from "vitest";
import { alertHit, bracketExit } from "./sim-price";

describe("alert firing", () => {
  it("fires above-alert when price reaches threshold", () => {
    expect(alertHit("PRICE_ABOVE", 100, 100)).toBe(true);
    expect(alertHit("PRICE_ABOVE", 100, 99.9)).toBe(false);
  });
  it("fires below-alert when price drops to threshold", () => {
    expect(alertHit("PRICE_BELOW", 100, 99)).toBe(true);
    expect(alertHit("PRICE_BELOW", 100, 101)).toBe(false);
  });
});

describe("bracket exits", () => {
  const o = { stop_loss: 90, target_price: 110, trailing_stop: null };
  it("exits at target", () => expect(bracketExit(o, 110, 110)).toBe("TARGET"));
  it("exits at stop-loss", () => expect(bracketExit(o, 89, 100)).toBe("STOP"));
  it("holds between levels", () => expect(bracketExit(o, 100, 100)).toBe(null));
  it("trailing stop exits after pullback from peak", () =>
    expect(bracketExit({ stop_loss: null, target_price: null, trailing_stop: 5 }, 104, 109)).toBe("TRAIL"));
});
