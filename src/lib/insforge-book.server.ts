/**
 * Hosted paper book on InsForge. The same engine and commands as the local
 * book run in this server process; each change commits atomically through
 * public.paper_commit_book (compare-and-swap on the book version, admin key
 * only). Browsers never write book rows. Enabled only when
 * QUANT_PLUS_BOOK_PROVIDER=insforge and server-side INSFORGE_URL/INSFORGE_API_KEY exist.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { newBook, reconcile } from "./paper-book/engine";
import { clockAt, type BookState, type Clock } from "./paper-book/types";
import {
  dataCommand,
  maintain,
  orderById,
  paperCommand,
  queryMaintains,
  queryWrites,
  replayIntent,
} from "./paper-book/commands";

const MAX_ATTEMPTS = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InsForgeConfig = { url: string; apiKey: string };
type Fetch = typeof fetch;

export function insforgeBookConfig(env = process.env): InsForgeConfig | null {
  if (env["QUANT_PLUS_BOOK_PROVIDER"] !== "insforge") return null;
  const url = env["INSFORGE_URL"]?.replace(/\/$/, "");
  const apiKey = env["INSFORGE_API_KEY"];
  return url && apiKey ? { url, apiKey } : null;
}

export class HostedBookError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = "HostedBookError";
  }
}

/** Resolve the InsForge user for a bearer token; never trusts a client-supplied id. */
export async function verifyInsForgeUser(
  config: Pick<InsForgeConfig, "url">,
  token: string,
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
) {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetchImpl(`${config.url}/api/auth/sessions/current`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (response.status === 401 || response.status === 403)
    throw new HostedBookError("Unauthorized", 401);
  if (!response.ok) throw new HostedBookError("Authentication service unavailable", 503);
  const body = (await response.json()) as { user?: { id?: unknown; role?: unknown } };
  const id = body.user?.id;
  // The live API returns no role for end users (verified 2026-10-14); an explicit
  // non-user role (e.g. an admin or anon token) is rejected.
  const role = body.user?.role;
  if (typeof id !== "string" || !UUID.test(id) || (role !== undefined && role !== "authenticated"))
    throw new HostedBookError("Unauthorized", 401);
  return id;
}

async function adminFetch(
  config: InsForgeConfig,
  path: string,
  init: RequestInit,
  fetchImpl: Fetch,
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetchImpl(`${config.url}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
}

async function loadBook(config: InsForgeConfig, userId: string, clock: Clock, fetchImpl: Fetch) {
  const response = await adminFetch(
    config,
    `/api/database/records/paper_books?user_id=eq.${encodeURIComponent(userId)}&select=version,state`,
    { method: "GET" },
    fetchImpl,
  );
  if (!response.ok) throw new HostedBookError("Hosted book unavailable", 503);
  const rows = (await response.json()) as { version: number; state: BookState }[];
  const row = rows[0];
  if (!row) return { version: 0, state: newBook(userId, clock) };
  if (row.state?.version !== 2 || row.state.account?.user_id !== userId)
    throw new HostedBookError("Hosted book is invalid", 500);
  return { version: Number(row.version), state: row.state };
}

/** Rows appended or changed by one transaction, for the relational projection. */
export function bookDelta(before: BookState, after: BookState) {
  const orderVersions = new Map(before.orders.map((o) => [o.id, o.version]));
  const ledger = after.ledger.slice(before.ledger.length);
  const events = after.events.slice(before.events.length);
  const fills = after.fills.slice(before.fills.length);
  // Append-only invariants: existing history must be unchanged.
  if (
    JSON.stringify(after.ledger.slice(0, before.ledger.length)) !== JSON.stringify(before.ledger) ||
    JSON.stringify(after.fills.slice(0, before.fills.length)) !== JSON.stringify(before.fills) ||
    after.events.length < before.events.length
  )
    throw new HostedBookError("Book history was rewritten", 500);
  return {
    orders: after.orders
      .filter((o) => orderVersions.get(o.id) !== o.version)
      .map((o) => ({
        id: o.id,
        intent_id: o.intent_id,
        symbol: o.symbol,
        side: o.side,
        order_type: o.order_type,
        quantity: o.quantity,
        filled_quantity: o.filled_quantity,
        limit_price_paise: o.limit_price_paise,
        avg_fill_paise: o.avg_fill_paise,
        charges_paise: o.charges_paise,
        status: o.status,
        status_reason: o.status_reason,
        execution_mode: o.execution_mode,
        parent_order_id: o.parent_order_id,
        expires_at: o.expires_at,
        version: o.version,
        created_at: o.created_at,
        updated_at: o.updated_at,
      })),
    fills: fills.map((f) => ({
      id: f.id,
      order_id: f.order_id,
      seq: f.seq,
      symbol: f.symbol,
      side: f.side,
      quantity: f.quantity,
      price_paise: f.price_paise,
      reference_price_paise: f.reference_price_paise,
      method: f.method,
      charges: f.charges,
      quote: f.quote,
      created_at: f.created_at,
    })),
    ledger: ledger.map((e) => ({
      id: e.id,
      seq: e.seq,
      kind: e.kind,
      amount_paise: e.amount_paise,
      balance_after_paise: e.balance_after_paise,
      order_id: e.order_id,
      fill_id: e.fill_id,
      note: e.note,
      created_at: e.created_at,
    })),
    events: events.map((e) => ({
      seq: e.seq,
      type: e.type,
      entity: e.entity,
      entity_id: e.entity_id,
      notify: e.notify,
      data: e.data,
      at: e.at,
    })),
    intents: Object.entries(after.intents)
      .filter(([key]) => !before.intents[key])
      .map(([intent_id, value]) => ({ intent_id, fingerprint: value.fingerprint })),
  };
}

/**
 * Run `change` against the user's hosted book. Writes commit with a version
 * compare-and-swap; on a concurrent commit the change re-runs on fresh state.
 */
export async function insforgeTransaction<T>(
  config: InsForgeConfig,
  userId: string,
  change: (state: BookState, clock: Clock) => T,
  write = true,
  fetchImpl: Fetch = fetch,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const clock = clockAt(Date.now());
    const { version, state } = await loadBook(config, userId, clock, fetchImpl);
    const before = structuredClone(state);
    const result = change(state, clock);
    if (!write) return result;
    const serialized = JSON.stringify(state);
    if (version > 0 && serialized === JSON.stringify(before)) return result;
    const response = await adminFetch(
      config,
      "/api/database/rpc/paper_commit_book",
      {
        method: "POST",
        body: JSON.stringify({
          p_user_id: userId,
          p_expected_version: version,
          p_state: state,
          p_state_sha256: createHash("sha256").update(serialized).digest("hex"),
          ...Object.fromEntries(
            Object.entries(bookDelta(before, state)).map(([key, value]) => [`p_${key}`, value]),
          ),
        }),
      },
      fetchImpl,
    );
    if (response.ok) return result;
    const detail = await response.text();
    if (detail.includes("BOOK_VERSION_CONFLICT") && attempt < MAX_ATTEMPTS) continue;
    if (detail.includes("BOOK_VERSION_CONFLICT"))
      throw new HostedBookError("LOCAL_STORE_BUSY", 409);
    throw new HostedBookError("Hosted book commit failed", 503);
  }
  throw new HostedBookError("LOCAL_STORE_BUSY", 409);
}

/** One-shot migration CAS: never retry onto a concurrently initialized book. */
export async function importEmptyHostedBook(
  config: InsForgeConfig,
  userId: string,
  state: BookState,
  fetchImpl: Fetch = fetch,
) {
  if (state.account.user_id !== userId || reconcile(state).length)
    throw new HostedBookError("Migration book does not reconcile", 409);
  const serialized = JSON.stringify(state);
  const response = await adminFetch(
    config,
    "/api/database/rpc/paper_commit_book",
    {
      method: "POST",
      body: JSON.stringify({
        p_user_id: userId,
        p_expected_version: 0,
        p_state: state,
        p_state_sha256: createHash("sha256").update(serialized).digest("hex"),
        ...Object.fromEntries(
          Object.entries(bookDelta(newBook(userId, clockAt()), state)).map(([key, value]) => [
            `p_${key}`,
            value,
          ]),
        ),
      }),
    },
    fetchImpl,
  );
  if (!response.ok)
    throw new HostedBookError(
      "Migration destination changed or commit failed; no overwrite was attempted",
      409,
    );
  const committed = await loadBook(config, userId, clockAt(), fetchImpl);
  if (!isDeepStrictEqual(committed.state, state))
    throw new HostedBookError("Hosted import needs reconciliation before cutover", 409);
}

/** Hosted equivalents of the local book service. */
export function hostedBook(config: InsForgeConfig, userId: string, fetchImpl: Fetch = fetch) {
  const run = <T>(change: (state: BookState, clock: Clock) => T, write: boolean) =>
    insforgeTransaction(config, userId, change, write, fetchImpl);
  return {
    replay: (input: Record<string, unknown>) => run((state) => replayIntent(state, input), false),
    async rpc(name: string, input: Record<string, unknown>) {
      if (input["p_execution_mode"] === "LAST_SESSION_PRACTICE")
        throw new HostedBookError("Practice books are local-only", 409);
      await run(maintain, true);
      return run((state, clock) => paperCommand(state, clock, name, input), true);
    },
    async order(id: string) {
      await run(maintain, true);
      return run((state) => orderById(state, id), false);
    },
    async query(input: Record<string, unknown>) {
      if (input["book"] === "practice")
        throw new HostedBookError("Practice books are local-only", 409);
      if (queryMaintains(input)) await run(maintain, true);
      return run((state, clock) => dataCommand(state, clock, input), queryWrites(input));
    },
  };
}

/** Users with a hosted book, for the server worker. */
export async function listHostedBookUsers(config: InsForgeConfig, fetchImpl: Fetch = fetch) {
  const response = await adminFetch(
    config,
    "/api/database/records/paper_books?select=user_id&limit=1000",
    { method: "GET" },
    fetchImpl,
  );
  if (!response.ok) throw new HostedBookError("Hosted book list unavailable", 503);
  const rows = (await response.json()) as { user_id: string }[];
  return rows.map((row) => row.user_id).filter((id) => UUID.test(id));
}
