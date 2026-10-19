// Run with: node scripts/test-prediction-polling.mjs
// Real QueryObservers + a virtual clock; all transport is mocked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mock } from "node:test";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const baseline = process.argv.includes("--baseline");
const baselineSource = baseline
  ? execFileSync("git", ["show", "HEAD:src/hooks/use-agent-stock.ts"], { encoding: "utf8" })
  : null;

globalThis.window = {}; // Enable QueryObserver's browser polling in this Node process.
const { QueryClient, QueryObserver, timeoutManager } = await import("@tanstack/react-query");
const epoch = Date.parse("2026-10-19T10:00:00Z");
mock.timers.enable({ apis: ["Date"], now: epoch });
const timers = new Map();
let timerId = 0;
function schedule(callback, delay, repeat = false) {
  const id = ++timerId;
  timers.set(id, { callback, at: Date.now() + delay, delay, repeat });
  return id;
}
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => schedule(callback, delay),
  clearTimeout: (id) => timers.delete(id),
  setInterval: (callback, delay) => schedule(callback, delay, true),
  clearInterval: (id) => timers.delete(id),
});
const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const advance = async (ms) => {
  const end = Date.now() + ms;
  for (;;) {
    const due = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    if (!due || due[1].at > end) break;
    const [id, timer] = due;
    mock.timers.setTime(timer.at);
    if (timer.repeat) timer.at += timer.delay;
    else timers.delete(id);
    timer.callback();
    await settle();
  }
  mock.timers.setTime(end);
  await settle();
};
const prediction = (overrides = {}) => ({
  id: "0123456789abcdef",
  instrument: "RELIANCE.NS",
  as_of: new Date(Date.now()).toISOString(),
  status: "done",
  refresh_seconds: 900,
  analysis_interval: "1d",
  reports: {},
  events: [],
  decision: { action: "hold", rationale: "Saved research", authority: "RESEARCH_ONLY" },
  thesis: null,
  challenge: null,
  proposal: null,
  ...overrides,
});

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const requests = [];
  let options;
  let mutation;
  let mutationResult;
  let preloaded;
  let respond = () => prediction();
  const dependencies = {
    react: { useEffect: (callback) => callback(), useState: (value) => [value, () => {}] },
    "@tanstack/react-query": {
      useQueryClient: () => client,
      useIsMutating: (filters) => client.isMutating(filters),
      useMutation: (value) => {
        mutation = value;
        return {
          mutate: () => (mutationResult = client.getMutationCache().build(client, value).execute()),
          isPending: false,
          error: null,
        };
      },
      useQuery: (value) => {
        options = value;
        return value.queryKey[0] === "prediction-snapshots" ? { data: preloaded } : {};
      },
    },
    "@/lib/agent-api": {
      agentFetch: async (path, request = {}) => {
        requests.push({ path, ...request, at: Date.now() - epoch });
        const result = await respond(path, request);
        return Response.json(result);
      },
    },
  };
  const modules = new Map();
  function load(name) {
    if (dependencies[name]) return dependencies[name];
    if (!name.startsWith("@/hooks/")) return localTestModule(name);
    if (modules.has(name)) return modules.get(name);
    const code = ts.transpileModule(
      name === "@/hooks/use-agent-stock" && baselineSource
        ? baselineSource
        : readFileSync(new URL(`../src/${name.slice(2)}.ts`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const exported = {};
    modules.set(name, exported);
    new Function("exports", "require", code)(exported, load);
    return exported;
  }
  const hooks = load("@/hooks/use-agent-stock");
  return {
    client,
    requests,
    hooks,
    setRespond: (value) => (respond = value),
    setPreloaded: (value) => (preloaded = value),
    options(symbol = "RELIANCE") {
      hooks.useStockPrediction(symbol);
      return options;
    },
    mutation: () => mutation,
    mutationResult: () => mutationResult,
    mount(symbol = "RELIANCE") {
      const observer = new QueryObserver(client, this.options(symbol));
      const unsubscribe = observer.subscribe(() => {});
      return { observer, unsubscribe };
    },
  };
}

try {
  const fresh = harness();
  fresh.client.setQueryData(["agent-prediction", "RELIANCE"], prediction());
  const mounted = fresh.mount();
  mounted.unsubscribe();
  await advance(20_000);
  const remounted = fresh.mount();
  await settle();
  const remountRequests = fresh.requests.length;
  if (!baseline) {
    await remounted.observer.refetch();
    assert.equal(fresh.requests.length, 1);
    assert.equal(fresh.requests[0].method, "GET", "Fresh manual refresh is read-only");
    assert.equal(fresh.requests[0].path, "stocks/RELIANCE/prediction");
  }
  remounted.unsubscribe();
  fresh.client.clear();

  const failed = harness();
  const terminal = prediction({ status: "failed_provider", decision: null });
  failed.client.setQueryData(["agent-prediction", "RELIANCE"], terminal);
  failed.setRespond(() => terminal);
  const failureView = failed.mount();
  await advance(60_000);
  const failedRequests = failed.requests.length;
  failureView.unsubscribe();
  failed.client.clear();

  const network = harness();
  network.client.setQueryData(
    ["agent-prediction", "RELIANCE"],
    prediction({ status: "running", decision: null }),
  );
  network.setRespond(() => {
    throw new Error("Mock offline");
  });
  const offlineView = network.mount();
  await advance(10_000);
  const offlineRequests = network.requests.length;
  offlineView.unsubscribe();
  network.client.clear();

  const metrics = {
    freshRemountPOSTs: remountRequests,
    failedSessionRequests60s: failedRequests,
    offlineProgressRequests10s: offlineRequests,
  };
  console.log(JSON.stringify(metrics));
  if (!baseline) {
    assert.equal(remountRequests, 0, "Fresh research must not POST on a 20-second remount");
    assert.equal(failedRequests, 0, "A failed session must wait for explicit retry");
    assert.equal(offlineRequests, 1, "A failed status read must pause automatic polling");
  }

  // 800-second-old preloaded research with a 900-second TTL expires in 100s,
  // not 900s after a redundant POST that returned the same cached result.
  const cutoff = harness();
  const cached = prediction({ as_of: new Date(Date.now() - 800_000).toISOString() });
  const cutoffStart = Date.now();
  const expires = Date.parse(cached.as_of) + 900_000;
  cutoff.client.setQueryData(["agent-prediction", "RELIANCE"], cached, {
    updatedAt: Date.parse(cached.as_of),
  });
  cutoff.setRespond(() =>
    Date.now() < expires ? cached : prediction({ status: "running", decision: null }),
  );
  const cutoffView = cutoff.mount();
  await settle();
  await advance(baseline ? 900_000 : 100_000);
  const duePost = cutoff.requests.find((request) => request.at + epoch >= expires);
  console.log(
    JSON.stringify({
      cutoffRefreshDetectedMs: duePost?.at + epoch - cutoffStart,
      cutoffRefreshDueMs: 100_000,
      cutoffDetectionLagMs: duePost?.at + epoch - expires,
    }),
  );
  if (!baseline) {
    assert.equal(cutoff.requests.length, 1);
    assert.equal(duePost?.at + epoch - cutoffStart, 100_000);
    assert.equal(duePost.method, "POST");
  }
  cutoffView.unsubscribe();
  cutoff.client.clear();

  if (!baseline) await verifyLifecycle();
} finally {
  mock.timers.reset();
  delete globalThis.window;
}

async function verifyLifecycle() {
  const shared = harness();
  let acceptStart;
  const accepted = new Promise((resolve) => (acceptStart = resolve));
  shared.setRespond(() => accepted);
  const first = shared.mount(" m&m.NS ");
  first.unsubscribe(); // Navigation before the POST response arrives.
  const second = shared.mount("M&M");
  await settle();
  assert.equal(shared.requests.length, 1, "An in-flight start survives subscriber replacement");
  assert.equal(shared.requests[0].path, "stocks/M%26M/prediction");
  assert.equal(shared.requests[0].signal, undefined, "Do not abort an already-accepted job start");
  acceptStart(prediction({ instrument: "M&M.NS", status: "queued", decision: null }));
  await settle();
  await advance(500);
  const third = shared.mount("M&M.NS");
  const progress = prediction({
    instrument: "M&M.NS",
    status: "running",
    decision: null,
    reports: { technical: { agent: "technical", confidence: 0.6, summary: "First saved report" } },
  });
  shared.setRespond(() => progress);
  await advance(500);
  assert.equal(shared.requests.length, 2, "Two subscribers share one progress GET per second");
  assert.equal(shared.requests[1].path, "stocks/sessions/0123456789abcdef");
  assert.equal(shared.requests[1].method, "GET");
  assert.equal(
    second.observer.getCurrentResult().data.reports.technical.summary,
    "First saved report",
  );
  assert.equal(
    third.observer.getCurrentResult().data.reports.technical.summary,
    "First saved report",
  );
  for (let i = 0; i < 10; i++) second.observer.setOptions(shared.options("M&M"));
  await settle();
  assert.equal(shared.requests.length, 2, "Renders do not start requests");
  let finishRead;
  shared.setRespond(() => new Promise((resolve) => (finishRead = resolve)));
  await advance(1_000);
  const getSignal = shared.requests.at(-1).signal;
  await advance(10_000);
  assert.equal(shared.requests.length, 3, "A slow GET does not accumulate overlapping polls");
  second.unsubscribe();
  assert.equal(getSignal.aborted, false, "A remaining subscriber still needs the GET");
  third.unsubscribe();
  assert.equal(getSignal.aborted, true, "Cancel progress reads when the last subscriber leaves");
  finishRead(progress);
  await settle();
  shared.client.clear();

  const preserved = harness();
  const old = prediction({
    as_of: new Date(Date.now() - 1_000_000).toISOString(),
    reports: { old: { agent: "old", confidence: 0.4, summary: "Completed report" } },
  });
  preserved.client.setQueryData(["agent-prediction", "RELIANCE"], old, {
    updatedAt: Date.parse(old.as_of),
  });
  preserved.setRespond(() =>
    prediction({ status: "running", decision: null, previous_result: null }),
  );
  const refreshed = preserved.mount();
  await settle();
  assert.equal(refreshed.observer.getCurrentResult().data.previous_result.as_of, old.as_of);
  preserved.setRespond(() =>
    prediction({
      status: "failed_provider",
      decision: null,
      previous_result: null,
      reports: progress.reports,
    }),
  );
  await advance(1_000);
  const failedData = refreshed.observer.getCurrentResult().data;
  assert.equal(failedData.previous_result.reports.old.summary, "Completed report");
  assert.equal(failedData.reports.technical.summary, "First saved report");
  const beforeWait = preserved.requests.length;
  await advance(60_000);
  assert.equal(preserved.requests.length, beforeWait, "No implicit terminal-state retries");
  let resume;
  preserved.setRespond(() => new Promise((resolve) => (resume = resolve)));
  const control = preserved.hooks.useStockPrediction("RELIANCE");
  control.retryAnalysis();
  control.retryAnalysis();
  await settle();
  assert.equal(preserved.requests.length, beforeWait + 1, "Rapid retry clicks coalesce");
  assert.equal(preserved.requests.at(-1).path, "stocks/RELIANCE/prediction?retry=true");
  assert.equal(
    preserved.hooks.useStockPrediction("RELIANCE").isRetrying,
    true,
    "Retry pending state is shared by all consumers",
  );
  resume(prediction({ status: "queued", decision: null }));
  await preserved.mutationResult();
  assert.equal(refreshed.observer.getCurrentResult().data.previous_result.as_of, old.as_of);
  assert.equal(preserved.hooks.useStockPrediction("RELIANCE").isRetrying, false);
  refreshed.unsubscribe();
  preserved.client.clear();

  const capacity = harness();
  const waiting = prediction({
    as_of: new Date(Date.now() - 3_600_000).toISOString(),
    refresh_seconds: 60,
    serving: { freshness: "stale", refresh_status: "capacity" },
  });
  capacity.client.setQueryData(["agent-prediction", "RELIANCE"], waiting, {
    updatedAt: Date.parse(waiting.as_of),
  });
  capacity.setRespond(() => waiting);
  const waitingView = capacity.mount();
  await settle();
  assert.equal(capacity.requests.length, 1);
  await advance(59_999);
  assert.equal(capacity.requests.length, 1, "Capacity-limited completed research backs off");
  await advance(1);
  assert.equal(capacity.requests.length, 2, "Retry capacity no more than once per minute");
  waitingView.unsubscribe();
  capacity.client.clear();

  const preload = harness();
  const snapshot = prediction({ as_of: new Date(Date.now() - 100_000).toISOString() });
  preload.setPreloaded({ predictions: { "M&M": { ...snapshot, instrument: "M&M.NS" } } });
  preload.hooks.usePredictionPreload(["M&M", " m&m.NS "]);
  assert.equal(
    preload.client.getQueryState(["agent-prediction", "M&M"]).dataUpdatedAt,
    Date.parse(snapshot.as_of),
  );
  preload.client.setQueryData(["agent-prediction", "M&M"], { ...progress, previous_result: null });
  const progressUpdatedAt = preload.client.getQueryState(["agent-prediction", "M&M"]).dataUpdatedAt;
  preload.hooks.usePredictionPreload(["M&M"]);
  const seeded = preload.client.getQueryData(["agent-prediction", "M&M"]);
  assert.equal(seeded.status, "running");
  assert.equal(seeded.previous_result.as_of, snapshot.as_of);
  assert.equal(
    preload.client.getQueryState(["agent-prediction", "M&M"]).dataUpdatedAt,
    progressUpdatedAt,
  );
  preload.client.clear();
  console.log(
    "Prediction lifecycle checks passed: cutoff-aligned refresh in 100000ms; shared POST/GET, partial reports, explicit retry, cancellation and completed-output preservation.",
  );
}
