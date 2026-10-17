import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blackScholes, payoffAt } from "./options.ts";

describe("options maths", () => {
  it("call delta is between 0 and 1 and put delta between -1 and 0", () => {
    assert.ok(blackScholes("CE", 100, 100, 0.1, 0.2).delta > 0.5);
    assert.ok(blackScholes("PE", 100, 100, 0.1, 0.2).delta < 0);
  });
  it("long call payoff loses the premium below strike", () => {
    assert.equal(
      payoffAt([{ kind: "CE", strike: 100, side: "BUY", lots: 1, premium: 5 }], 90, 10),
      -50,
    );
  });
  it("long call gains above strike minus premium", () => {
    assert.equal(
      payoffAt([{ kind: "CE", strike: 100, side: "BUY", lots: 1, premium: 5 }], 120, 10),
      150,
    );
  });
});
