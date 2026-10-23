// Read-only cutover check: compares the local book with the hosted copy of the
// selected migration owner. Never writes to either side.
// Run with: node scripts/compare-hosted-book.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localTestModule } from "./local-test-module.mjs";

const owner = JSON.parse(readFileSync(".local-data/owner-migration-result.json", "utf8"));
const project = JSON.parse(readFileSync(".insforge/project.json", "utf8"));
const config = { url: project.oss_host.replace(/\/$/, ""), apiKey: project.api_key };
const { insforgeTransaction } = localTestModule("@/lib/insforge-book.server");
const { reconcile } = localTestModule("@/lib/paper-book/engine");

const local = JSON.parse(
  readFileSync(resolve(process.env.LOCAL_DATA_FILE || ".local-data/workspace.json"), "utf8"),
);
const hosted = await insforgeTransaction(
  config,
  owner.owner_user_id,
  (state) => structuredClone(state),
  false,
);

const money = (state) => ({
  cash_paise: state.account?.cash_paise ?? null,
  holdings: state.holdings.map((h) => `${h.symbol}:${h.quantity}`).sort(),
  orders: state.orders.map((o) => `${o.id}:${o.status}`).sort(),
  fills: state.fills.length,
  ledger: state.ledger.length,
  reservations: state.reservations.length,
});
const report = {
  financial_match: JSON.stringify(money(local)) === JSON.stringify(money(hosted)),
  local: money(local),
  hosted: money(hosted),
  hosted_reconciles: reconcile(hosted).length === 0,
  local_reconciles: reconcile(local).length === 0,
  preferences: {
    local: local.trading_preferences?.length ?? 0,
    hosted: hosted.trading_preferences?.length ?? 0,
  },
  watchlist: {
    local: local.watchlist_items?.length ?? 0,
    hosted: hosted.watchlist_items?.length ?? 0,
  },
  alerts: { local: local.price_alerts?.length ?? 0, hosted: hosted.price_alerts?.length ?? 0 },
  journal: { local: local.trade_journal?.length ?? 0, hosted: hosted.trade_journal?.length ?? 0 },
};
console.log(JSON.stringify(report, null, 2));
if (!report.financial_match || !report.hosted_reconciles) process.exitCode = 1;
