/**
 * Durable local matching worker. It runs inside the Node server process, so
 * resting orders, bracket protections, alerts, marks and DAY expiry continue
 * with every browser tab closed. A lease in the book prevents two server
 * processes from evaluating the same book concurrently; settlement remains
 * idempotent and atomic under the store lock regardless.
 */
import { randomUUID } from "node:crypto";
import { executionQuoteError, type ExecutionQuote } from "./quote-eligibility";
import { fetchProviderQuote, markableQuote } from "./provider-quote.server";
import { localTransaction, type BookId } from "./local-store.server";
import {
  conditionMet,
  ensureRiskDay,
  evaluateAlerts,
  evaluateProtection,
  expireOrders,
  fillRestingOrder,
  markHolding,
  observationFromQuote,
  recordEvent,
  rejectOrder,
  settleCompletedFills,
} from "./paper-book/engine";
import { exchangeSession } from "./exchange-calendar";
import type { BookState, Clock } from "./paper-book/types";

export const WORKER_INTERVAL_MS = 5_000;
const LEASE_MS = 20_000;
const QUOTE_CONCURRENCY = 6;
/** Fill-time risk failures that end a resting order instead of retrying it. */
const TERMINAL_FILL_ERRORS = new Set([
  "TRADING_PAUSED",
  "DAILY_LOSS_LIMIT",
  "ORDER_VALUE_LIMIT",
  "POSITION_VALUE_LIMIT",
  "NO_EQUITY",
  "INSUFFICIENT_FUNDS",
  "INSUFFICIENT_QUANTITY",
]);

export type QuoteSource = (symbol: string) => Promise<ExecutionQuote & Record<string, unknown>>;
export type TickResult = {
  owner: string;
  skipped: boolean;
  reason?: string;
  at: string;
  symbols: number;
  quotes: number;
  quote_errors: Record<string, string>;
  fills: number;
  rejected: number;
  protections_triggered: number;
  protection_errors: number;
  alerts: number;
  expired: number;
  marks: number;
};

/** Run `operation` against the book, restoring the in-memory state if it throws. */
function savepoint<T>(
  state: BookState,
  operation: () => T,
): { ok: true; value: T } | { ok: false; error: string } {
  const snapshot = structuredClone(state);
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    for (const key of Object.keys(snapshot) as (keyof BookState)[])
      (state as Record<string, unknown>)[key] = snapshot[key];
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function neededSymbols(state: BookState) {
  const symbols = new Set<string>();
  for (const order of state.orders)
    if (order.status === "OPEN" || order.status === "PARTIALLY_FILLED") symbols.add(order.symbol);
  for (const protection of state.protections)
    if (protection.status === "ACTIVE") symbols.add(protection.symbol);
  for (const alert of state.price_alerts)
    if (alert["enabled"] === true && !alert["triggered_at"]) symbols.add(String(alert["symbol"]));
  for (const holding of state.holdings) symbols.add(holding.symbol);
  return [...symbols].sort();
}

async function fetchAll(symbols: string[], source: QuoteSource) {
  const quotes = new Map<string, ExecutionQuote & Record<string, unknown>>();
  const errors: Record<string, string> = {};
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(QUOTE_CONCURRENCY, symbols.length) }, async () => {
      while (index < symbols.length) {
        const symbol = symbols[index++]!;
        try {
          quotes.set(symbol, await source(symbol));
        } catch (error) {
          errors[symbol] = error instanceof Error ? error.message : "Quote unavailable";
        }
      }
    }),
  );
  return { quotes, errors };
}

function holdLease(state: BookState, clock: Clock, owner: string) {
  const lease = state.worker.lease_until ? Date.parse(state.worker.lease_until) : 0;
  if (state.worker.owner && state.worker.owner !== owner && lease > clock.now) return false;
  if (state.worker.owner !== owner)
    recordEvent(state, clock, "WORKER_LEASE_ACQUIRED", "worker", owner, {
      previous_owner: state.worker.owner,
    });
  state.worker = {
    owner,
    lease_until: new Date(clock.now + LEASE_MS).toISOString(),
    heartbeat_at: clock.iso,
  };
  return true;
}

/** Storage-neutral transaction runner (local file or hosted InsForge book). */
export type BookRunner = <T>(
  change: (state: BookState, clock: Clock) => T,
  write: boolean,
) => T | Promise<T>;

export function runWorkerTick(
  owner: string,
  source: QuoteSource = (symbol) => fetchProviderQuote(symbol),
  book: BookId = "main",
): Promise<TickResult> {
  return runWorkerTickWith((change, write) => localTransaction(change, write, book), owner, source);
}

