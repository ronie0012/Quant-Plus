import { executionQuoteError, type ExecutionMode, type ExecutionQuote } from "./quote-eligibility";

export class QuoteUnavailable extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}

/** Raw provider quote from the local market-data service, with receipt time. */
export async function fetchProviderQuote(symbol: string, signal?: AbortSignal) {
  const base = (process.env["AGENT_SERVICE_URL"] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const key = process.env["AGENT_SERVICE_API_KEY"];
  if (!key) throw new QuoteUnavailable("Market-data authentication is not configured");
  const timeout = AbortSignal.timeout(20_000);
  const result = await fetch(`${base}/api/v1/market/${encodeURIComponent(symbol)}/quote`, {
    headers: { "X-Quantplus-Key": key },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!result.ok) throw new QuoteUnavailable("Live market price unavailable");
  const quote = (await result.json()) as ExecutionQuote & Record<string, unknown>;
  return { ...quote, received_at: new Date().toISOString() };
}

/** A provider quote that satisfies the shared execution policy for `mode`. */
export async function executableQuote(symbol: string, mode: ExecutionMode, signal?: AbortSignal) {
  const quote = await fetchProviderQuote(symbol, signal);
  const error = executionQuoteError(quote, Date.now(), mode, symbol);
  if (error) throw new QuoteUnavailable(error, 409);
  return quote;
}

/**
 * Whether a quote may be used to value (not trade) a position: a fresh open-session
 * quote or a bounded closed-session snapshot. Delayed or mismatched data is excluded.
 */
export function markableQuote(quote: ExecutionQuote, symbol: string, now = Date.now()) {
  return (
    executionQuoteError(quote, now, "LIVE", symbol) === null ||
    executionQuoteError(quote, now, "LAST_SESSION_PRACTICE", symbol) === null
  );
}
