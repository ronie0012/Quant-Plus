import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentFetch, type MarketHistory, type MarketQuote, type Prediction } from "@/lib/agent-api";
import { QuoteSubscriptions, normalizeMarketSymbols } from "@/lib/market-subscriptions";
import { quoteIsStale } from "@/lib/market-session";

/** Read completed research ahead of navigation; never launch a model job on hover. */
export function usePredictionPreload(symbols: string[]) {
  const client = useQueryClient();
  const names = [...new Set(symbols)].slice(0, 50).join(",");
  const snapshots = useQuery<{ predictions: Record<string, Prediction> }, Error>({
    queryKey: ["prediction-snapshots", names],
    queryFn: async ({ signal }) =>
      (
        await agentFetch(`stocks/predictions?symbols=${encodeURIComponent(names)}`, { signal })
      ).json(),
    enabled: !!names,
    staleTime: 30_000,
    retry: false,
  });
  useEffect(() => {
    for (const [symbol, prediction] of Object.entries(snapshots.data?.predictions ?? {})) {
      const key = ["agent-prediction", symbol];
      const current = client.getQueryData<Prediction>(key);
      if (
        !current ||
        (current.status === "done" && Date.parse(prediction.as_of) > Date.parse(current.as_of))
      ) {
        // The research cutoff, not preload time, determines whether it needs a refresh.
        client.setQueryData(key, prediction, { updatedAt: Date.parse(prediction.as_of) });
      }
    }
  }, [snapshots.data, client]);
}

export function useStockPrediction(symbol: string) {
  const client = useQueryClient();
  const resume = useMutation<Prediction, Error>({
    mutationFn: async () =>
      (
        await agentFetch(`stocks/${encodeURIComponent(symbol)}/prediction?retry=true`, {
          method: "POST",
        })
      ).json(),
    onSuccess: (data) => client.setQueryData(["agent-prediction", symbol], data),
    onMutate: () => client.cancelQueries({ queryKey: ["agent-prediction", symbol] }),
  });
  const query = useQuery<Prediction, Error>({
    queryKey: ["agent-prediction", symbol],
    queryFn: async ({ signal }) => {
      const current = client.getQueryData<Prediction>(["agent-prediction", symbol]);
      const running = current?.status === "queued" || current?.status === "running";
      const response = await agentFetch(
        running
          ? `stocks/sessions/${current.id}`
          : `stocks/${encodeURIComponent(symbol)}/prediction`,
        { method: running ? "GET" : "POST", signal },
      );
      return response.json();
    },
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running"
        ? 1_000
        : status === "done"
          ? Math.max(60, query.state.data?.refresh_seconds ?? 900) * 1_000
          : 15_000;
    },
  });
  return {
    ...query,
    retryAnalysis: resume.mutate,
    isRetrying: resume.isPending,
    retryError: resume.error,
  };
}

export function useMarketHistory(symbol: string, range: string) {
  return useQuery<MarketHistory, Error>({
    queryKey: ["market-history", symbol, range],
    queryFn: async ({ signal }) =>
      (
        await agentFetch(`market/${encodeURIComponent(symbol)}/history?range=${range}`, { signal })
      ).json(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}

export type StockTechnicalMetrics = {
  symbol: string;
  rsi: number | null;
  momentum: number | null;
  return_20d: number | null;
  volatility: number | null;
  sma20: number | null;
  ema50: number | null;
  relative_volume: number | null;
  week_low: number | null;
  week_high: number | null;
  source: string | null;
  as_of: string | null;
  sample_size: number;
  data_quality: string;
};

export type StockFundamentals = {
  symbol: string;
  market_cap: number | null;
  pe_ratio: number | null;
  beta: number | null;
  dividend_yield: number | null;
  week_low: number | null;
  week_high: number | null;
  source: string | null;
  updated_at: string;
  data_quality: string;
};

export function useStockMetrics(symbol: string) {
  return useQuery<StockTechnicalMetrics, Error>({
    queryKey: ["stock-metrics", symbol],
    enabled: Boolean(symbol),
    staleTime: 300_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const payload = (await (
        await agentFetch(`terminal/metrics?symbols=${encodeURIComponent(symbol)}`, { signal })
      ).json()) as { metrics: Record<string, StockTechnicalMetrics> };
      const result = payload.metrics[symbol];
      if (!result) throw new Error("Technical metrics unavailable");
      return result;
    },
  });
}

export function useStockFundamentals(symbol: string) {
  return useQuery<StockFundamentals, Error>({
    queryKey: ["stock-fundamentals", symbol],
    enabled: Boolean(symbol),
    staleTime: 21_600_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (await agentFetch(`terminal/fundamentals/${encodeURIComponent(symbol)}`, { signal })).json(),
  });
}

const marketSubscriptions = new QuoteSubscriptions(agentFetch);

export function useStockQuote(symbol: string, enabled = true) {
  const stream = useStockQuotes(enabled ? [symbol] : []);
  const quote = stream.quotes[normalizeMarketSymbols([symbol])[0] ?? ""] ?? null;
  const stale = quoteIsStale(quote, stream.connected, stream.now);
  return { quote, connected: stream.connected, stale, error: stream.error ?? quote?.error ?? null };
}

export function useStockQuotes(symbols: string[]) {
  const names = normalizeMarketSymbols(symbols).join(",");
  const [snapshot, setSnapshot] = useState<{
    quotes: Record<string, MarketQuote>;
    connected: boolean;
    error: string | null;
    now: number;
  }>({ quotes: {}, connected: false, error: null, now: 0 });
  useEffect(
    () => marketSubscriptions.subscribe(names ? names.split(",") : [], setSnapshot),
    [names],
  );
  return snapshot;
}
