/**
 * Shared data loaders for the analytical workspaces. Histories are fetched
 * once per symbol and range and cached by React Query, so the regime map,
 * strategy lab, portfolio X-ray and risk compiler reuse the same bars.
 */
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { agentFetch, type MarketHistory, type Prediction } from "@/lib/agent-api";
import { selectRows } from "@/lib/workspace-api";
import { validateCandles, type Candle } from "@/lib/market-history";
import type { Order } from "@/hooks/use-orders";
import { useMarketNews, useStockNews } from "@/hooks/use-intelligence";
import { sessionDay } from "@/lib/exchange-calendar";

/** Whether the exchange is expected to trade on an IST date (unverified years count as trading). */
export function exchangeDay(date: string) {
  const status = sessionDay(date).status;
  return status !== "WEEKEND" && status !== "HOLIDAY";
}

export type IndexKey = "NIFTY" | "BANK" | "VIX";

export type FillRow = {
  id: string;
  order_id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  reference_price: number;
  liquidity_limited: boolean;
  slippage_bps: number;
  charges: { total: number } | null;
  created_at: string;
};

/** Validated 1-year daily bars for several symbols. */
export function useHistories(
  symbols: string[],
  range: "1Y" | "6M" | "3M" | "1M" | "1W" | "1D" = "1Y",
) {
  const unique = [...new Set(symbols)];
  const results = useQueries({
    queries: unique.map((symbol) => ({
      queryKey: ["market-history", symbol, range],
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<MarketHistory> =>
        (
          await agentFetch(`market/${encodeURIComponent(symbol)}/history?range=${range}`, {
            signal,
          })
        ).json(),
      staleTime: 300_000,
      retry: 1,
    })),
  });
  const key = results.map((r) => r.dataUpdatedAt).join(",");
  const bars = useMemo(() => {
    const out: Record<string, Candle[]> = {};
    unique.forEach((symbol, i) => {
      const data = results[i]?.data;
      if (data) out[symbol] = validateCandles(data.candles).candles;
    });
    return out;
    // `key` captures every result's update time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unique.join(",")]);
  const sources = useMemo(() => {
    const out: Record<string, { source: string; as_of: string; delayed: boolean }> = {};
    unique.forEach((symbol, i) => {
      const data = results[i]?.data;
      if (data)
        out[symbol] = { source: data.source, as_of: data.as_of, delayed: data.delayed ?? false };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unique.join(",")]);
  return {
    bars,
    sources,
    loading: results.some((r) => r.isLoading),
    loaded: results.filter((r) => r.data).length,
    failed: unique.filter((_, i) => results[i]?.isError),
    total: unique.length,
  };
}

/** One symbol's history, sharing the cache key used by useMarketHistory. */
export function useSymbolHistory(symbol: string, range: string, enabled = true) {
  return useQuery({
    queryKey: ["market-history", symbol, range],
    enabled: enabled && Boolean(symbol),
    staleTime: 60_000,
    retry: 1,
    queryFn: async ({ signal }): Promise<MarketHistory> =>
      (
        await agentFetch(`market/${encodeURIComponent(symbol)}/history?range=${range}`, { signal })
      ).json(),
  });
}

/** Latest completed research for a symbol, read-only: never starts a model job. */
export function usePredictionSnapshot(symbol: string) {
  return useQuery({
    queryKey: ["prediction-snapshot", symbol],
    enabled: Boolean(symbol),
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<Prediction | null> => {
      const payload = (await (
        await agentFetch(`stocks/predictions?symbols=${encodeURIComponent(symbol)}`, { signal })
      ).json()) as { predictions?: Record<string, Prediction> };
      return payload.predictions?.[symbol] ?? null;
    },
  });
}

/** 1-year daily index bars. */
export function useIndexBars(index: IndexKey, enabled = true) {
  return useQuery({
    queryKey: ["terminal-index-history", index, "1Y"],
    enabled,
    staleTime: 300_000,
    retry: false,
    queryFn: async ({ signal }): Promise<{ candles: Candle[]; source: string; as_of: string }> => {
      const response = await agentFetch(`terminal/indices/${index}/history?range=1Y`, { signal });
      const payload = (await response.json()) as {
        candles: Candle[];
        source: string;
        as_of: string;
      };
      return { ...payload, candles: validateCandles(payload.candles).candles };
    },
  });
}

/** Every order in the book (bounded), oldest first, for behavioural analysis. */
export function useAllOrders() {
  return useQuery({
    queryKey: ["orders", "all-history"],
    staleTime: 30_000,
    queryFn: () =>
      selectRows<Order>("orders", { order: { field: "created_at", ascending: true }, limit: 1000 }),
  });
}

export function useFills() {
  return useQuery({
    queryKey: ["fills"],
    staleTime: 30_000,
    queryFn: () =>
      selectRows<FillRow>("fills", {
        order: { field: "created_at", ascending: true },
        limit: 1000,
      }),
  });
}

export type ResearchSession = {
  id: string;
  instrument: string;
  as_of: string;
  status: string;
  decision?: { action?: string; rationale?: string } | null;
  thesis?: {
    direction?: string;
    conviction?: number;
    key_evidence?: string[];
    key_risks?: string[];
  } | null;
  challenge?: { status?: string; reasons?: string[] } | null;
  proposal?: { direction?: string; entry?: number; stop?: number; target?: number } | null;
  reports?: Record<string, { summary?: string; confidence?: number }>;
};

/** Completed shared research sessions (up to 200, newest first). */
export function useResearchSessions() {
  return useQuery({
    queryKey: ["research-sessions", 200],
    staleTime: 120_000,
    retry: false,
    queryFn: async ({ signal }): Promise<ResearchSession[]> => {
      const out: ResearchSession[] = [];
      for (let offset = 0; offset < 200; offset += 100) {
        const response = await agentFetch(`terminal/research?limit=100&offset=${offset}`, {
          signal,
        });
        const payload = (await response.json()) as {
          sessions?: ResearchSession[];
          next_offset?: number | null;
        };
        out.push(...(payload.sessions ?? []));
        if (payload.next_offset == null) break;
      }
      return out;
    },
  });
}

/** Market news plus one symbol's news, de-duplicated. */
export function useNewsFor(symbol: string | null) {
  const market = useMarketNews();
  const stock = useStockNews(symbol ?? "");
  return useMemo(() => {
    const seen = new Set<string>();
    const articles = [...(stock.data?.articles ?? []), ...(market.data?.articles ?? [])].filter(
      (a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      },
    );
    return { articles, loading: market.isLoading || stock.isLoading };
  }, [market.data, stock.data, market.isLoading, stock.isLoading]);
}

export type CalendarRow = {
  id: string;
  event: string;
  event_time: string;
  time_known?: boolean;
  source?: string;
  url?: string;
  symbol?: string;
};

/** Full NSE calendar (board meetings and corporate actions) with provider status. */
export function useCalendar(enabled = true) {
  return useQuery({
    queryKey: ["events", "full"],
    enabled,
    staleTime: 600_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await agentFetch("terminal/calendar", { signal });
      const payload = (await response.json()) as {
        events?: CalendarRow[];
        providers?: { source: string; status: string }[];
        updated_at?: string;
      };
      return {
        events: payload.events ?? [],
        providers: payload.providers ?? [],
        fetched_at: payload.updated_at ?? new Date().toISOString(),
      };
    },
  });
}
