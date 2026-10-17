import { createHash } from "node:crypto";
import { reconcile, recordEvent } from "./paper-book/engine";
import { clockAt, type BookState } from "./paper-book/types";

export type MigrationIdentity = {
  id: string;
  email: string;
  email_verified: boolean;
  is_project_admin: boolean;
  is_anonymous: boolean;
};

/** Build a reconciled copy. Never edits the source book or creates auth users. */
export function prepareOwnerMigration(
  raw: string,
  identity: MigrationIdentity,
  expectedEmail: string,
  now = Date.now(),
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      identity.id,
    ) ||
    identity.email.toLowerCase() !== expectedEmail.trim().toLowerCase() ||
    !identity.email_verified ||
    identity.is_project_admin ||
    identity.is_anonymous
  )
    throw new Error("A matching verified application-user identity is required");
  const source = JSON.parse(raw) as BookState;
  if (source.version !== 2 || !source.account?.user_id)
    throw new Error("Migrate and validate the local book format before owner transfer");
  const problems = reconcile(source);
  if (problems.length) throw new Error(`Local book does not reconcile: ${problems.join("; ")}`);
  const oldOwner = source.account.user_id;
  if (oldOwner === identity.id) throw new Error("Book already belongs to this owner");
  const reassign = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reassign);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (key === "user_id") {
          if (item !== oldOwner) throw new Error("Unexpected owner found in source book");
          return [key, identity.id];
        }
        return [key, reassign(item)];
      }),
    );
  };
  const state = reassign(source) as BookState;
  state.worker = { owner: null, lease_until: null, heartbeat_at: null };
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  recordEvent(state, clockAt(now), "OWNER_MIGRATED", "account", identity.id, {
    from_user_id: oldOwner,
    to_user_id: identity.id,
    source_sha256: sourceSha256,
  });
  const after = reconcile(state);
  if (after.length) throw new Error(`Migrated book does not reconcile: ${after.join("; ")}`);
  return {
    state,
    sourceSha256,
    summary: {
      from_user_id: oldOwner,
      to_user_id: identity.id,
      cash_paise: state.account.cash_paise,
      holdings: state.holdings.length,
      orders: state.orders.length,
      fills: state.fills.length,
      ledger_entries: state.ledger.length,
      events: state.events.length,
      conversations: state.conversations.length,
    },
  };
}
