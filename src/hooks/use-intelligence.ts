import { useQuery } from "@tanstack/react-query";
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

const NEWS_TTL = 600_000;
const marketInterval = () => (regularNseSession() ? 45_000 : 300_000);
const marketOptions = { staleTime: 45_000, refetchInterval: marketInterval, retry: false };
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
    staleTime: NEWS_TTL,
    refetchInterval: NEWS_TTL,
    retry: false,
    queryFn: ({ signal }) =>
      intelligenceFetch<StockNews>(`stocks/${encodeURIComponent(normalized)}/news`, signal),
  });
}

export function useStockNewsSentiment(symbol: string) {
  const normalized = stockSymbol(symbol);
  return useQuery({
    queryKey: ["stock-news-sentiment", normalized],
    enabled: /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(normalized),
    staleTime: NEWS_TTL,
    refetchInterval: NEWS_TTL,
    retry: false,
    queryFn: ({ signal }) =>
      intelligenceFetch<StockNewsSentiment>(
        `stocks/${encodeURIComponent(normalized)}/news-sentiment`,
        signal,
      ),
  });
}

export function useMarketSentiment() {
  return useQuery({
    ...marketOptions,
    queryKey: ["market-sentiment"],
    queryFn: ({ signal }) => intelligenceFetch<MarketSentiment>("market/sentiment", signal),
  });
}

export function useSectorSentiment() {
  return useQuery({
    ...marketOptions,
    queryKey: ["sector-sentiment"],
    queryFn: ({ signal }) => intelligenceFetch<SectorSentiment>("market/sectors", signal),
  });
}

export function useMarketNews() {
  return useQuery({
    queryKey: ["market-news"],
    staleTime: NEWS_TTL,
    refetchInterval: NEWS_TTL,
    retry: false,
    queryFn: ({ signal }) => intelligenceFetch<StockNews>("market/news", signal),
  });
}

export function useMarketIntelligence() {
  return useQuery({
    ...marketOptions,
    staleTime: NEWS_TTL,
    refetchInterval: NEWS_TTL,
    queryKey: ["market-intelligence"],
    queryFn: ({ signal }) => intelligenceFetch<MarketIntelligence>("market/intelligence", signal),
  });
}

export function useMarketSentimentHistory(range: "1h" | "1d" | "5d" = "1h") {
  return useQuery({
    queryKey: ["market-sentiment-history", range],
    staleTime: 45_000,
    refetchInterval: marketInterval,
    retry: false,
    queryFn: ({ signal }) =>
      intelligenceFetch<SentimentHistory>(
        `market/sentiment/history?range=${range}&interval=5m`,
        signal,
      ),
  });
}
