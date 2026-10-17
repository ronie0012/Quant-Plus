import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { localTestModule } from "./local-test-module.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
function inspectV2(raw, state) {
  const { reconcile } = localTestModule("@/lib/paper-book/engine");
  const problems = reconcile(state);
  if (problems.length) throw new Error(`Book does not reconcile: ${problems.join("; ")}`);
  return {
    schema: 2,
    sha256: hash(raw),
    orders: state.orders.length,
    fills: state.fills.length,
    holdings: state.holdings.length,
    ledger: state.ledger.length,
    events: state.events.length,
    intents: Object.keys(state.intents ?? {}).length,
    quarantined: state.quarantine.length,
    reconciled: true,
  };
}

export function inspectBook(raw) {
  const state = JSON.parse(raw);
  if (state.version === 2) return inspectV2(raw, state);
  if (state.version !== 1 || !Array.isArray(state.accounts) || state.accounts.length !== 1)
    throw new Error("Unsupported account schema; original file retained");
  const account = state.accounts[0];
  for (const table of [
    "holdings",
    "orders",
    "wallet_transactions",
    "risk_limits",
    "watchlist_items",
    "trading_preferences",
    "price_alerts",
    "trade_journal",
  ])
    if (!Array.isArray(state[table])) throw new Error(`Missing table: ${table}`);
  for (const field of ["wallet_balance", "funds_used", "profit", "total_funds"])
    if (!Number.isFinite(account[field])) throw new Error(`Invalid account field: ${field}`);
  if (account.wallet_balance < 0 || account.funds_used < 0)
    throw new Error("Negative cash or cost basis");
  const ids = new Set();
  for (const order of state.orders) {
    if (!order.id || ids.has(order.id)) throw new Error("Duplicate/missing order ID");
    ids.add(order.id);
  }
  const symbols = new Set();
  const cost = state.holdings.reduce((sum, holding) => {
    if (
      symbols.has(holding.symbol) ||
      !Number.isSafeInteger(holding.quantity) ||
      holding.quantity <= 0 ||
      !Number.isFinite(holding.avg_price) ||
      holding.avg_price <= 0
    )
      throw new Error("Invalid/duplicate holding");
    symbols.add(holding.symbol);
    return sum + holding.quantity * holding.avg_price;
  }, 0);
  if (Math.abs(cost - account.funds_used) > 0.01)
    throw new Error("Holdings cost does not reconcile to funds_used");
  const last = state.wallet_transactions.at(-1);
  if (last && Math.abs(last.balance_after - account.wallet_balance) > 0.01)
    throw new Error("Cash does not reconcile to the last ledger balance");
  return {
    schema: state.version,
    sha256: hash(raw),
    orders: state.orders.length,
    holdings: state.holdings.length,
    intents: Object.keys(state.intents ?? {}).length,
    reconciled: true,
  };
}

export function backupBook(source, destination) {
  const raw = readFileSync(source, "utf8");
  const report = inspectBook(raw);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, raw, { flag: "wx", mode: 0o600 });
  writeFileSync(`${destination}.manifest.json`, JSON.stringify(report, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  return report;
}

export function restoreBook(snapshot, target) {
  const raw = readFileSync(snapshot, "utf8");
  const manifest = JSON.parse(readFileSync(`${snapshot}.manifest.json`, "utf8"));
  const report = inspectBook(raw);
  if (manifest.sha256 !== report.sha256)
    throw new Error("Backup checksum mismatch; target retained");
  mkdirSync(dirname(target), { recursive: true });
  const lock = openSync(`${target}.lock`, "wx", 0o600);
  const temporary = `${target}.${randomUUID()}.restore.tmp`;
  try {
    if (existsSync(target))
      writeFileSync(`${target}.${randomUUID()}.before-restore.bak`, readFileSync(target), {
        flag: "wx",
        mode: 0o600,
      });
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, raw);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, target);
    if (hash(readFileSync(target, "utf8")) !== report.sha256)
      throw new Error("Restore verification failed");
    return report;
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    closeSync(lock);
    unlinkSync(`${target}.lock`);
  }
}

/**
 * Explicitly run the validated v1 -> v2 migration (normally automatic on first
 * access). The v1 original is kept as <book>.v1-<hash>.bak with a report file.
 */
export function migrateBook(source) {
  const previous = process.env.LOCAL_DATA_FILE;
  process.env.LOCAL_DATA_FILE = resolve(source);
  try {
    const store = localTestModule("@/lib/local-store.server");
    const report = store.localDataQuery({ rpc: "book_report" });
    return {
      ...report,
      account: store.localDataQuery({ table: "accounts", operation: "select" })[0],
    };
  } finally {
    if (previous === undefined) delete process.env.LOCAL_DATA_FILE;
    else process.env.LOCAL_DATA_FILE = previous;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, source, destination] = process.argv.slice(2);
  if (
    !source ||
    !["verify", "backup", "restore", "migrate"].includes(action) ||
    (["backup", "restore"].includes(action) && !destination)
  )
    throw new Error(
      "Usage: node scripts/local-book-recovery.mjs verify <book> | migrate <book> | backup <book> <snapshot> | restore <snapshot> <target>",
    );
  const report =
    action === "verify"
      ? inspectBook(readFileSync(source, "utf8"))
      : action === "migrate"
        ? migrateBook(source)
        : action === "backup"
          ? backupBook(source, destination)
          : restoreBook(source, destination);
  console.log(JSON.stringify(report, null, 2));
}
