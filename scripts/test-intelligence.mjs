import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const source = readFileSync(new URL("../src/routes/api/agent/$.ts", import.meta.url), "utf8")
  .replace(/^import .*\n/, "")
  .split("export const Route =")[0];
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const calls = [];
const exported = {};
// Hosted sessions are verified against InsForge (server-only config in the process env).
Object.assign(process.env, {
  QUANT_PLUS_BOOK_PROVIDER: "insforge",
  INSFORGE_URL: "https://auth.example",
  INSFORGE_API_KEY: "admin-key",
  AGENT_SERVICE_URL: "http://backend.example",
  AGENT_SERVICE_API_KEY: "server-secret",
});
const fakeFetch = async (url, options) => {
  calls.push({ url: String(url), options });
  return Response.json(
    String(url).includes("/api/auth/")
      ? { user: { id: "44444444-4444-4444-8444-444444444444", role: "authenticated" } }
      : { score: null, data_quality: "DEGRADED" },
  );
};
globalThis.fetch = fakeFetch;
new Function("require", "exports", "process", "fetch", code)(
  localTestModule,
  exported,
  process,
  fakeFetch,
);
for (const path of [
  "stocks/RELIANCE/news",
  "stocks/TCS/news-sentiment",
  "stocks/INFY/intelligence",
  "market/sentiment",
  "market/sentiment/history?range=1h",
  "market/intelligence",
  "market/sectors",
  "market/news",
]) {
  calls.length = 0;
  const result = await exported.proxy(
    new Request(`http://frontend/api/agent/${path}`, {
      headers: { Authorization: "Bearer session" },
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(calls[1].url, `http://backend.example/api/v1/${path}`);
  assert.equal(calls[1].options.headers["X-Quantplus-Key"], "server-secret");
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(result.headers.get("X-Quantplus-Key"), null);
  assert.ok(!(await result.text()).includes("server-secret"));
}
for (const path of ["../.env", "market/admin", "stocks/RELIANCE/delete"]) {
  const result = await exported.proxy(
    new Request(`http://frontend/api/agent/${path}`, {
      headers: { Authorization: "Bearer session" },
    }),
  );
  assert.equal(result.status, 404);
}
assert.equal(
  (await exported.proxy(new Request("http://frontend/api/agent/market/sentiment"))).status,
  401,
);
console.log(
  "Intelligence proxy: all endpoints allowlisted, authentication enforced, credentials server-only",
);

// Pure presentation and polling regressions; no browser or provider credentials.
const viewSource = readFileSync(
  new URL("../src/lib/intelligence-view.ts", import.meta.url),
  "utf8",
);
const view = {};
new Function(
  "exports",
  ts.transpileModule(viewSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
)(view);
const news = {
  articles: [
    {
      id: "old",
      relevance_score: 90,
      influences_sentiment: true,
      published_at: "2026-10-19T04:00:00Z",
    },
    {
      id: "unscored",
      relevance_score: 85,
      influences_sentiment: false,
      sentiment: "unavailable",
      published_at: "2026-10-19T05:00:00Z",
    },
    {
      id: "irrelevant",
      relevance_score: 20,
      influences_sentiment: false,
      published_at: "2026-10-19T06:00:00Z",
    },
  ],
  provider_status: { status: "available" },
};
assert.deepEqual(
  view.relevantNews(news).map((a) => a.id),
  ["unscored", "old"],
);
assert.equal(news.articles[0].id, "old", "display sorting must not mutate the shared news cache");
assert.deepEqual(
  view.relevantNews({ ...news, relevance_threshold: 88 }).map((a) => a.id),
  ["old"],
);
assert.deepEqual(view.relevantNews(undefined), []);
assert.match(
  view.newsUnavailableHint({ ...news, provider_status: { status: "unavailable" } }),
  /providers are temporarily unavailable/,
);
assert.match(view.newsUnavailableHint({ ...news, articles: [] }), /returned no recent/);
assert.match(view.newsUnavailableHint(news, true), /backend connection/);
assert.equal(view.sentimentRefreshMs(true), 45_000);
assert.equal(view.sentimentRefreshMs(false), 300_000);
assert.equal(view.sentimentRefreshMs(false, true), 30_000);
assert.match(
  view.priceConfirmationText({ price_confirmation_status: "unavailable_market_closed" }),
  /Market closed/,
);
assert.match(
  view.priceConfirmationText({ price_confirmation_status: "unavailable_news_newer_than_price" }),
  /newer than/,
);
assert.match(
  view.priceConfirmationText({
    price_confirmation_status: "daily_direction_proxy",
    price_confirmation: true,
  }),
  /supports/,
);

let open = true;
const hookExports = {};
const hookSource = readFileSync(
  new URL("../src/hooks/use-intelligence.ts", import.meta.url),
  "utf8",
);
new Function(
  "require",
  "exports",
  ts.transpileModule(hookSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
)((name) => {
  if (name === "react")
    return { useState: (initial) => [initial(), () => {}], useEffect: () => {} };
  if (name === "@tanstack/react-query") return { useQuery: (options) => options };
  if (name.endsWith("market-session")) return { regularNseSession: () => open };
  if (name.endsWith("intelligence-view")) return view;
  if (name.endsWith("intelligence-api")) return { intelligenceFetch: () => {} };
  throw new Error(`Unexpected hook import: ${name}`);
}, hookExports);
const stock = hookExports.useStockNewsSentiment("NSE:RELIANCE-EQ");
assert.deepEqual(stock.queryKey, ["stock-news-sentiment", "RELIANCE", "open"]);
assert.equal(
  stock.refetchInterval({ state: { status: "success", data: { data_quality: "PARTIAL" } } }),
  45_000,
);
assert.equal(stock.refetchInterval({ state: { status: "error" } }), 30_000);
const stockNews = hookExports.useStockNews("RELIANCE");
assert.equal(
  stockNews.refetchInterval({
    state: { status: "success", data: { provider_status: { status: "unavailable" } } },
  }),
  30_000,
);
assert.equal(hookExports.useStockNews("../secret").enabled, false);
const openKey = hookExports.useMarketSentiment().queryKey;
open = false;
assert.notDeepEqual(hookExports.useMarketSentiment().queryKey, openKey);
assert.equal(
  hookExports.useStockNewsSentiment("RELIANCE").refetchInterval({ state: { status: "success" } }),
  300_000,
);
console.log(
  "Intelligence UI: relevant unscored news retained, honest unavailable states, live confirmation cadence and session cache boundaries verified",
);
