// Read-only loopback probe. Never starts research, reads a book, or prints model payloads/keys.
// Run: node scripts/bench-prediction-status.mjs [http://127.0.0.1:8080]
import { performance } from "node:perf_hooks";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:8080");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Prediction status probes must stay on loopback");
const headers = {
  Authorization: process.env["QP_BENCH_AUTHORIZATION"] ?? "Bearer quant-plus-local-workspace",
};
const paths = [
  "/api/agent/stocks/predictions?symbols=RELIANCE%2CHDFCBANK%2CTCS",
  "/api/agent/stocks/RELIANCE/prediction",
];
const measurements = [];
for (const path of paths) {
  const samples = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const started = performance.now();
    try {
      const response = await fetch(new URL(path, base), {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json().catch(() => null);
      const events = Array.isArray(payload?.events) ? payload.events : [];
      const start = events.find((event) => event.stage === "session" && event.status === "running");
      const done = events.findLast((event) => event.stage === "session" && event.status === "done");
      const elapsed = Date.parse(done?.ts) - Date.parse(start?.ts);
      samples.push({
        ms: Math.round((performance.now() - started) * 100) / 100,
        http: response.status,
        state: typeof payload?.status === "string" ? payload.status.split(":")[0] : null,
        completedAvailable:
          payload?.status === "done" || payload?.previous_result?.status === "done",
        analystReports: Object.keys(payload?.reports ?? {}).length,
        savedEvents: Array.isArray(payload?.events) ? payload.events.length : 0,
        snapshots: Object.keys(payload?.predictions ?? {}).length,
        savedSessionWallSpanMs: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null,
      });
    } catch {
      samples.push({
        ms: Math.round((performance.now() - started) * 100) / 100,
        http: null,
        state: "transport-unavailable",
      });
    }
  }
  const warm = samples
    .slice(1)
    .filter((sample) => sample.http === 200)
    .map((sample) => sample.ms)
    .sort((a, b) => a - b);
  if (samples.some((sample) => sample.http !== 200)) process.exitCode = 1;
  measurements.push({
    path,
    first: samples[0],
    warmSamples: samples.slice(1),
    medianWarmMs: warm.length === 5 ? warm[2] : null,
  });
}
console.log(
  JSON.stringify(
    {
      workload: "read-only cached prediction snapshots; first request + five warm reads; 5s cutoff",
      note: "Saved session wall spans can include pauses/restarts; they are not model inference timings.",
      measurements,
    },
    null,
    2,
  ),
);
