// Run with: npm run build && node scripts/bench-http.mjs [iterations]
// End-to-end HTTP latency against the built production server (.output) on this machine.
// A local stub stands in for the market-data service so that provider latency is excluded,
// as the roadmap requires; book reads and order acknowledgement include the full server path
// (HTTP, auth, validation, locking, durable write). Appends to audit/implementation/benchmarks/.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { localTestModule } from "./local-test-module.mjs";

const iterations = Number(process.argv[2] ?? 300);
const serverEntry = new URL("../.output/server/index.mjs", import.meta.url);
if (!existsSync(serverEntry)) throw new Error("Run `npm run build` first");
const directory = mkdtempSync(join(tmpdir(), "qp-http-bench-"));
const bookFile = join(directory, "bench.json");
const key = "bench-http-key";
const auth = {
  Authorization: "Bearer quant-plus-local-workspace",
  "Content-Type": "application/json",
};

const calendar = localTestModule("@/lib/exchange-calendar");
const live = calendar.exchangeSession(Date.now()).open;
const mode = live ? "LIVE" : "LAST_SESSION_PRACTICE";

// Seed the books before the server starts (funding goes through the same store code).
process.env.LOCAL_DATA_FILE = bookFile;
const store = localTestModule("@/lib/local-store.server");
for (const book of ["main", "practice"])
  store.localDataQuery({
    rpc: "fund_wallet",
    book,
    values: { p_amount: 10_000_000, p_intent_id: `bench-${book}-fund` },
  });
store.localDataQuery({
  table: "risk_limits",
  operation: "update",
  values: { max_position_pct: 100, max_order_value: 10_000_000, daily_loss_limit: 10_000_000 },
});

const provider = createServer((req, res) => {
  const symbol = decodeURIComponent(req.url.split("/")[4] ?? "TCS");
  const now = Date.now();
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      symbol,
      price: 100,
      bid: 99.95,
      ask: 100.05,
      source: "fyers",
      delayed: false,
      stale: false,
      market_session: live ? "open" : "closed",
      as_of: new Date(live ? now : now - 60 * 60_000).toISOString(),
    }),
  );
});
await new Promise((r) => provider.listen(0, "127.0.0.1", r));
const providerPort = provider.address().port;
const port = 3900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [serverEntry.pathname.replace(/^\/(\w:)/, "$1")], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    LOCAL_DATA_FILE: bookFile,
    QUANT_PLUS_WORKER: "off",
    AGENT_SERVICE_URL: `http://127.0.0.1:${providerPort}`,
    AGENT_SERVICE_API_KEY: key,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const base = `http://127.0.0.1:${port}`;

function percentiles(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    n: sorted.length,
    p50_ms: round(at(50)),
    p95_ms: round(at(95)),
    p99_ms: round(at(99)),
    max_ms: round(sorted.at(-1)),
  };
}
async function measure(fn, count) {
  for (let i = 0; i < 10; i++) await fn(`w${i}`);
  const samples = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await fn(i);
    samples.push(performance.now() - start);
  }
  return percentiles(samples);
}
async function call(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text.slice(0, 200)}`);
  return text;
}

try {
  for (let waited = 0; ; waited += 100) {
    try {
      if ((await fetch(`${base}/`)).status < 500) break;
    } catch {
      /* not listening yet */
    }
    if (waited > 30_000) throw new Error(`Server did not start:\n${serverLog}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  const book = mode === "LIVE" ? undefined : "practice";
  const order = (i) =>
    call("/api/paper/orders", {
      symbol: "TCS",
      side: "BUY",
      quantity: 1,
      intent_id: `bench-http-${i}-00000`,
      ...(mode === "LIVE"
        ? { order_type: "LIMIT", limit_price: 50 }
        : { order_type: "MARKET", execution_mode: mode }),
    });
  const results = {
    [`order_ack_${mode === "LIVE" ? "resting_limit" : "practice_market_fill"}`]: await measure(
      order,
      iterations,
    ),
    read_holdings: await measure(
      () =>
        call("/api/local", { table: "holdings", operation: "select", ...(book ? { book } : {}) }),
      iterations,
    ),
    read_accounts: await measure(
      () =>
        call("/api/local", { table: "accounts", operation: "select", ...(book ? { book } : {}) }),
      iterations,
    ),
    read_orders_page_50: await measure(
      () =>
        call("/api/local", {
          table: "orders",
          operation: "select",
          limit: 50,
          ...(book ? { book } : {}),
        }),
      iterations,
    ),
  };
  const report = {
    generated_at: new Date().toISOString(),
    kind: "end-to-end HTTP against the production build",
    iterations,
    execution_mode: mode,
    book_bytes_at_end: Math.max(
      readFileSync(bookFile).length,
      existsSync(bookFile.replace(/\.json$/, ".practice.json"))
        ? readFileSync(bookFile.replace(/\.json$/, ".practice.json")).length
        : 0,
    ),
    machine: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      memory_gb: Math.round(totalmem() / 2 ** 30),
      node: process.version,
    },
    scope:
      "Client and server on the same machine over loopback; market-data provider replaced by a local stub, so provider and model latency are excluded. Worker off during measurement.",
    targets: { warm_read_p95_ms: 250, order_ack_p95_ms: 500 },
    results,
  };
  const orderKey = Object.keys(results)[0];
  report.meets_targets =
    ["read_holdings", "read_accounts", "read_orders_page_50"].every(
      (k) => results[k].p95_ms < 250,
    ) && results[orderKey].p95_ms < 500;
  const outDir = new URL("../audit/implementation/benchmarks/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.slice(0, 10).replaceAll("-", "");
  writeFileSync(
    new URL(`http-latency-${stamp}.json`, outDir),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const rows = Object.entries(results).map(
    ([k, v]) => `| ${k} | ${v.n} | ${v.p50_ms} | ${v.p95_ms} | ${v.p99_ms} | ${v.max_ms} |`,
  );
  writeFileSync(
    new URL(`http-latency-${stamp}.md`, outDir),
    [
      `# End-to-end HTTP latency (${report.generated_at})`,
      "",
      `Machine: ${report.machine.cpu} (${report.machine.cores} threads), ${report.machine.memory_gb} GB, ${report.machine.platform} ${report.machine.release}, Node ${report.machine.node}. Mode: ${mode}.`,
      "",
      report.scope,
      "",
      "| Operation | n | p50 ms | p95 ms | p99 ms | max ms |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
      `Targets (roadmap, proposed): warm read p95 < 250 ms, order acknowledgement p95 < 500 ms. Met: **${report.meets_targets ? "yes" : "no"}**.`,
      "",
    ].join("\n"),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.meets_targets) process.exitCode = 1;
} finally {
  server.kill();
  provider.close();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(directory, { recursive: true, force: true });
}
