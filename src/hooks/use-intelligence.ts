import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  intelligenceFetch,
  type StockNews,
  type StockNewsSentiment,
  type MarketSentiment,
  type MarketIntelligence,
  type SectorSentiment,
  type SentimentHistory,
} from "@/lib/intelligence-api";
import { regularNseSession } from "@/lib/market-session";
import { FAILURE_REFRESH_MS, NEWS_REFRESH_MS, sentimentRefreshMs } from "@/lib/intelligence-view";

// Re-key price-dependent queries at the session boundary instead of retaining
// a closed-session result until its five/ten-minute timer next fires.
function useSessionScope() {
  const [open, setOpen] = useState(() => regularNseSession());
  useEffect(() => {
    const timer = setInterval(() => setOpen(regularNseSession()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return open ? "open" : "closed";
}
const newsInterval = (query: { state: { data: StockNews | undefined; status: string } }) =>
  query.state.status === "error" || query.state.data?.provider_status.status === "unavailable"
    ? FAILURE_REFRESH_MS
    : NEWS_REFRESH_MS;
const marketOptions = {
  staleTime: 45_000,
  refetchInterval: (query: {
    state: { data: { data_quality: string } | undefined; status: string };
  }) =>
    sentimentRefreshMs(
      regularNseSession(),
      query.state.status === "error" || query.state.data?.data_quality === "DEGRADED",
    ),
  retry: false,
};
const stockSymbol = (symbol: string) =>
  symbol
    .trim()
    .toUpperCase()
    .replace(/^NSE:/, "")
    .replace(/(?:\.NS|-EQ)$/, "");

export function useStockNews(symbol: string) {
  const normalized = stockSymbol(symbol);
  return useQuery({
    queryKey: ["stock-news", normalized],
    enabled: /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(normalized),
    staleTime: NEWS_REFRESH_MS,
    refetchInterval: newsInterval,
    retry: false,
    queryFn: ({ signal }) =>
      intelligenceFetch<StockNews>(`stocks/${encodeURIComponent(normalized)}/news`, signal),
  });
}

export function useStockNewsSentiment(symbol: string) {
  const normalized = stockSymbol(symbol);
  const session = useSessionScope();
  return useQuery({
    ...marketOptions,
    queryKey: ["stock-news-sentiment", normalized, session],
    enabled: /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(normalized),
    queryFn: ({ signal }) =>
      intelligenceFetch<StockNewsSentiment>(
        `stocks/${encodeURIComponent(normalized)}/news-sentiment`,
        signal,
      ),
  });
}

export function useMarketSentiment() {
  const session = useSessionScope();
  return useQuery({
    ...marketOptions,
    queryKey: ["market-sentiment", session],
    queryFn: ({ signal }) => intelligenceFetch<MarketSentiment>("market/sentiment", signal),
  });
}

export function useSectorSentiment() {
  const session = useSessionScope();
  return useQuery({
    ...marketOptions,
    queryKey: ["sector-sentiment", session],
    queryFn: ({ signal }) => intelligenceFetch<SectorSentiment>("market/sectors", signal),
  });
}

export function useMarketNews() {
  return useQuery({
    queryKey: ["market-news"],
    staleTime: NEWS_REFRESH_MS,
    refetchInterval: newsInterval,
    retry: false,
    queryFn: ({ signal }) => intelligenceFetch<StockNews>("market/news", signal),
  });
}

export function useMarketIntelligence() {
  const session = useSessionScope();
  return useQuery({
    ...marketOptions,
    staleTime: NEWS_REFRESH_MS,
    refetchInterval: NEWS_REFRESH_MS,
    queryKey: ["market-intelligence", session],
    queryFn: ({ signal }) => intelligenceFetch<MarketIntelligence>("market/intelligence", signal),
  });
}

export function useMarketSentimentHistory(range: "1h" | "1d" | "5d" = "1h") {
  const session = useSessionScope();
  return useQuery({
    queryKey: ["market-sentiment-history", range, session],
    staleTime: 45_000,
    refetchInterval: () => sentimentRefreshMs(regularNseSession()),
    retry: false,
    queryFn: ({ signal }) =>
      intelligenceFetch<SentimentHistory>(
        `market/sentiment/history?range=${range}&interval=5m`,
        signal,
      ),
  });
}
