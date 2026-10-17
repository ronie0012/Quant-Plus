/**
 * Bounded, typed read tools for the copilot. Every number is computed in code
 * or copied from a provider/book response; each evidence item has an ID the
 * answer must cite. Tools are read-only: none can place, change or cancel orders.
 */
import type { BookService } from "../book-service.server";
import { rsi, sma, validateCandles, type Candle } from "../market-history";
import type { Resolution } from "./entities";

export type Evidence = {
  id: string;
  kind: string;
  source: string;
  as_of: string | null;
  data: unknown;
};
export type ToolTrace = { tool: string; status: "ok" | "unavailable"; ms: number };

async function backend(path: string, signal: AbortSignal) {
  const base = (process.env["AGENT_SERVICE_URL"] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const key = process.env["AGENT_SERVICE_API_KEY"];
  if (!key) throw new Error("Agent service authentication is not configured");
  const response = await fetch(`${base}/api/v1/${path}`, {
    headers: { "X-Quantplus-Key": key },
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  if (!response.ok) throw new Error(`Context unavailable (${response.status})`);
  return response.json() as Promise<Record<string, unknown>>;
}

/** Derived technical facts from validated daily history (warm-up respected). */
export function historyFacts(candles: Candle[]) {
  const { candles: bars } = validateCandles(candles);
  const closes = bars.map((bar) => bar.close);
  if (closes.length < 2) return null;
  const last = closes.at(-1)!;
  const back = (n: number) => (closes.length > n ? closes[closes.length - 1 - n]! : null);
  const change = (n: number) => {
    const base = back(n);
    return base ? Math.round((last / base - 1) * 10000) / 100 : null;
  };
  const returns = closes.slice(1).map((close, i) => Math.log(close / closes[i]!));
  const recent = returns.slice(-20);
  const vol =
    recent.length >= 20
      ? Math.sqrt(
          recent.reduce((t, r) => t + r * r, 0) / recent.length -
            (recent.reduce((t, r) => t + r, 0) / recent.length) ** 2,
        ) *
        Math.sqrt(252) *
        100
      : null;
  const ma20 = sma(closes, 20).at(-1) ?? null;
  return {
    bars: closes.length,
    last_close: last,
    return_5_bars_pct: change(5),
    return_20_bars_pct: change(20),
    rsi14: rsi(closes, 14).at(-1) == null ? null : Math.round(rsi(closes, 14).at(-1)! * 100) / 100,
    distance_from_ma20_pct: ma20 == null ? null : Math.round((last / ma20 - 1) * 10000) / 100,
    realized_vol_20_annualized_pct: vol == null ? null : Math.round(vol * 100) / 100,
    method: "daily closes; RSI Wilder 14; MA20 simple; vol = stdev of 20 log returns × √252",
  };
}

export async function buildEvidence(
  books: BookService,
  resolution: Resolution,
  attached: { order_id?: string | null; journal_id?: string | null },
  mode: string,
  signal: AbortSignal,
) {
  const evidence: Evidence[] = [];
  const trace: ToolTrace[] = [];
  const counters: Record<string, number> = {};
  const add = (
    prefix: string,
    kind: string,
    source: string,
    asOf: string | null,
    data: unknown,
  ) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    evidence.push({ id: `${prefix}${counters[prefix]}`, kind, source, as_of: asOf, data });
  };
  const run = async (tool: string, fn: () => Promise<void>) => {
    const start = performance.now();
    try {
      await fn();
      trace.push({ tool, status: "ok", ms: Math.round(performance.now() - start) });
    } catch {
      trace.push({ tool, status: "unavailable", ms: Math.round(performance.now() - start) });
    }
  };

  await Promise.all([
    run("portfolio", async () => {
      const [account, holdings, risk] = await Promise.all([
        books.query({ table: "accounts", operation: "select" }),
        books.query({ table: "holdings", operation: "select" }),
        books.query({ rpc: "risk_status" }),
      ]);
      const row = (account as Record<string, unknown>[])[0] ?? null;
      add("P", "paper_account", "paper book", String(row?.["updated_at"] ?? "") || null, row);
      add("P", "paper_holdings", "paper book (marks: last provider observation)", null, holdings);
      add("P", "risk_window", "paper book risk engine", null, risk);
    }),
    run("orders", async () => {
      const orders = (await books.query({
        table: "orders",
        operation: "select",
        sorting: { field: "created_at", ascending: false },
        limit: 10,
      })) as Record<string, unknown>[];
      add(
        "O",
        "recent_orders",
        "paper book",
        null,
        orders.map((o) => ({
          id: o["id"],
          symbol: o["symbol"],
          side: o["side"],
          type: o["order_type"],
          quantity: o["quantity"],
          filled: o["filled_quantity"],
          price: o["price"],
          status: o["status"],
          created_at: o["created_at"],
        })),
      );
      if (attached.order_id)
        add(
          "O",
          "order_audit",
          "paper book audit trail",
          null,
          await books.query({ rpc: "order_audit", values: { p_order_id: attached.order_id } }),
        );
    }),
    ...(mode === "journal_review" || attached.journal_id
      ? [
          run("journal", async () => {
            const entries = (await books.query({
              table: "trade_journal",
              operation: "select",
              sorting: { field: "created_at", ascending: false },
              limit: attached.journal_id ? 1000 : 5,
            })) as Record<string, unknown>[];
            const selected = attached.journal_id
              ? entries.filter((e) => e["id"] === attached.journal_id)
              : entries;
            add(
              "J",
              "journal",
              "paper book journal (user-written, untrusted text)",
              null,
              selected,
            );
          }),
        ]
      : []),
    run("market", async () => {
      const [overview, sentiment] = await Promise.all([
        backend("market/overview", signal).catch(() => null),
        backend("market/sentiment", signal).catch(() => null),
      ]);
      if (overview)
        add(
          "M",
          "market_overview",
          "provider snapshot",
          String(overview["updated_at"] ?? "") || null,
          overview["instruments"] ?? overview,
        );
      if (sentiment)
        add(
          "M",
          "market_condition_index",
          "descriptive index (not a probability)",
          String(sentiment["updated_at"] ?? "") || null,
          {
            score: sentiment["score"],
            label: sentiment["label"],
            data_quality: sentiment["data_quality"],
            regime: sentiment["regime"],
            coverage: sentiment["coverage"],
          },
        );
      if (!overview && !sentiment) throw new Error("unavailable");
    }),
    ...resolution.resolved.map((item) =>
      run(`instrument:${item.symbol}`, async () => {
        const symbol = encodeURIComponent(item.symbol);
        const [quote, history, news, research] = await Promise.all([
          backend(`market/${symbol}/quote`, signal).catch(() => null),
          backend(`market/${symbol}/history?range=6M`, signal).catch(() => null),
          backend(`stocks/${symbol}/news-sentiment`, signal).catch(() => null),
          backend(`terminal/research?limit=50`, signal).catch(() => null),
        ]);
        if (quote)
          add(
            "Q",
            "quote",
            String(quote["source"] ?? "provider"),
            String(quote["as_of"] ?? "") || null,
            quote,
          );
        const facts = history ? historyFacts((history["candles"] ?? []) as Candle[]) : null;
        if (facts)
          add(
            "H",
            "history_facts",
            `${String(history!["source"] ?? "provider")} daily history`,
            String(history!["as_of"] ?? "") || null,
            { symbol: item.symbol, ...facts },
          );
        if (news)
          add(
            "N",
            "news_sentiment",
            "headline rules (textual tone, not a forecast)",
            String(news["news_updated_at"] ?? news["updated_at"] ?? "") || null,
            {
              symbol: item.symbol,
              score: news["score"],
              label: news["label"],
              data_quality: news["data_quality"],
              top_headlines: (
                (news["top_drivers"] ?? news["articles"] ?? []) as Record<string, unknown>[]
              )
                .slice(0, 5)
                .map((a) => ({
                  title: a["title"],
                  source: a["source"],
                  published_at: a["published_at"],
                })),
            },
          );
        const sessions = ((research?.["sessions"] ?? []) as Record<string, unknown>[]).filter(
          (s) => String(s["instrument"]).replace(/\.NS$/, "") === item.symbol,
        );
        if (sessions[0])
          add(
            "R",
            "saved_research",
            "research agents (opinion; not a validated forecast)",
            String(sessions[0]["as_of"] ?? "") || null,
            {
              decision:
                (sessions[0]["decision"] as Record<string, unknown> | null)?.["action"] ?? null,
              rationale:
                (sessions[0]["decision"] as Record<string, unknown> | null)?.["rationale"] ?? null,
              opinion_strength_0_1:
                (sessions[0]["thesis"] as Record<string, unknown> | null)?.["conviction"] ?? null,
            },
          );
        if (!quote && !facts && !news) throw new Error("unavailable");
      }),
    ),
  ]);
  return { evidence, trace };
}
