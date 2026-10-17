/** Conservative paper T+1 policy: release after the next clearing day finishes.
 * NCL/CMPT/71904 and NCL/CMPT/72224 cover the 2026 holidays below.
 * This models calendar settlement, not a broker payout-time promise. No T+0.
 */
import { istDate, sessionDay } from "../exchange-calendar.ts";
import type { BookState, Fill } from "./types.ts";

export const SETTLEMENT_CALENDAR_VERSION = "ncl-cm-2026.1";
export const SETTLEMENT_SOURCES = [
  "https://nsearchives.nseindia.com/content/circulars/CMPT71904.pdf",
  "https://nsearchives.nseindia.com/content/circulars/CMPT72224.pdf",
];
const HOLIDAYS = new Set([
  "2026-01-15",
  "2026-01-26",
  "2026-02-19",
  "2026-03-03",
  "2026-03-19",
  "2026-03-26",
  "2026-03-31",
  "2026-04-01",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-05-28",
  "2026-06-26",
  "2026-08-26",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24",
  "2026-12-25",
]);
const nextDate = (date: string) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);

export function settlementDue(tradedAt: string): string | null {
  const time = Date.parse(tradedAt);
  if (!Number.isFinite(time)) return null;
  let date = istDate(time);
  if (!date.startsWith("2026-")) return null;
  for (let offset = 0; offset < 20; offset++) {
    date = nextDate(date);
    if (!date.startsWith("2026-")) return null;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || HOLIDAYS.has(date)) continue;
    if (sessionDay(date).status !== "TRADING") continue;
    return new Date(Date.parse(`${nextDate(date)}T00:00:00+05:30`)).toISOString();
  }
  return null;
}

export function fillSettlementDue(fill: Fill) {
  if (fill.settlement_due_at !== undefined) return fill.settlement_due_at;
  return fill.method === "LEGACY_V1" ? null : settlementDue(fill.created_at);
}

export function settlementBalances(state: BookState, now: number) {
  let pendingSale = 0;
  let unverified = 0;
  const lots = new Map<string, Array<{ quantity: number; due: number | null }>>();
  for (const fill of state.fills) {
    const dueAt = fillSettlementDue(fill);
    const timestamp = dueAt == null ? null : Date.parse(dueAt);
    const due = timestamp != null && Number.isFinite(timestamp) ? timestamp : null;
    if (due == null) unverified++;
    const symbolLots = lots.get(fill.symbol) ?? [];
    lots.set(fill.symbol, symbolLots);
    if (fill.side === "BUY") symbolLots.push({ quantity: fill.quantity, due });
    else {
      if (due == null || due > now)
        pendingSale += Math.max(
          0,
          fill.quantity * fill.price_paise - (fill.charges?.total_paise ?? 0),
        );
      let remaining = fill.quantity;
      for (const lot of symbolLots) {
        const taken = Math.min(remaining, lot.quantity);
        lot.quantity -= taken;
        remaining -= taken;
        if (!remaining) break;
      }
    }
  }
  const holdings = new Map(
    [...lots].map(([symbol, symbolLots]) => {
      const unknown = symbolLots.some((lot) => lot.quantity > 0 && lot.due == null);
      const settled = symbolLots
        .filter((lot) => lot.due != null && lot.due <= now)
        .reduce((total, lot) => total + lot.quantity, 0);
      const unsettled = symbolLots
        .filter((lot) => lot.due != null && lot.due > now)
        .reduce((total, lot) => total + lot.quantity, 0);
      return [
        symbol,
        {
          settled_quantity: unknown ? null : settled,
          unsettled_quantity: unknown ? null : unsettled,
        },
      ] as const;
    }),
  );
  return {
    pending_sale_proceeds_paise: pendingSale,
    unverified_fills: unverified,
    holdings,
    unsettled_cash_paise: Math.min(state.account.cash_paise, pendingSale),
    settled_cash_paise: Math.max(0, state.account.cash_paise - pendingSale),
  };
}