export async function runWorkerTickWith(
  run: BookRunner,
  owner: string,
  source: QuoteSource = (symbol) => fetchProviderQuote(symbol),
): Promise<TickResult> {
  const startedAt = new Date().toISOString();
  const blank: TickResult = {
    owner,
    skipped: false,
    at: startedAt,
    symbols: 0,
    quotes: 0,
    quote_errors: {},
    fills: 0,
    rejected: 0,
    protections_triggered: 0,
    protection_errors: 0,
    alerts: 0,
    expired: 0,
    marks: 0,
  };
  // Claim before fetching so a second process does not spend provider budget.
  const claimed = await run((state, clock) => holdLease(state, clock, owner), true);
  if (!claimed) return { ...blank, skipped: true, reason: "LEASE_HELD_BY_OTHER_WORKER" };
  const symbols = await run((state) => neededSymbols(state), false);
  const { quotes, errors } = symbols.length
    ? await fetchAll(symbols, source)
    : { quotes: new Map(), errors: {} };
  return run((state, clock) => {
    if (!holdLease(state, clock, owner)) return { ...blank, skipped: true, reason: "LEASE_LOST" };
    const result: TickResult = {
      ...blank,
      symbols: symbols.length,
      quotes: quotes.size,
      quote_errors: errors,
    };
    result.expired = expireOrders(state, clock);
    settleCompletedFills(state, clock);
    const live = new Map<string, ReturnType<typeof observationFromQuote>>();
    for (const [symbol, quote] of quotes) {
      if (!markableQuote(quote, symbol, clock.now)) continue;
      const observation = observationFromQuote(quote, clock);
      if (markHolding(state, observation)) result.marks++;
      if (executionQuoteError(quote, clock.now, "LIVE", symbol) === null)
        live.set(symbol, observation);
    }
    // Anchor the next session's loss window from closing marks when the market is shut.
    ensureRiskDay(
      state,
      clock,
      exchangeSession(clock.now).open ? "FIRST_MUTATION" : "PRIOR_CLOSE_MARKS",
    );
    for (const id of state.orders.map((o) => o.id)) {
      // Re-read by id: a restored savepoint replaces the arrays with clones.
      const order = state.orders.find((o) => o.id === id)!;
      if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED") continue;
      if (order.execution_mode !== "LIVE") continue;
      const observation = live.get(order.symbol);
      if (!observation || !conditionMet(order, observation)) continue;
      const attempt = savepoint(state, () => fillRestingOrder(state, clock, order.id, observation));
      if (attempt.ok) result.fills++;
      else if (TERMINAL_FILL_ERRORS.has(attempt.error)) {
        const current = state.orders.find((o) => o.id === order.id)!;
        rejectOrder(state, clock, current, attempt.error);
        result.rejected++;
      }
    }
    for (const id of state.protections.map((p) => p.id)) {
      const protection = state.protections.find((p) => p.id === id)!;
      if (protection.status !== "ACTIVE") continue;
      const observation = live.get(protection.symbol);
      if (!observation) continue;
      const attempt = savepoint(state, () =>
        evaluateProtection(state, clock, protection, observation),
      );
      if (attempt.ok) {
        if (attempt.value) result.protections_triggered++;
        continue;
      }
      result.protection_errors++;
      const current = state.protections.find((p) => p.id === protection.id)!;
      current.attempts += 1;
      const changed = current.last_error !== attempt.error;
      current.last_error = attempt.error;
      current.updated_at = clock.iso;
      recordEvent(
        state,
        clock,
        "PROTECTION_EXIT_FAILED",
        "protection",
        current.id,
        { error: attempt.error, attempts: current.attempts },
        changed,
      );
    }
    for (const observation of live.values())
      result.alerts += evaluateAlerts(state, clock, observation);
    return result;
  }, true);
}

type WorkerHandle = {
  owner: string;
  timer: ReturnType<typeof setInterval>;
  last: TickResult | null;
  hosted: { books: number; errors: number } | null;
  running: boolean;
};

/** Evaluate every hosted InsForge book when the hosted provider is configured. */
async function runHostedTicks(owner: string) {
  const { insforgeBookConfig, insforgeTransaction, listHostedBookUsers } =
    await import("./insforge-book.server");
  const config = insforgeBookConfig();
  if (!config) return null;
  const users = await listHostedBookUsers(config);
  let errors = 0;
  for (const userId of users) {
    try {
      await runWorkerTickWith(
        (change, write) => insforgeTransaction(config, userId, change, write),
        owner,
      );
    } catch {
      errors++;
    }
  }
  return { books: users.length, errors };
}
const GLOBAL_KEY = "__quantPlusPaperWorker";

/** Start the in-process worker once per server process. */
export function startPaperWorker() {
  const registry = globalThis as unknown as Record<string, WorkerHandle | undefined>;
  if (registry[GLOBAL_KEY]) return registry[GLOBAL_KEY];
  const handle: WorkerHandle = {
    owner: `${process.pid}:${randomUUID()}`,
    timer: undefined as unknown as ReturnType<typeof setInterval>,
    last: null,
    hosted: null,
    running: false,
  };
  const tick = async () => {
    if (handle.running) return;
    handle.running = true;
    try {
      handle.last = await runWorkerTick(handle.owner);
      handle.hosted = await runHostedTicks(handle.owner);
    } catch (error) {
      // Busy locks and transient I/O are retried on the next interval.
      handle.last = {
        owner: handle.owner,
        skipped: true,
        reason: error instanceof Error ? error.message : "WORKER_ERROR",
        at: new Date().toISOString(),
        symbols: 0,
        quotes: 0,
        quote_errors: {},
        fills: 0,
        rejected: 0,
        protections_triggered: 0,
        protection_errors: 0,
        alerts: 0,
        expired: 0,
        marks: 0,
      };
    } finally {
      handle.running = false;
    }
  };
  handle.timer = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  handle.timer.unref?.();
  registry[GLOBAL_KEY] = handle;
  void tick();
  return handle;
}

export function paperWorkerStatus() {
  const handle = (globalThis as unknown as Record<string, WorkerHandle | undefined>)[GLOBAL_KEY];
  return handle
    ? { running: true, owner: handle.owner, last: handle.last, hosted: handle.hosted }
    : { running: false, owner: null, last: null };
}

export function stopPaperWorker() {
  const registry = globalThis as unknown as Record<string, WorkerHandle | undefined>;
  const handle = registry[GLOBAL_KEY];
  if (!handle) return;
  clearInterval(handle.timer);
  registry[GLOBAL_KEY] = undefined;
}
