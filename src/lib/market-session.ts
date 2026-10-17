import { exchangeSession } from "./exchange-calendar.ts";

/**
 * Whether the NSE capital-market session is open, using the verified exchange
 * holiday calendar. Unverified special sessions are reported closed.
 */
export function regularNseSession(date = new Date()): boolean {
  return exchangeSession(date.getTime()).open;
}

export function quoteIsStale(
  quote: { as_of?: string; stale: boolean; market_session?: string } | null,
  connected: boolean,
  now = Date.now(),
): boolean {
  if (!connected || !quote?.as_of) return true;
  const timestamp = Date.parse(quote.as_of);
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000) return true;
  if (quote.market_session === "closed") return now - timestamp > 96 * 60 * 60_000;
  return quote.stale || now - timestamp > 60_000;
}
