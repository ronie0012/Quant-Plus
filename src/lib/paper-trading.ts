import { agentFetch, type MarketQuote } from "@/lib/agent-api";
import { authenticatedFetch } from "./workspace-session";
import { executionQuoteError, type ExecutionMode } from "./quote-eligibility";

/** Authenticated server boundary for paper-order mutations. */
export async function paperOrderFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" && typeof navigator !== "undefined" && navigator.onLine === false)
    throw new Error("OFFLINE_READ_ONLY: reconnect before changing the paper book");
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await authenticatedFetch(
    `/api/paper/${path}`,
    { ...options, headers },
    "Sign in to access paper trading",
  );
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || `Paper order request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function paperQuoteError(
  quote: MarketQuote | null,
  now = Date.now(),
  mode: ExecutionMode = "LIVE",
): string | null {
  return executionQuoteError(quote, now, mode);
}

/** Read the provider stream again at submission; never execute at a demo/UI price. */
export async function paperTradingQuote(symbol: string): Promise<MarketQuote & { price: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let reader: ReadableStreamDefaultReader<string> | undefined;
  let lastError = "Market price unavailable. Please try again.";
  try {
    const response = await agentFetch(`market/${encodeURIComponent(symbol)}/stream`, {
      signal: controller.signal,
    });
    if (!response.body) throw new Error(lastError);
    reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error(lastError);
      buffer += value;
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data) continue;
        const quote = JSON.parse(data) as MarketQuote;
        if (quote.symbol !== symbol) continue;
        const error = paperQuoteError(quote);
        if (!error) return quote as MarketQuote & { price: number };
        lastError = error;
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(lastError);
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}
