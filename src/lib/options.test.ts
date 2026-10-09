// @ts-nocheck -- run with `bun test`
import { describe, expect, it } from "bun:test";
import { blackScholes, payoffAt } from "./options";

describe("options maths", () => {
  it("call delta is between 0 and 1 and put delta between -1 and 0", () => {
    expect(blackScholes("CE", 100, 100, 0.1, 0.2).delta).toBeGreaterThan(0.5);
    expect(blackScholes("PE", 100, 100, 0.1, 0.2).delta).toBeLessThan(0);
  });
  it("long call payoff loses the premium below strike", () => {
    expect(payoffAt([{ kind: "CE", strike: 100, side: "BUY", lots: 1, premium: 5 }], 90, 10)).toBe(-50);
  });
  it("long call gains above strike minus premium", () => {
    expect(payoffAt([{ kind: "CE", strike: 100, side: "BUY", lots: 1, premium: 5 }], 120, 10)).toBe(150);
  });
});
