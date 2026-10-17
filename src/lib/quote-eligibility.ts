import { exchangeSession } from "./exchange-calendar.ts";

/** Shared execution policy. Closed snapshots require an explicit practice intent. */
export type ExecutionMode = "LIVE" | "LAST_SESSION_PRACTICE";
export type ExecutionQuote = {
  symbol?: unknown;
  price?: unknown;
  source?: unknown;
  delayed?: unknown;
  stale?: unknown;
  as_of?: unknown;
  market_session?: unknown;
  error?: unknown;
};
export function executionQuoteError(
  quote: ExecutionQuote | null,
  now = Date.now(),
  mode: ExecutionMode = "LIVE",
  symbol?: string,
): string | null {
  if (
    !quote ||
    typeof quote.price !== "number" ||
    !Number.isFinite(quote.price) ||
    quote.price <= 0
  )
    return "Waiting for a market price before placing a paper order.";
  if (quote.error)
    return typeof quote.error === "string" ? quote.error : "Market data unavailable.";
  if (symbol && quote.symbol !== symbol) return "Market quote symbol does not match the order.";
  if (quote.delayed === true || quote.source !== "fyers")
    return "Live Fyers prices are unavailable. Reconnect the market-data feed to paper trade.";
  const timestamp = Date.parse(typeof quote.as_of === "string" ? quote.as_of : "");
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000)
    return "The market quote has an invalid timestamp. Waiting for a new quote.";
  if (quote.market_session === "closed") {
    if (mode !== "LAST_SESSION_PRACTICE")
      return "Market closed. Live paper fills require an open session.";
    // A bounded weekend snapshot is permitted only in explicitly labelled practice mode.
    if (now - timestamp > 96 * 60 * 60_000) return "Last-session market snapshot is stale.";
    return null;
  }
  if (quote.market_session !== "open" || quote.stale === true || now - timestamp > 60_000)
    return "The market quote is stale. Waiting for a fresh live price.";
  if (mode !== "LIVE") return "Last-session practice requires a closed-session snapshot.";
  // A provider "open" flag cannot override a verified exchange holiday or closed hours.
  const session = exchangeSession(now);
  if (session.verified && !session.open)
    return session.day.reason
      ? `Exchange closed (${session.day.reason}). Live paper fills require an open session.`
      : "Exchange session is closed. Live paper fills require an open session.";
  return null;
}
