import { localTestModule } from "../scripts/local-test-module.mjs";

const { checkAnswer } = localTestModule("@/lib/copilot/grounding");
const cases = [
  {
    name: "Sign reversal",
    answer: "The return was -50 percent [P1].",
    evidence: { return_pct: 50 },
    ids: ["P1"],
  },
  {
    name: "Wrong numeric field",
    answer: "The stock price is 500 rupees [Q1].",
    evidence: { price: 100, volume: 500 },
    ids: ["Q1"],
  },
  {
    name: "Unchecked small quantity",
    answer: "You hold 9 shares [P1].",
    evidence: { quantity: 2 },
    ids: ["P1"],
  },
];
for (const item of cases) {
  console.log(
    JSON.stringify({
      ...item,
      report: checkAnswer(item.answer, JSON.stringify(item.evidence), item.ids),
    }),
  );
}
