// Run with: node scripts/test-prediction-polling.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

let current;
let options;
const requests = [];
const cacheWrites = [];
let preloaded;
const dependencies = {
  react: { useEffect: (callback) => callback() },
  "@tanstack/react-query": {
    useQueryClient: () => ({
      getQueryData: () => current,
      setQueryData(...args) {
        cacheWrites.push(args);
      },
    }),
    useMutation: (options) => options,
    useQuery: (value) => {
      options = value;
      return value.queryKey[0] === "prediction-snapshots" ? { data: preloaded } : {};
    },
  },
  "@/lib/agent-api": {
    agentFetch: async (path, request) => {
      requests.push({ path, ...request });
      return Response.json({ status: "running", id: "0123456789abcdef" });
    },
  },
};
const code = ts.transpileModule(
  readFileSync(new URL("../src/hooks/use-agent-stock.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const exported = {};
new Function("exports", "require", code)(
  exported,
  (name) => dependencies[name] ?? localTestModule(name),
);
exported.useStockPrediction("M&M");
const signal = new AbortController().signal;
await options.queryFn({ signal });
assert.equal(requests[0].method, "POST");
assert.equal(requests[0].path, "stocks/M%26M/prediction");
current = { id: "0123456789abcdef", status: "running" };
await options.queryFn({ signal });
assert.equal(requests[1].method, "GET");
assert.equal(requests[1].path, "stocks/sessions/0123456789abcdef");
assert.equal(requests[1].signal, signal);
assert.equal(options.refetchInterval({ state: { data: current } }), 1000);
current = { status: "done", refresh_seconds: 900 };
assert.equal(options.refetchInterval({ state: { data: current } }), 900000);
await options.queryFn({ signal });
assert.equal(requests[2].method, "POST");
current = undefined;
preloaded = { predictions: { "M&M": { status: "done", as_of: "2026-10-11T10:00:00Z" } } };
exported.usePredictionPreload(["M&M", "M&M"]);
assert.equal(cacheWrites.length, 1);
assert.deepEqual(cacheWrites[0][0], ["agent-prediction", "M&M"]);
assert.equal(cacheWrites[0][2].updatedAt, Date.parse(preloaded.predictions["M&M"].as_of));
await options.queryFn({ signal });
assert.equal(requests.at(-1).path, "stocks/predictions?symbols=M%26M");
assert.equal(requests.at(-1).method, undefined); // read-only GET, never a model job
current = { status: "running" };
exported.usePredictionPreload(["M&M"]);
assert.equal(cacheWrites.length, 1); // older snapshots cannot replace active progress
console.log(
  "Prediction polling checks passed: start, read-only progress, cancellation and provider refresh cadence.",
);
