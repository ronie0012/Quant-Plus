import { verifyInsForgeUser, HostedBookError } from "./insforge-book.server";
import { reconcile } from "./paper-book/engine";
import type { BookState } from "./paper-book/types";

/** Read through the user's JWT/RLS, without an admin key or any writes. */
export async function checkHostedPortfolio(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
) {
  const userId = await verifyInsForgeUser({ url }, token, undefined, fetchImpl);
  const response = await fetchImpl(
    `${url}/api/database/records/paper_books?select=version,state&limit=2`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new HostedBookError("Could not read your hosted portfolio", 503);
  const rows = (await response.json()) as { version: number; state: BookState }[];
  if (!Array.isArray(rows) || rows.some((row) => row.state?.account?.user_id !== userId))
    throw new HostedBookError("Portfolio ownership check failed", 503);
  const state = rows[0]?.state;
  if (rows.length !== 1 || !state || state.version !== 2)
    throw new HostedBookError("No imported portfolio found for this account", 409);
  if (reconcile(state).length) throw new HostedBookError("Portfolio reconciliation failed", 503);
  if (!state.events.some((event) => event.type === "OWNER_MIGRATED"))
    throw new HostedBookError("This account has no validated local portfolio import", 409);
  return {
    verified: true,
    cash_paise: state.account.cash_paise,
    holdings: state.holdings.length,
    orders: state.orders.length,
    fills: state.fills.length,
  };
}
