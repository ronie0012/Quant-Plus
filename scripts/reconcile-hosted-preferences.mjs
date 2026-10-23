// Cutover reconciliation: copies non-financial workspace rows written locally
// after the hosted import (preferences, watchlist, alerts, journal) into the
// hosted book of the selected migration owner.
//
// Default is a dry run. --apply commits once through the hosted CAS path and
// refuses if the hosted side already has any of these rows or if the financial
// state differs. Money, orders, fills, holdings and the ledger are never copied.
// Run with: node scripts/reconcile-hosted-preferences.mjs [--apply]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localTestModule } from "./local-test-module.mjs";

const apply = process.argv.includes("--apply");
const owner = JSON.parse(readFileSync(".local-data/owner-migration-result.json", "utf8"));
const project = JSON.parse(readFileSync(".insforge/project.json", "utf8"));
const config = { url: project.oss_host.replace(/\/$/, ""), apiKey: project.api_key };
const { insforgeTransaction } = localTestModule("@/lib/insforge-book.server");
const { reconcile } = localTestModule("@/lib/paper-book/engine");
const local = JSON.parse(
  readFileSync(resolve(process.env.LOCAL_DATA_FILE || ".local-data/workspace.json"), "utf8"),
);
const TABLES = ["trading_preferences", "watchlist_items", "price_alerts", "trade_journal"];
const financial = (state) =>
  JSON.stringify({
    cash: state.account?.cash_paise,
    holdings: state.holdings.map((h) => [h.symbol, h.quantity, h.avg_price_paise]),
    orders: state.orders.map((o) => [o.id, o.status, o.filled_quantity]),
    fills: state.fills.map((f) => f.id),
    ledger: state.ledger.map((l) => l.id),
  });
const reassign = (rows, from, to) =>
  rows.map((row) => {
    if (row.user_id !== from) throw new Error("Unexpected owner on a local workspace row");
    return { ...row, user_id: to };
  });

const result = await insforgeTransaction(
  config,
  owner.owner_user_id,
  (state) => {
    if (financial(state) !== financial(local))
      throw new Error("Financial state differs between books; reconcile money before cutover");
    const copied = {};
    for (const table of TABLES) {
      const rows = local[table] ?? [];
      if (!rows.length) continue;
      if ((state[table] ?? []).length)
        throw new Error(`Hosted ${table} already has rows; automatic merging is refused`);
      state[table] = reassign(rows, local.account.user_id, owner.owner_user_id);
      copied[table] = rows.length;
    }
    if (reconcile(state).length) throw new Error("Hosted book would not reconcile");
    return copied;
  },
  apply,
);
const after = await insforgeTransaction(
  config,
  owner.owner_user_id,
  (state) => Object.fromEntries(TABLES.map((table) => [table, (state[table] ?? []).length])),
  false,
);
console.log(
  JSON.stringify(
    { mode: apply ? "applied" : "dry-run", copied: result, hosted_rows_now: after },
    null,
    2,
  ),
);
