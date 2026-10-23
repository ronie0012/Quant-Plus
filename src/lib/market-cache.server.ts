import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Last-known market data, kept on disk by the app server.
 *
 * Display data only: quotes, candles, index values and reference data seen on
 * successful provider responses. When the agent service is restarting or
 * unreachable, screens show these values labelled as cached instead of going
 * blank. Paper fills never read this cache; they fetch a fresh provider quote.
 */

type Entry = { savedAt: string; contentType: string; body: string };

const CACHEABLE = [
  /^market\/overview$/,
  /^market\/(sectors|news)$/,
  /^market\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(history|quote|option-chain)$/,
  /^terminal\/(quotes|metrics)$/,
  /^terminal\/indices\/(NIFTY|BANK|VIX|SENSEX)\/history$/,
  /^terminal\/fundamentals\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}$/,
  /^stocks\/universe$/,
  /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/profile$/,
];
const MAX_BODY = 2_000_000;
const MAX_MEMORY = 400;

// Process-wide state survives dev-server module reloads.
const state = ((globalThis as { __qpMarketCache?: CacheState }).__qpMarketCache ??= {
  memory: new Map(),
  quotes: new Map(),
  quotesLoaded: false,
  quotesTimer: undefined,
});
type CacheState = {
  memory: Map<string, Entry>;
  quotes: Map<string, Record<string, unknown>>;
  quotesLoaded: boolean;
  quotesTimer: ReturnType<typeof setTimeout> | undefined;
};
const { memory, quotes } = state;

function directory() {
  if (process.env["MARKET_CACHE_DIR"]) return resolve(process.env["MARKET_CACHE_DIR"]);
  const data = resolve(process.env["LOCAL_DATA_FILE"] || ".local-data/workspace.json");
  return join(dirname(data), "market-cache");
}

const fileFor = (key: string) =>
  join(directory(), `${createHash("sha1").update(key).digest("hex")}.json`);

async function writeAtomic(file: string, contents: string) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, file);
}

/** Cache key for a GET path, or null when the path is not display market data. */
export function marketCacheKey(method: string, path: string, search: string) {
  if (method !== "GET" || !CACHEABLE.some((pattern) => pattern.test(path))) return null;
  const params = new URLSearchParams(search);
  params.sort();
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export async function storeMarketData(key: string, contentType: string, body: string) {
  if (body.length > MAX_BODY || !contentType.includes("json")) return;
  const entry = { savedAt: new Date().toISOString(), contentType, body };
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value!);
  try {
    await writeAtomic(fileFor(key), JSON.stringify(entry));
  } catch {
    /* the in-memory copy still serves this process */
  }
}

async function load(key: string) {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const entry = JSON.parse(await readFile(fileFor(key), "utf8")) as Entry;
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Marks every level of a cached payload as last-known rather than current. */
function annotate(body: string, savedAt: string) {
  try {
    const value = JSON.parse(body) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return body;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record["instruments"]))
      record["instruments"] = (record["instruments"] as Record<string, unknown>[]).map(
        (instrument) => ({ ...instrument, stale: true }),
      );
    return JSON.stringify({ ...record, served_from_cache: true, cached_at: savedAt, stale: true });
  } catch {
    return body;
  }
}

/** The last successful response for `key`, labelled as cached, or null. */
export async function cachedMarketResponse(key: string) {
  const entry = await load(key);
  if (!entry) return null;
  return new Response(annotate(entry.body, entry.savedAt), {
    status: 200,
    headers: {
      "Content-Type": entry.contentType,
      "Cache-Control": "no-store",
      "X-QP-Cache": "stale",
      "X-QP-Cached-At": entry.savedAt,
    },
  });
}

// ---- streamed quotes -------------------------------------------------------

const quotesFile = () => join(directory(), "quotes.json");

