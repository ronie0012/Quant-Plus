import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRows, insertRow, selectOne, selectRows } from "@/lib/workspace-api";
import { useMarketNews, useMarketSentiment } from "@/hooks/use-intelligence";
import { agentFetch } from "@/lib/agent-api";
import { useStockQuotes } from "@/hooks/use-agent-stock";
import { relevantNews } from "@/lib/intelligence-view";

export type Account = {
  currency: string;
  total_funds: number;
  funds_used: number;
  profit: number;
  profit_pct: number;
  wallet_balance: number;
  onboarded: boolean;
  updated_at: string;
  realised_gross?: number;
  charges_paid?: number;
  reserved_cash?: number;
  available_cash?: number;
  settled_cash?: number | null;
  unsettled_cash?: number | null;
  withdrawable_cash?: number;
  settlement_status?: string;
};

export type Holding = {
  id: string;
  symbol: string;
  company: string;
  sector: string | null;
  quantity: number;
  avg_price: number;
  last_price: number;
  marked_at?: string;
  mark_source?: string;
  mark_fresh?: boolean;
  available_quantity?: number;
  settled_quantity?: number | null;
  unsettled_quantity?: number | null;
  quote_source?: "fyers" | "yahoo" | null;
  quote_as_of?: string | null;
  quote_delayed?: boolean;
  quote_stale?: boolean;
  quote_missing?: boolean;
};

export type WatchItem = {
  id: string;
  symbol: string;
  company: string;
};

export type Analysis = {
  id: string;
  symbol: string;
  verdict: string;
  /** Agent opinion strength 0-100; not a probability. Null when the session stored none. */
  conviction: number | null;
  risk: string;
  summary: string | null;
  created_at: string;
};

export type Instrument = {
  symbol: string;
  name: string;
  kind: string;
  currency: string;
  value: number | null;
  change_abs: number | null;
  change_pct: number | null;
  sort_order: number;
  updated_at: string | null;
  source?: "fyers" | "yahoo" | null;
  delayed?: boolean | null;
  stale?: boolean;
  market_session?: "open" | "closed" | null;
};

export type NewsItem = {
  id: string;
  headline: string;
  source: string;
  category: string;
  sentiment: string;
  impact: string;
  published_at: string;
};

export type MarketEvent = {
  id: string;
  event: string;
  region: string;
  importance: string;
  event_time: string;
  time_known?: boolean;
  source?: string;
};

export type Sentiment = {
  id: string;
  score: number;
  label: string;
  breakdown: { label: string; value: string }[];
  updated_at: string;
};

const STALE = 60_000;

export function useAccount() {
  return useQuery({
    queryKey: ["account"],
    staleTime: STALE,
    queryFn: async (): Promise<Account | null> => {
      return selectOne<Account>("accounts");
    },
  });
}

export function useHoldings() {
  return useQuery({
    queryKey: ["holdings"],
    staleTime: STALE,
    queryFn: async (): Promise<Holding[]> => {
      return selectRows<Holding>("holdings", { order: { field: "symbol" } });
    },
  });
}

/** Mark stored paper holdings with the shared provider quote stream. */
export function useMarkedHoldings() {
  const holdings = useHoldings();
  const symbols = (holdings.data ?? []).map((holding) => holding.symbol);
  const feed = useStockQuotes(symbols);
  const data = holdings.data?.map((holding) => {
    const quote = feed.quotes[holding.symbol];
    // A missing provider tick must not erase the last known paper mark. Keep
    // the stored mark, expose its degraded state, and let the UI decide how
    // prominently to show the stale valuation.
    return {
      ...holding,
      last_price: quote?.price ?? holding.last_price,
      quote_source: quote?.source ?? null,
      quote_as_of: quote?.as_of ?? null,
      quote_delayed: quote?.delayed ?? false,
      quote_stale: quote?.stale ?? true,
      quote_missing: !quote || !Number.isFinite(quote.price),
    };
  });
  return { ...holdings, data, feed };
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    staleTime: STALE,
    queryFn: async (): Promise<WatchItem[]> => {
      return selectRows<WatchItem>("watchlist_items", { order: { field: "created_at" } });
    },
  });
}

