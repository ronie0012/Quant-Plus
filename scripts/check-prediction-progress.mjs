// Start/join ONE local research job with the existing configured providers.
// This may consume model budget. Never forces a cache bypass or places an order.
// Run: node scripts/check-prediction-progress.mjs [RELIANCE]
import { performance } from "node:perf_hooks";

const symbol = (process.argv[2] ?? "RELIANCE").trim().toUpperCase().replace(/\.NS$/, "");
if (!/^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(symbol)) throw new Error("Expected an NSE equity symbol");
const base = "http://127.0.0.1:8080/api/agent/";
const headers = {
  Authorization: process.env["QP_BENCH_AUTHORIZATION"] ?? "Bearer quant-plus-local-workspace",
};
const started = performance.now();
const wallStart = Date.now();
const elapsed = () => Math.round(performance.now() - started);
async function request(path, method) {
  const response = await fetch(base + path, {
    method,
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Research endpoint returned HTTP ${response.status}`);
  return response.json();
}
try {
  let result = await request(`stocks/${encodeURIComponent(symbol)}/prediction`, "POST");
  const cached = result.status === "done";
  const cutoffAge = (wallStart - Date.parse(result.as_of)) / 1000;
  const source = cached ? "cached-completed" : cutoffAge > 5 ? "joined-or-resumed" : "new-cutoff";
  console.log(
    JSON.stringify({
      symbol,
      acceptedMs: elapsed(),
      source,
      previousCompletedAvailable: result.previous_result?.status === "done",
    }),
  );
  let firstFindingsMs = null;
  let signature;
  for (;;) {
    const reports = Object.keys(result.reports ?? {}).length;
    const events = Array.isArray(result.events) ? result.events : [];
    const status = String(result.status ?? "unknown").split(":")[0];
    if (reports && firstFindingsMs == null) firstFindingsMs = elapsed();
    const stage = events.at(-1)?.stage;
    const current = `${status}:${reports}:${events.length}`;
    if (signature !== current) {
      console.log(
        JSON.stringify({
          elapsedMs: elapsed(),
          status,
          reports,
          savedEvents: events.length,
          lastStage: typeof stage === "string" && /^[a-z_]{1,40}$/.test(stage) ? stage : null,
        }),
      );
      signature = current;
    }
    if (status === "done" || status.startsWith("failed")) {
      console.log(
        JSON.stringify({
          outcome: status,
          source,
          firstFindingsMs,
          observedMs: elapsed(),
          freshGenerationMeasured: source === "new-cutoff",
        }),
      );
      if (status !== "done") process.exitCode = 1;
      break;
    }
    if (elapsed() >= 240_000) {
      console.log(
        JSON.stringify({
          outcome: "incomplete-at-240s-cutoff",
          firstFindingsMs,
          observedMs: elapsed(),
          note: "Shared backend job is not cancelled; resume its status in the app.",
        }),
      );
      process.exitCode = 2;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result = await request(`stocks/sessions/${encodeURIComponent(result.id)}`, "GET");
  }
} catch (error) {
  console.log(
    JSON.stringify({
      outcome: "status-unavailable",
      observedMs: elapsed(),
      error: error instanceof Error ? error.name : "Error",
    }),
  );
  process.exitCode = 1;
}
