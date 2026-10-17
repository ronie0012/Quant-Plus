// Run with: node scripts/test-paper-trading.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

function evaluate(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(
    exports,
    (name) => dependencies[name] ?? localTestModule(name),
  );
  return exports;
}

let frames = [];
let cancelled = false;
let requestedPath;
let endStream = false;
const paperRequests = [];
const paper = evaluate("../src/lib/paper-trading.ts", {
  "@/lib/agent-api": {
    agentFetch: async (path) => {
      requestedPath = path;
      cancelled = false;
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
            if (endStream) controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    },
  },
  "./workspace-session": {
    workspaceAuthorization: async () => "Bearer test-session-token",
  },
});
// A fixed in-session clock: the shared policy also checks the exchange calendar.
const now = Date.parse("2026-10-14T05:00:00Z");
const originalNow = Date.now;
Date.now = () => now;
const live = {
  symbol: "M&M",
  price: 1500.42,
  source: "fyers",
  stale: false,
  market_session: "open",
  as_of: new Date(now).toISOString(),
};
assert.equal(paper.paperQuoteError(live, now), null);
assert.match(paper.paperQuoteError(null, now), /Waiting/);
for (const price of [0, -1, NaN, Infinity])
  assert.match(paper.paperQuoteError({ ...live, price }, now), /Waiting/);
assert.match(paper.paperQuoteError({ ...live, as_of: "invalid" }, now), /timestamp/);
assert.match(
  paper.paperQuoteError({ ...live, as_of: new Date(now + 120000).toISOString() }, now),
  /timestamp/,
);
assert.match(
  paper.paperQuoteError({ ...live, as_of: new Date(now - 61000).toISOString() }, now),
  /stale/,
);
assert.match(paper.paperQuoteError({ ...live, stale: true }, now), /stale/);
assert.match(paper.paperQuoteError({ ...live, source: "yahoo", delayed: true }, now), /Live Fyers/);
assert.match(paper.paperQuoteError({ ...live, market_session: "closed" }, now), /closed/);
assert.equal(
  paper.paperQuoteError({ ...live, market_session: "closed" }, now, "LAST_SESSION_PRACTICE"),
  null,
);
assert.match(
  paper.paperQuoteError(
    { ...live, market_session: "closed", as_of: "2020-01-01" },
    now,
    "LAST_SESSION_PRACTICE",
  ),
  /stale/,
);
assert.match(paper.paperQuoteError({ ...live, error: "Feed offline" }, now), /Feed offline/);
const holiday = Date.parse("2026-10-20T05:00:00Z");
assert.match(
  paper.paperQuoteError({ ...live, as_of: new Date(holiday).toISOString() }, holiday),
  /Dussehra/,
);

// Heartbeats, wrong symbols, stale initial snapshots, and frames split across chunks.
const validFrame = `data: ${JSON.stringify(live)}\r\n\r\n`;
frames = [
  ": connected\r\n\r\n",
  `data: ${JSON.stringify({ ...live, symbol: "TCS" })}\n\n`,
  `data: ${JSON.stringify({ ...live, stale: true })}\n\n`,
  validFrame.slice(0, -3),
  validFrame.slice(-3),
];
assert.equal((await paper.paperTradingQuote("M&M")).price, live.price);
assert.equal(requestedPath, "market/M%26M/stream");
assert.equal(cancelled, true, "Submission stream must be closed after obtaining a quote");

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  paperRequests.push({ url: String(input), init });
  return new Response(JSON.stringify({ id: "paper-order", status: "FILLED", price: live.price }), {
    headers: { "Content-Type": "application/json" },
  });
};
const orders = evaluate("../src/hooks/use-orders.ts", {
  "@tanstack/react-query": {
    useQueryClient: () => ({ invalidateQueries() {} }),
    useMutation: (options) => options,
  },
  "@/lib/paper-trading": paper,
  "@/lib/workspace-api": {
    selectRows: async () => [],
    selectOne: async () => null,
    selectPage: async () => ({ rows: [] }),
    workspaceRpc: async () => ({}),
  },
});
const place = orders.usePlaceOrder();
await place.mutationFn({ symbol: "M&M", side: "BUY", order_type: "MARKET", quantity: 2, price: 1 });
assert.equal(paperRequests[0].url, "/api/paper/orders");
const marketBody = JSON.parse(paperRequests[0].init.body);
assert.equal(marketBody.price, undefined, "The browser must not send an execution price");
assert.equal(marketBody.quantity, 2);
await place.mutationFn({
  symbol: "M&M",
  side: "SELL",
  order_type: "LIMIT",
  quantity: 1,
  price: 1,
  limit_price: 1600,
});
assert.equal(paperRequests[1].url, "/api/paper/orders");
assert.equal(JSON.parse(paperRequests[1].init.body).limit_price, 1600);
await assert.rejects(place.mutationFn({ quantity: 1.5 }), /INVALID_QUANTITY/);
const update = orders.useUpdateOrder();
await update.mutationFn({ id: "paper-order", status: "FILLED" });
assert.equal(paperRequests[2].url, "/api/paper/orders/paper-order/fill");
await update.mutationFn({ id: "paper-order", status: "CANCELLED" });
assert.equal(paperRequests[3].url, "/api/paper/orders/paper-order/cancel");
await assert.rejects(
  update.mutationFn({ id: "paper-order", status: "REJECTED" }),
  /Invalid order action/,
);
globalThis.fetch = async () => new Response("server rejected", { status: 409 });
await assert.rejects(
  place.mutationFn({
    symbol: "M&M",
    side: "BUY",
    order_type: "MARKET",
    quantity: 1,
    price: 1,
  }),
  /server rejected/,
);
globalThis.fetch = originalFetch;
Date.now = originalNow;
console.log(
  "Paper trading checks passed: quote validity, closed-session practice, SSE parsing/cleanup, market-price settlement, trigger preservation and cancellation.",
);

for (const order of [
  { order_type: "LIMIT", limit_price: null },
  { order_type: "STOP", limit_price: -1 },
  { order_type: "MARKET", stop_loss: NaN },
  { order_type: "MARKET", target_price: -1 },
]) {
  await assert.rejects(() =>
    place.mutationFn({
      symbol: "M&M",
      side: "BUY",
      quantity: 1,
      ...order,
    }),
  );
}
