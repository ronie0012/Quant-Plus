import { useEffect, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentFetch, type MarketHistory, type MarketQuote, type Prediction } from "@/lib/agent-api";
import { QuoteSubscriptions, normalizeMarketSymbols } from "@/lib/market-subscriptions";
import { quoteIsStale } from "@/lib/market-session";
import {
  completedPrediction,
  predictionKey,
  predictionPollInterval,
  predictionStaleTime,
  predictionSymbol,
  preserveCompleted,
  readPrediction,
  startPrediction,
} from "@/hooks/prediction-query";

/** Read completed research ahead of navigation; never launch a model job on hover. */
export function usePredictionPreload(symbols: string[]) {
  const client = useQueryClient();
  const names = [...new Set(symbols.map(predictionSymbol).filter(Boolean))]
    .sort()
    .slice(0, 50)
    .join(",");
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
      const key = predictionKey(predictionSymbol(symbol));
      const current = client.getQueryData<Prediction>(key);
      if (prediction.status !== "done" || !Number.isFinite(Date.parse(prediction.as_of))) continue;
      if (
        !current ||
        (current.status === "done" && Date.parse(prediction.as_of) > Date.parse(current.as_of))
      ) {
        // The research cutoff, not preload time, determines whether it needs a refresh.
        client.setQueryData(key, prediction, { updatedAt: Date.parse(prediction.as_of) });
      } else if (current.status !== "done" && completedPrediction(current)?.id !== prediction.id) {
        const merged = preserveCompleted(prediction, current);
        if (merged !== current)
          client.setQueryData(key, merged, {
            updatedAt: client.getQueryState(key)?.dataUpdatedAt ?? Date.parse(prediction.as_of),
          });
      }
    }
  }, [snapshots.data, client]);
}

export function useStockPrediction(symbol: string) {
  const client = useQueryClient();
  const name = predictionSymbol(symbol);
  const key = predictionKey(name);
  const mutationKey = ["retry-prediction", name];
  const retrying = useIsMutating({ mutationKey, exact: true }) > 0;
  const resume = useMutation<Prediction, Error>({
    mutationKey,
    retry: false,
    mutationFn: () => startPrediction(client, name, true),
    onSuccess: (data) =>
      client.setQueryData<Prediction>(key, (current) => preserveCompleted(current, data)),
    onMutate: () => client.cancelQueries({ queryKey: key, exact: true }),
  });
  const query = useQuery<Prediction, Error>({
    queryKey: key,
    enabled: /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(name),
    // Only read the signal for GET. QueryObserver then retains an accepted
    // start request across the last subscriber unmounting (including StrictMode).
    queryFn: (context) => readPrediction(client, name, () => context.signal),
    staleTime: (query) => predictionStaleTime(query.state),
    retry: false,
    retryOnMount: false,
    refetchOnMount: (query) => query.state.status !== "error",
    refetchOnWindowFocus: (query) => query.state.status !== "error",
    refetchOnReconnect: (query) => query.state.status !== "error",
    refetchInterval: (query) => predictionPollInterval(query.state),
  });
  return {
    ...query,
    refetch: () => query.refetch({ cancelRefetch: false }),
    retryAnalysis: () => {
      if (
        client.getQueryData<Prediction>(key)?.status.startsWith("failed") &&
        !client.getMutationCache().find({ mutationKey, exact: true, status: "pending" })
      )
        resume.mutate();
    },
    isRetrying: retrying,
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