export function useAddWatchlistItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (item: { symbol: string; company: string }) => {
      const existing = await selectOne<{ id: string }>("watchlist_items", [
        ["symbol", item.symbol],
      ]);
      if (existing) return;
      // Watchlist rows hold identity only; prices come from the live quote stream.
      await insertRow("watchlist_items", { symbol: item.symbol, company: item.company });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useRemoveWatchlistItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteRows("watchlist_items", [["id", id]]);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: ["analyses"],
    staleTime: STALE,
    queryFn: async (): Promise<Analysis[]> => {
      const response = await agentFetch("terminal/research?limit=50");
      const payload = (await response.json()) as {
        sessions?: Array<{
          id: string;
          instrument: string;
          as_of: string;
          decision?: { action?: string; rationale?: string } | null;
          thesis?: { conviction?: number; key_risks?: string[] } | null;
        }>;
      };
      return (payload.sessions ?? []).map((session) => ({
        id: session.id,
        symbol: session.instrument.replace(/\.NS$/, ""),
        verdict: session.decision?.action?.toUpperCase() ?? "HOLD",
        conviction:
          session.thesis?.conviction == null
            ? null
            : Math.round(
                session.thesis.conviction <= 1
                  ? session.thesis.conviction * 100
                  : session.thesis.conviction,
              ),
        risk: session.thesis?.key_risks?.length ? "REVIEW" : "UNSPECIFIED",
        summary: session.decision?.rationale ?? null,
        created_at: session.as_of,
      }));
    },
  });
}

export function useInstruments() {
  return useQuery({
    queryKey: ["instruments"],
    staleTime: STALE,
    // The overview stream pushes ticks; polling only covers stream outages.
    refetchInterval: 60_000,
    queryFn: async (): Promise<Instrument[]> => {
      const response = await agentFetch("market/overview");
      const payload = (await response.json()) as { instruments?: Instrument[] };
      return payload.instruments ?? [];
    },
  });
}

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function useIndexHistory(symbol: string | undefined, range: string) {
  return useQuery({
    queryKey: ["terminal-index-history", symbol, range],
    enabled: Boolean(symbol),
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<{ candles: MarketCandle[]; source: string; as_of: string }> => {
      const response = await agentFetch(
        `terminal/indices/${encodeURIComponent(symbol!)}/history?range=${encodeURIComponent(range)}`,
      );
      return response.json();
    },
  });
}

export type StockUniverseItem = {
  symbol: string;
  company: string;
  sector: string;
  index: number;
};

export function useStockUniverse() {
  return useQuery({
    queryKey: ["stock-universe", "nifty50"],
    staleTime: 86_400_000,
    retry: false,
    queryFn: async (): Promise<StockUniverseItem[]> => {
      const response = await agentFetch("stocks/universe");
      const payload = (await response.json()) as { stocks?: StockUniverseItem[] };
      return payload.stocks ?? [];
    },
  });
}

export function useNews() {
  const query = useMarketNews();
  return {
    ...query,
    provider: query.data,
    data:
      query.data &&
      relevantNews(query.data)
        .slice(0, 6)
        .map((a) => ({
          id: a.id,
          headline: a.title,
          source: a.source,
          category: a.category,
          sentiment: a.sentiment.toUpperCase(),
          impact: a.impact.toUpperCase(),
          published_at: a.published_at,
          url: a.url,
        })),
  };
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    staleTime: STALE,
    queryFn: async (): Promise<MarketEvent[]> => {
      const response = await agentFetch("terminal/calendar");
      const payload = (await response.json()) as { events?: MarketEvent[] };
      return (payload.events ?? []).slice(0, 20);
    },
  });
}

export function useSentiment() {
  const query = useMarketSentiment();
  const result = query.data;
  return {
    ...query,
    data: result
      ? {
          ...result,
          score: result.score,
          id: result.updated_at,
          breakdown: Object.entries(result.components).map(([name, c]) => ({
            label: name.replaceAll("_", " "),
            value:
              c.available && c.score !== null
                ? `${Math.round(c.score)}/100 · ${Math.round(c.effective_weight * 100)}% weight`
                : (c.reason ?? "Unavailable"),
            score: c.available ? c.score : null,
          })),
        }
      : null,
  };
}

export function formatINR(value: number, opts: { compact?: boolean; exact?: boolean } = {}) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts.exact ? 2 : 0,
    maximumFractionDigits: opts.exact ? 2 : 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(value);
}

export function formatNum(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  const future = diff < 0;
  const text =
    mins < 1
      ? "just now"
      : mins < 60
        ? `${mins} min`
        : mins < 1440
          ? `${Math.round(mins / 60)} hr`
          : `${Math.round(mins / 1440)} d`;
  if (mins < 1) return text;
  return future ? `in ${text}` : `${text} ago`;
}
