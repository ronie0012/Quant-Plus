import type { MarketQuote } from "./agent-api";

type Snapshot = {
  quotes: Record<string, MarketQuote>;
  connected: boolean;
  error: string | null;
  now: number;
};
type Watcher = { names: string[]; notify: (value: Snapshot) => void };
type Stream = {
  controller: AbortController;
  names: string[];
  connected: boolean;
  error: string | null;
  retry?: ReturnType<typeof setTimeout>;
};
export function normalizeMarketSymbols(names: string[]) {
  return [...new Set(names.map((name) => name.trim().toUpperCase().replace(/\.NS$/, "")))]
    .filter((name) => /^[A-Z0-9^][A-Z0-9^&=.-]{0,39}$/.test(name))
    .sort();
}

/** One reference-counted subscription set per browser, partitioned at the API's 50-name boundary. */
export class QuoteSubscriptions {
  private watchers = new Set<Watcher>();
  private streams = new Map<string, Stream>();
  private quotes: Record<string, MarketQuote> = {};
  private clock: ReturnType<typeof setInterval> | undefined;
  constructor(private fetchStream: (path: string, options: RequestInit) => Promise<Response>) {}

  subscribe(names: string[], notify: Watcher["notify"]) {
    const watcher = { names: normalizeMarketSymbols(names), notify };
    this.watchers.add(watcher);
    this.reconcile();
    this.publish();
    if (!this.clock) this.clock = setInterval(() => this.publish(), 15_000);
    return () => {
      this.watchers.delete(watcher);
      this.reconcile();
      if (!this.watchers.size) {
        clearInterval(this.clock);
        this.clock = undefined;
      }
    };
  }

  private reconcile() {
    const names = normalizeMarketSymbols([...this.watchers].flatMap((w) => w.names));
    const wanted = new Map<string, string[]>();
    for (let i = 0; i < names.length; i += 50) {
      const chunk = names.slice(i, i + 50);
      wanted.set(chunk.join(","), chunk);
    }
    for (const [key, stream] of this.streams) {
      if (wanted.has(key)) continue;
      stream.controller.abort();
      clearTimeout(stream.retry);
      this.streams.delete(key);
    }
    const active = new Set(names);
    for (const symbol of Object.keys(this.quotes))
      if (!active.has(symbol)) delete this.quotes[symbol];
    for (const [key, chunk] of wanted) {
      if (this.streams.has(key)) continue;
      const stream: Stream = {
        names: chunk,
        controller: new AbortController(),
        connected: false,
        error: null,
      };
      this.streams.set(key, stream);
      void this.connect(key, stream, 1000);
    }
  }

  private publish() {
    for (const watcher of this.watchers) {
      const relevant = [...this.streams.values()].filter((s) =>
        s.names.some((n) => watcher.names.includes(n)),
      );
      watcher.notify({
        quotes: Object.fromEntries(
          watcher.names.filter((n) => this.quotes[n]).map((n) => [n, this.quotes[n]!]),
        ),
        connected: relevant.length > 0 && relevant.every((s) => s.connected),
        error: relevant.find((s) => s.error)?.error ?? null,
        now: Date.now(),
      });
    }
  }

  private async connect(key: string, stream: Stream, backoff: number) {
    const signal = stream.controller.signal;
    let reader: ReadableStreamDefaultReader<string> | undefined;
    const cancelReader = () => {
      void reader?.cancel().catch(() => undefined);
    };
    try {
      const response = await this.fetchStream(`market/stream?symbols=${encodeURIComponent(key)}`, {
        signal,
      });
      if (!response.ok || !response.body) throw new Error("Market stream unavailable");
      reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      signal.addEventListener("abort", cancelReader, { once: true });
      if (signal.aborted) return;
      stream.connected = true;
      stream.error = null;
      this.publish();
      let buffer = "";
      while (!signal.aborted) {
        const frame = await reader.read();
        if (frame.done) break;
        buffer += frame.value.replace(/\r/g, "");
        if (buffer.length > 262144) throw new Error("Market frame exceeds size limit");
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const data = buffer
            .slice(0, boundary)
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          buffer = buffer.slice(boundary + 2);
          if (!data) continue;
          let quote: MarketQuote;
          try {
            quote = JSON.parse(data) as MarketQuote;
          } catch {
            continue;
          }
          if (!quote || !stream.names.includes(quote.symbol)) continue;
          const time = Date.parse(quote.as_of ?? "");
          const prior = Date.parse(this.quotes[quote.symbol]?.as_of ?? "");
          if (!Number.isFinite(time) || time > Date.now() + 60_000 || time < prior) continue;
          if (quote.price != null && (!Number.isFinite(quote.price) || quote.price <= 0)) continue;
          this.quotes[quote.symbol] = quote;
          backoff = 1000;
          this.publish();
        }
      }
      if (!signal.aborted) throw new Error("Market feed disconnected; reconnecting");
    } catch (error) {
      if (signal.aborted) return;
      stream.connected = false;
      stream.error = error instanceof Error ? error.message : "Market feed unavailable";
      this.publish();
      stream.retry = setTimeout(
        () => void this.connect(key, stream, Math.min(backoff * 2, 30_000)),
        backoff,
      );
    } finally {
      signal.removeEventListener("abort", cancelReader);
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
}
