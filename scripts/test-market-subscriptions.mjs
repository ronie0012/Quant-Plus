import assert from "node:assert/strict";
import { localTestModule } from "./local-test-module.mjs";
const { QuoteSubscriptions, normalizeMarketSymbols } = localTestModule(
  "@/lib/market-subscriptions",
);
assert.deepEqual(normalizeMarketSymbols([" tcs.ns ", "TCS", "M&M", "", "bad,name"]), [
  "M&M",
  "TCS",
]);
const calls = [];
const manager = new QuoteSubscriptions(async (path, { signal }) => {
  const call = { path, signal, controller: null };
  calls.push(call);
  return new Response(
    new ReadableStream({
      start(controller) {
        call.controller = controller;
      },
      cancel() {
        call.cancelled = true;
      },
    }),
  );
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
let first, second;
const stopFirst = manager.subscribe(["TCS", "RELIANCE"], (snapshot) => {
  first = snapshot;
});
await tick();
const stopSecond = manager.subscribe(["reliance.ns"], (snapshot) => {
  second = snapshot;
});
await tick();
assert.equal(calls.length, 1, "Overlapping consumers share the active subscription");
const quote = { symbol: "RELIANCE", price: 100, as_of: new Date().toISOString(), source: "fyers" };
calls[0].controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(quote)}\n\n`));
await tick();
assert.equal(first.quotes.RELIANCE.price, 100);
assert.equal(second.quotes.RELIANCE.price, 100);
const older = { ...quote, price: 50, as_of: new Date(Date.now() - 60000).toISOString() };
calls[0].controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(older)}\n\n`));
await tick();
assert.equal(first.quotes.RELIANCE.price, 100, "Out-of-order observations are discarded");
stopSecond();
stopFirst();
await tick();
assert.equal(calls[0].signal.aborted, true);
assert.equal(calls[0].cancelled, true);

const batchCalls = [];
const batching = new QuoteSubscriptions(async (path, { signal }) => {
  batchCalls.push({
    names: new URLSearchParams(path.split("?")[1]).get("symbols").split(","),
    signal,
  });
  return new Response(new ReadableStream({ start() {}, cancel() {} }));
});
const stop = batching.subscribe(
  Array.from({ length: 121 }, (_, i) => `S${i}`),
  () => {},
);
await tick();
assert.equal(batchCalls.length, 3);
assert.deepEqual(
  batchCalls.map((c) => c.names.length),
  [50, 50, 21],
);
stop();
assert(batchCalls.every((c) => c.signal.aborted));
console.log(
  "Market subscription checks passed: normalization, shared consumers, batching, time ordering and release.",
);
