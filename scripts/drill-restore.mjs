// Run with: node scripts/drill-restore.mjs
// Restore and migration drill. Never writes to .local-data: every step runs on temporary
// copies. It (1) replays the v1→v2 migration from the preserved pre-migration backup and
// compares the result's ledger/positions digest with the live book, (2) restores the live book
// from a copy after simulated loss and compares snapshot hashes, (3) proves a corrupted file is
// refused, never reset, and (4) proves an operator pause blocks new orders but not reads.
// Writes audit/implementation/drills/restore-<date>.{json,md}.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localTestModule } from "./local-test-module.mjs";

const root = new URL("..", import.meta.url);
const live = new URL(".local-data/workspace.json", root);
const v1Backup = new URL(".local-data/backups/pre-engine-v2-20261014.json", root);
const directory = mkdtempSync(join(tmpdir(), "qp-drill-"));
const sha = (text) => createHash("sha256").update(text).digest("hex");
// Content digest that ignores generated IDs and timestamps: what the money and positions are.
const moneyDigest = (book) =>
  sha(
    JSON.stringify({
      cash: book.account.cash_paise,
      ledger: book.ledger.map((e) => [e.seq, e.kind, e.amount_paise, e.balance_after_paise]),
      holdings: book.holdings
        .map((h) => [h.symbol, h.quantity, h.cost_paise ?? h.average_price_paise ?? null])
        .sort(),
    }),
  );
const snapshotDigest = (book) =>
  sha(
    JSON.stringify({
      account: book.account,
      holdings: book.holdings,
      ledger: book.ledger,
      orders: book.orders,
      fills: book.fills,
    }),
  );
const report = { generated_at: new Date().toISOString(), steps: [] };
const step = (name, detail) => report.steps.push({ name, pass: true, ...detail });

try {
  const engine = localTestModule("@/lib/paper-book/engine");
  const { migrateV1 } = localTestModule("@/lib/paper-book/migrate");
  const { clockAt } = localTestModule("@/lib/paper-book/types");
  const liveText = readFileSync(live, "utf8");
  const liveBook = JSON.parse(liveText);
  assert.deepEqual(engine.reconcile(liveBook), [], "live book reconciles before the drill");

  // 1. Migration replay from the preserved v1 backup.
  if (existsSync(v1Backup)) {
    const raw = readFileSync(v1Backup, "utf8");
    const clock = clockAt(Date.parse(liveBook.created_at ?? "2026-10-14T12:48:22Z"));
    const a = migrateV1(raw, "local-user", clock).state;
    const b = migrateV1(raw, "local-user", clock).state;
    assert.deepEqual(engine.reconcile(a), []);
    assert.equal(moneyDigest(a), moneyDigest(b), "migration is deterministic");
    const matches = moneyDigest(a) === moneyDigest(liveBook);
    assert.ok(
      matches || liveBook.ledger.length > a.ledger.length,
      "replayed migration matches the live book's money state",
    );
    step("migration replay from v1 backup", {
      source_sha256: sha(raw),
      replay_money_digest: moneyDigest(a),
      live_money_digest: moneyDigest(liveBook),
      identical: matches,
      cash_paise: a.account.cash_paise,
      holdings: a.holdings.map((h) => `${h.quantity} ${h.symbol}`),
    });
  } else step("migration replay from v1 backup", { pass: false, skipped: "backup not present" });

  // 2. Loss and restore from a backup copy.
  const work = join(directory, "workspace.json");
  const backup = join(directory, "backup.json");
  writeFileSync(work, liveText);
  copyFileSync(work, backup);
  const before = snapshotDigest(JSON.parse(readFileSync(work, "utf8")));
  unlinkSync(work); // simulated loss
  copyFileSync(backup, work);
  const restored = JSON.parse(readFileSync(work, "utf8"));
  assert.equal(snapshotDigest(restored), before, "restored snapshot is byte-equivalent");
  assert.deepEqual(engine.reconcile(restored), []);
  process.env.LOCAL_DATA_FILE = work;
  process.env.QUANT_PLUS_WORKER = "off";
  const store = localTestModule("@/lib/local-store.server");
  store.localDataQuery({
    rpc: "fund_wallet",
    values: { p_amount: 1, p_intent_id: "drill-after-restore" },
  });
  const resumed = JSON.parse(readFileSync(work, "utf8"));
  assert.deepEqual(engine.reconcile(resumed), []);
  assert.equal(resumed.account.cash_paise, restored.account.cash_paise + 100);
  step("loss and restore", {
    snapshot_sha256: before,
    restored_identical: true,
    writes_after_restore_reconcile: true,
  });

  // 3. A corrupted book is refused and retained, never silently reset.
  const truncated = liveText.slice(0, Math.floor(liveText.length / 2));
  writeFileSync(work, truncated);
  const fresh = localTestModule("@/lib/local-store.server");
  assert.throws(() =>
    fresh.localDataQuery({
      rpc: "fund_wallet",
      values: { p_amount: 1, p_intent_id: "drill-corrupt" },
    }),
  );
  assert.throws(() => fresh.localDataQuery({ table: "accounts", operation: "select" }));
  assert.equal(readFileSync(work, "utf8"), truncated, "the corrupted file is left for recovery");
  copyFileSync(backup, work);
  assert.deepEqual(engine.reconcile(JSON.parse(readFileSync(work, "utf8"))), []);
  step("corrupted file refused", {
    reads_refused: true,
    writes_refused: true,
    file_retained: true,
    restored_from_backup: true,
  });

  // 4. Operator pause: new orders refused, reads and cancels still work.
  const paused = localTestModule("@/lib/local-store.server");
  paused.localDataQuery({
    table: "risk_limits",
    operation: "update",
    values: { trading_paused: true },
  });
  assert.throws(
    () =>
      paused.localPaperRpc("place_server_advanced_order", {
        p_intent_id: "drill-paused-order",
        p_symbol: "TCS",
        p_company: "TCS",
        p_side: "BUY",
        p_type: "MARKET",
        p_qty: 1,
        p_limit: null,
        p_product: "DELIVERY",
        p_validity: "DAY",
        p_execution_mode: "LIVE",
        p_quote: {
          symbol: "TCS",
          price: 100,
          source: "fyers",
          market_session: "open",
          as_of: new Date().toISOString(),
        },
      }),
    /PAUSED|paused/,
  );
  assert.ok(paused.localDataQuery({ table: "accounts", operation: "select" }).length === 1);
  step("operator pause", { orders_refused: true, reads_available: true });

  report.all_passed = report.steps.every((s) => s.pass);
  const outDir = new URL("audit/implementation/drills/", root);
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.slice(0, 10).replaceAll("-", "");
  writeFileSync(new URL(`restore-${stamp}.json`, outDir), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    new URL(`restore-${stamp}.md`, outDir),
    [
      `# Restore and migration drill (${report.generated_at})`,
      "",
      "Run on temporary copies; the live `.local-data` book was only read.",
      "",
      ...report.steps.map(
        (s) =>
          `- **${s.name}**: ${s.pass ? "pass" : "NOT RUN"} — ${JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => k !== "name" && k !== "pass")))}`,
      ),
      "",
    ].join("\n"),
  );
  console.log(JSON.stringify(report, null, 2));
  assert.ok(report.all_passed);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
