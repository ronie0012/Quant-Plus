import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { LOCAL_USER_ID } from "./local-session";
import { newBook } from "./paper-book/engine";
import { migrateV1 } from "./paper-book/migrate";
import { clockAt, type BookState, type Clock } from "./paper-book/types";
import {
  bookFor,
  dataCommand,
  maintain,
  orderById,
  paperCommand,
  queryBookId,
  queryMaintains,
  queryWrites,
  replayIntent,
  type BookId,
} from "./paper-book/commands";

export type { BookId };

const LOCK_WAIT_MS = 3_000;
const STALE_LOCK_MS = 30_000;

export function storePath(book: BookId = "main") {
  const base = resolve(process.env["LOCAL_DATA_FILE"] || ".local-data/workspace.json");
  return book === "main" ? base : `${base.replace(/\.json$/, "")}.${book}.json`;
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Exclusive interprocess writer lock. Waits briefly for a live writer; a lock
 * left by a process that no longer exists on this host is recovered and logged.
 */
function acquireLock(path: string): number {
  const lockPath = `${path}.lock`;
  // Monotonic and wall clocks are used directly; tests may substitute Date.now.
  const deadline = performance.now() + LOCK_WAIT_MS;
  for (;;) {
    let denied: NodeJS.ErrnoException | null = null;
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeFileSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          host: hostname(),
          created_at: new Date().toISOString(),
        }),
      );
      return fd;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // On Windows a lock file that another writer is deleting reports EPERM/EACCES
      // until the delete completes; that is contention, not a permission problem,
      // unless it persists past the deadline.
      if (code === "EPERM" || code === "EACCES") denied = error as NodeJS.ErrnoException;
      else if (code !== "EEXIST") throw error;
    }
    if (denied) {
      if (performance.now() >= deadline) throw denied;
      sleep(15);
      continue;
    }
    try {
      const owner = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number; host?: string };
      const age = new Date().getTime() - statSync(lockPath).mtimeMs;
      if (
        typeof owner.pid === "number" &&
        owner.host === hostname() &&
        owner.pid !== process.pid &&
        age > STALE_LOCK_MS &&
        !processAlive(owner.pid)
      ) {
        renameSync(lockPath, `${lockPath}.${randomUUID()}.recovered`);
        console.warn(`Recovered stale local-book lock from exited process ${owner.pid}`);
        continue;
      }
    } catch {
      /* Unreadable lock content is never removed automatically. */
    }
    if (performance.now() >= deadline) throw new Error("LOCAL_STORE_BUSY");
    sleep(15);
  }
}

function releaseLock(path: string, fd: number) {
  closeSync(fd);
  unlinkSync(`${path}.lock`);
}

function atomicWrite(path: string, contents: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, contents);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function assertBook(state: BookState) {
  for (const key of [
    "holdings",
    "orders",
    "fills",
    "reservations",
    "protections",
    "ledger",
    "events",
    "watchlist_items",
    "trading_preferences",
    "price_alerts",
    "alert_events",
    "trade_journal",
    "conversations",
    "quarantine",
  ] as const)
    if (!Array.isArray(state[key])) throw new Error(`LOCAL_BOOK_INVALID: ${key}`);
  if (!state.account || !Number.isSafeInteger(state.account.cash_paise))
    throw new Error("LOCAL_BOOK_INVALID: account");
}

type Loaded = { state: BookState; original: string | undefined; migrated: boolean };

function load(path: string, clock: Clock, allowMigration: boolean): Loaded {
  let original: string;
  try {
    original = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { state: newBook(LOCAL_USER_ID, clock), original: undefined, migrated: false };
  }
  // A malformed file is never reset; JSON.parse throws and the file is retained.
  const parsed = JSON.parse(original) as { version?: unknown };
  if (parsed.version === 2) {
    assertBook(parsed as BookState);
    return { state: parsed as BookState, original, migrated: false };
  }
  if (parsed.version !== 1) throw new Error("Unsupported local data version");
  if (!allowMigration) throw new Error("LOCAL_BOOK_REQUIRES_MIGRATION");
  const { state, report } = migrateV1(original, LOCAL_USER_ID, clock);
  const sha = createHash("sha256").update(original).digest("hex");
  const backup = `${path}.v1-${sha.slice(0, 16)}.bak`;
  if (!existsSync(backup)) writeFileSync(backup, original, { mode: 0o600, flag: "wx" });
  writeFileSync(
    `${path}.migration-v2-${clock.iso.replace(/[:.]/g, "")}.json`,
    JSON.stringify(report, null, 2),
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  return { state, original, migrated: true };
}

/**
 * Commit `change` atomically. Rejections throw before any write, so the
 * persisted book is unchanged. Readers never take the lock.
 */
export function localTransaction<T>(
  change: (state: BookState, clock: Clock) => T,
  write = true,
  book: BookId = "main",
): T {
  const path = storePath(book);
  const clock = clockAt(Date.now());
  if (!write) {
    try {
      return change(load(path, clock, false).state, clock);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "LOCAL_BOOK_REQUIRES_MIGRATION")
        throw error;
      localTransaction(() => undefined, true, book);
      return change(load(path, clock, false).state, clock);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  const lock = acquireLock(path);
  try {
    const { state, original, migrated } = load(path, clock, true);
    const result = change(state, clock);
    const serialized = JSON.stringify(state);
    if (migrated || serialized !== original) atomicWrite(path, serialized);
    return result;
  } finally {
    releaseLock(path, lock);
  }
}

// ---------------------------------------------------------------- local service

export function localPaperReplay(input: Record<string, unknown>) {
  return localTransaction((state) => replayIntent(state, input), false, bookFor(input));
}

export function localPaperRpc(name: string, input: Record<string, unknown>) {
  const book = bookFor(input);
  // Expiry is maintenance and is committed even if the subsequent command rejects.
  localTransaction(maintain, true, book);
  return localTransaction((state, clock) => paperCommand(state, clock, name, input), true, book);
}

export function localOrder(id: string, book: BookId = "main") {
  localTransaction(maintain, true, book);
  return localTransaction((state) => orderById(state, id), false, book);
}

/** Newest backup artefact beside the local book (pre-migration copies and drills). */
function backupStatus() {
  const base = storePath("main");
  const candidates: string[] = [];
  const folder = dirname(base);
  try {
    for (const name of readdirSync(folder))
      if (name.endsWith(".bak")) candidates.push(resolve(folder, name));
  } catch {
    /* no data folder yet */
  }
  try {
    for (const name of readdirSync(resolve(folder, "backups")))
      candidates.push(resolve(folder, "backups", name));
  } catch {
    /* no backups folder */
  }
  let latest: number | null = null;
  for (const file of candidates) {
    try {
      latest = Math.max(latest ?? 0, statSync(file).mtimeMs);
    } catch {
      /* removed while listing */
    }
  }
  return {
    count: candidates.length,
    last_backup_at: latest == null ? null : new Date(latest).toISOString(),
  };
}

export function localDataQuery(input: Record<string, unknown>): unknown {
  if (input["rpc"] === "backup_status") return backupStatus();
  const book = queryBookId(input);
  if (queryMaintains(input)) localTransaction(maintain, true, book);
  return localTransaction(
    (state, clock) => dataCommand(state, clock, input),
    queryWrites(input),
    book,
  );
}
