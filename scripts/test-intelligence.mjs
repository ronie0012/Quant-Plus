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
