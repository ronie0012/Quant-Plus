// Run with: node scripts/test-agent-proxy.mjs
// Exercise the actual proxy handler with controlled auth/backend responses.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const source =
  readFileSync(new URL("../src/routes/api/agent/$.ts", import.meta.url), "utf8")
    .replace(/^import .*\n/, "")
    .split("export const Route =")[0] + "\nexport { proxy };";
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
// Hosted tokens are verified against InsForge; the test process env stands in for server config.
const env = process.env;
Object.assign(env, {
  QUANT_PLUS_BOOK_PROVIDER: "insforge",
  INSFORGE_URL: "https://auth.example",
  INSFORGE_API_KEY: "admin-key",
  AGENT_SERVICE_URL: "http://backend.example",
  AGENT_SERVICE_API_KEY: "private-key",
});
const calls = [];
let authStatus = 200;
const exported = {};
const fakeFetch = async (url, options) => {
  calls.push({ url: String(url), options });
  if (String(url).includes("/api/auth/sessions/current"))
    return Response.json(
      { user: { id: "33333333-3333-4333-8333-333333333333", role: "authenticated" } },
      { status: authStatus },
    );
  return Response.json({ status: "queued", id: "test-session" }, { status: 202 });
};
globalThis.fetch = fakeFetch;
new Function("require", "exports", "process", "fetch", code)(
  localTestModule,
  exported,
  process,
  fakeFetch,
);

const request = (path, method = "GET", token = "session-token") =>
  new Request(`http://frontend.example/api/agent/${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
assert.equal((await exported.proxy(request("stocks/RELIANCE/prediction", "POST", ""))).status, 401);
assert.equal(calls.length, 0);
authStatus = 401;
assert.equal((await exported.proxy(request("stocks/RELIANCE/prediction", "POST"))).status, 401);
assert.equal(calls.length, 1);
authStatus = 200;
calls.length = 0;
assert.equal((await exported.proxy(request("killswitch", "POST"))).status, 404);
assert.equal(calls.length, 1);
calls.length = 0;
const response = await exported.proxy(request("stocks/RELIANCE/prediction", "POST"));
assert.equal(response.status, 202);
assert.equal((await response.json()).status, "queued");
assert.equal(calls[0].options.headers.Authorization, "Bearer session-token");
assert.match(calls[0].url, /^https:\/\/auth\.example\/api\/auth\/sessions\/current$/);
assert.equal(calls[1].url, "http://backend.example/api/v1/stocks/RELIANCE/prediction");
assert.equal(calls[1].options.headers["X-Quantplus-Key"], "private-key");
assert.equal(calls[1].options.headers.Authorization, undefined);
assert.equal(response.headers.get("cache-control"), "no-store");
calls.length = 0;
await exported.proxy(request("market/M%26M/history?range=1W"));
assert.equal(calls[1].url, "http://backend.example/api/v1/market/M%26M/history?range=1W");
console.log(
  "Proxy checks passed: auth, allowlist, secret isolation, upstream status and symbol/query forwarding.",
);
calls.length = 0;
assert.equal((await exported.proxy(request("market/A%2F..%2Fhealth/history"))).status, 404);
assert.equal(calls.length, 1);

assert.equal((await exported.proxy(request("market/%ZZ/history"))).status, 400);
calls.length = 0;
assert.equal((await exported.proxy(request("stocks/HDFCBANK/prediction"))).status, 202);
assert.equal(calls[1].options.method, "GET");
calls.length = 0;
await exported.proxy(request("stocks/predictions?symbols=HDFCBANK%2CTCS"));
assert.equal(
  calls[1].url,
  "http://backend.example/api/v1/stocks/predictions?symbols=HDFCBANK%2CTCS",
);
delete env.AGENT_SERVICE_API_KEY;
assert.equal((await exported.proxy(request("fyers/status"))).status, 503);
