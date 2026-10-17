// Run with: node scripts/bench-latency.mjs [iterations]
// Local latency benchmark: book reads, order acknowledgement through the real paper route
// (quote fetch stubbed so only local work is measured) and one worker tick. Writes a dated
// JSON + Markdown report with machine details to audit/implementation/benchmarks/.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const iterations = Number(process.argv[2] ?? 300);
const directory = mkdtempSync(join(tmpdir(), "qp-bench-"));
process.env.LOCAL_DATA_FILE = join(directory, "bench.json");
process.env.QUANT_PLUS_WORKER = "off";
process.env.AGENT_SERVICE_URL = "https://agent.bench";
process.env.AGENT_SERVICE_API_KEY = "bench-key";

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
  for (let i = 0; i < Math.min(20, count); i++) await fn(-1 - i); // warm-up
  const samples = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await fn(i);
    samples.push(performance.now() - start);
  }
  return percentiles(samples);
}

try {
  const store = localTestModule("@/lib/local-store.server");
  const source = readFileSync(new URL("../src/routes/api/paper/$.ts", import.meta.url), "utf8");
  const route = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(route, (name) =>
    name === "@tanstack/react-router" ? { createFileRoute: () => (x) => x } : localTestModule(name),
  );
  const worker = localTestModule("@/lib/paper-worker.server");

  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 10_000_000, p_intent_id: "bench-fund-0001" },
  });
  store.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { max_position_pct: 100, max_order_value: 10_000_000, daily_loss_limit: 10_000_000 },
  });

  // Order acknowledgement needs an open session; use a fixed in-session time.
  const realNow = Date.now;
  const open = Date.parse("2026-10-14T05:00:00Z");
  Date.now = () => open;
  const quote = (symbol) => ({
    symbol,
    price: 100,
    bid: 99.95,
    ask: 100.05,
    source: "fyers",
    delayed: false,
    stale: false,
    market_session: "open",
    as_of: new Date(open).toISOString(),
  });
  globalThis.fetch = async (url) =>
    Response.json(quote(String(url).match(/quote\/([A-Z]+)/)?.[1] ?? "TCS"));

  const order = (i) =>
    route
      .paper(
        new Request("http://localhost/api/paper/orders", {
          method: "POST",
          headers: {
            Authorization: "Bearer quant-plus-local-workspace",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol: "TCS",
            side: "BUY",
            order_type: "LIMIT",
            limit_price: 50,
            quantity: 1,
            intent_id: `bench-order-${i}-0000`,
          }),
        }),
      )
      .then((r) => {
        if (r.status !== 200) throw new Error(`order ${i}: ${r.status}`);
      });

  const results = {
    order_ack_resting_limit: await measure(order, iterations),
    read_holdings: await measure(
      () => store.localDataQuery({ table: "holdings", operation: "select" }),
      iterations,
    ),
    read_account: await measure(
      () => store.localDataQuery({ table: "accounts", operation: "select" }),
      iterations,
    ),
    read_orders_page: await measure(
      () => store.localDataQuery({ table: "orders", operation: "select", limit: 50 }),
      iterations,
    ),
    worker_tick: await measure(
      () => worker.runWorkerTick("bench", async (s) => quote(s)),
      Math.min(iterations, 100),
    ),
  };
  Date.now = realNow;

  const book = JSON.parse(readFileSync(process.env.LOCAL_DATA_FILE, "utf8"));
  const report = {
    generated_at: new Date().toISOString(),
    iterations,
    book_size: {
      orders: book.orders.length,
      ledger: book.ledger.length,
      events: book.events.length,
      bytes: readFileSync(process.env.LOCAL_DATA_FILE).length,
    },
    machine: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      memory_gb: Math.round(totalmem() / 2 ** 30),
      node: process.version,
    },
    scope:
      "Local single-user book on the local disk; provider quote fetch stubbed, so network and provider latency are excluded.",
    results,
  };
  const outDir = new URL("../audit/implementation/benchmarks/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.slice(0, 10).replaceAll("-", "");
  writeFileSync(new URL(`latency-${stamp}.json`, outDir), `${JSON.stringify(report, null, 2)}\n`);
  const rows = Object.entries(results).map(
    ([k, v]) => `| ${k} | ${v.n} | ${v.p50_ms} | ${v.p95_ms} | ${v.p99_ms} | ${v.max_ms} |`,
  );
  writeFileSync(
    new URL(`latency-${stamp}.md`, outDir),
    [
      `# Local latency benchmark (${report.generated_at})`,
      "",
      `Machine: ${report.machine.cpu} (${report.machine.cores} threads), ${report.machine.memory_gb} GB, ${report.machine.platform} ${report.machine.release}, Node ${report.machine.node}.`,
      `Book at end: ${report.book_size.orders} orders, ${report.book_size.ledger} ledger entries, ${report.book_size.events} events, ${report.book_size.bytes} bytes.`,
      "",
      report.scope,
      "",
      "| Operation | n | p50 ms | p95 ms | p99 ms | max ms |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