async function loadQuotes() {
  if (state.quotesLoaded) return;
  state.quotesLoaded = true;
  try {
    const saved = JSON.parse(await readFile(quotesFile(), "utf8")) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [symbol, quote] of Object.entries(saved))
      if (!quotes.has(symbol)) quotes.set(symbol, quote);
  } catch {
    /* no saved quotes yet */
  }
}

function persistQuotes() {
  if (state.quotesTimer) return;
  state.quotesTimer = setTimeout(() => {
    state.quotesTimer = undefined;
    void writeAtomic(quotesFile(), JSON.stringify(Object.fromEntries(quotes))).catch(
      () => undefined,
    );
  }, 5_000);
  state.quotesTimer.unref?.();
}

function recordQuote(quote: unknown) {
  if (!quote || typeof quote !== "object") return;
  const record = quote as Record<string, unknown>;
  if (typeof record["symbol"] !== "string" || typeof record["price"] !== "number") return;
  if (record["error"]) return; // Never let an error frame replace a real observation.
  quotes.set(record["symbol"], record);
  persistQuotes();
}

/** Server-sent events parser that hands each complete frame to `onFrame`. */
function frameReader(onFrame: (event: string, data: string) => void) {
  let buffer = "";
  const decoder = new TextDecoder();
  return new WritableStream<Uint8Array>({
    write(chunk) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r/g, "");
      if (buffer.length > 1_000_000) buffer = "";
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const lines = buffer.slice(0, boundary).split("\n");
        buffer = buffer.slice(boundary + 2);
        const event =
          lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "message";
        const data = lines
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (data) onFrame(event, data);
      }
    },
  });
}

/** Passes a provider stream through while remembering what it carried. */
export function recordMarketStream(path: string, body: ReadableStream<Uint8Array>) {
  const [client, copy] = body.tee();
  const overview = path === "market/overview/stream";
  void copy
    .pipeTo(
      frameReader((event, data) => {
        try {
          const value = JSON.parse(data) as Record<string, unknown>;
          if (!overview) recordQuote(value);
          else if (event === "overview")
            void storeMarketData("market/overview", "application/json", data);
          else if (event === "tick") void patchOverview(value);
        } catch {
          /* ignore malformed frames; the client validates independently */
        }
      }),
    )
    .catch(() => undefined);
  return client;
}

async function patchOverview(tick: Record<string, unknown>) {
  const entry = await load("market/overview");
  if (!entry) return;
  try {
    const payload = JSON.parse(entry.body) as { instruments?: Record<string, unknown>[] };
    if (!payload.instruments?.some((item) => item["symbol"] === tick["symbol"])) return;
    payload.instruments = payload.instruments.map((item) =>
      item["symbol"] === tick["symbol"] ? { ...item, ...tick } : item,
    );
    await storeMarketData("market/overview", entry.contentType, JSON.stringify(payload));
  } catch {
    /* keep the previous snapshot */
  }
}

const sse = (frames: string[]) =>
  new Response(frames.join("") || ": no cached data\n\n", {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-QP-Cache": "stale",
    },
  });

/**
 * A one-shot stream of last-known data, sent when the provider stream is down.
 * It closes immediately, so clients keep showing it as stale and reconnect.
 */
export async function cachedMarketStream(path: string, search: string) {
  if (path === "market/overview/stream") {
    const entry = await load("market/overview");
    if (!entry) return null;
    return sse([`event: overview\ndata: ${annotate(entry.body, entry.savedAt)}\n\n`]);
  }
  await loadQuotes();
  const names = (new URLSearchParams(search).get("symbols") ?? "")
    .split(",")
    .map((name) => name.trim().toUpperCase())
    .filter(Boolean);
  const frames = names.flatMap((name) => {
    const quote = quotes.get(name);
    if (!quote) return [];
    return [
      `data: ${JSON.stringify({ ...quote, stale: true, error: "Live feed offline · last known price" })}\n\n`,
    ];
  });
  return frames.length ? sse(frames) : null;
}
