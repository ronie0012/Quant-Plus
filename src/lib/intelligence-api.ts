import { workspaceAuthorization } from "@/lib/workspace-session";

export type DataQuality = "GOOD" | "PARTIAL" | "DEGRADED";
export type Quality = { data_quality: DataQuality; confidence: number; updated_at: string };
export type NewsArticle = {
  id: string;
  symbol: string;
  company: string;
  title: string;
  source: string;
  published_at: string;
  url: string;
  snippet: string;
  provider: string;
  relevance_score: number;
  sentiment: "positive" | "neutral" | "negative";
  sentiment_score: number;
  impact: "low" | "medium" | "high";
  impact_score: number;
  category: string;
  confidence: number;
  influences_sentiment: boolean;
  market_category?: string;
  expected_duration?: "INTRADAY" | "SHORT_TERM" | "MULTIDAY" | "LONG_TERM";
  affected_sectors?: string[];
};
export type ProviderStatus = {
  provider: string;
  status: string;
  queries_succeeded: number;
  queries_total: number;
};
export type StockNews = Quality & {
  symbol: string;
  company: string;
  articles: NewsArticle[];
  provider_status: ProviderStatus;
};
export type StockNewsSentiment = Quality & {
  symbol: string;
  score: number | null;
  news_sentiment_score: number | null;
  label: string;
  positive_articles: number;
  negative_articles: number;
  neutral_articles: number;
  high_impact_articles: number;
  price_confirmation: boolean | null;
  price_confirmation_status: string;
  news_price_divergence: boolean;
  top_drivers: NewsArticle[];
};
export type SectorScore = Quality & {
  score: number | null;
  label: string;
  available: boolean;
  change_pct: number | null;
  as_of: string | null;
  change_1h?: number | null;
  trend?: string;
  breadth?: number | null;
  momentum?: number | null;
  news?: number | null;
};
export type MarketComponent = {
  score: number | null;
  confidence: number;
  weight: number;
  effective_weight: number;
  available: boolean;
  reason?: string;
  method?: string;
  advancing?: number;
  declining?: number;
  unchanged?: number;
  coverage?: number;
  relative_volume?: number | null;
  up_volume_ratio?: number | null;
  down_volume_ratio?: number | null;
  confirmation?: string;
  breadth_trend?: string;
  pct_advancing?: number | null;
  advance_decline_ratio?: number | null;
};
export type SentimentTrend = {
  current: number | null;
  direction: string;
  trend?: string;
  velocity?: string;
  change_15m: number | null;
  change_30m: number | null;
  change_1h: number | null;
  day_change?: number | null;
  session_high?: number | null;
  session_low?: number | null;
};
export type Divergence = {
  type: string;
  severity: string;
  direction: string;
  description: string;
  confidence: number;
};
export type MarketSentiment = Quality & {
  score: number | null;
  label: string;
  regime: string;
  regime_confidence: number;
  market_session: "open" | "closed" | null;
  weight_coverage: number;
  components: Record<string, MarketComponent>;
  sectors: Record<string, SectorScore>;
  warnings: string[];
  important_news: NewsArticle[];
  data_quality_score?: number;
  coverage?: Record<string, number>;
  trend?: SentimentTrend;
  signal_alignment?: { score: number | null; label: string; available?: number };
  divergences?: Divergence[];
  drivers?: string[];
  risks?: string[];
  market_status?: string;
  score_basis?: string;
  base_weights?: Record<string, number>;
  effective_weights?: Record<string, number>;
};
export type SectorSentiment = Quality & {
  market: number | null;
  sectors: Record<string, SectorScore>;
  bullish_sectors?: number;
  neutral_sectors?: number;
  bearish_sectors?: number;
};
export type MarketIntelligence = MarketSentiment & {
  ai_status: string;
  ai_explanation: { headline: string; summary: string; drivers: string[]; risks: string[] } | null;
  risks: string[];
};
export type SentimentSnapshot = {
  timestamp: string;
  score: number | null;
  label: string;
  confidence: number;
  data_quality: DataQuality;
  regime: string;
  components: Record<string, number | null>;
  alignment_score?: number | null;
};
export type SentimentHistory = { range: string; interval: string; snapshots: SentimentSnapshot[] };

export async function intelligenceFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const authorization = await workspaceAuthorization("Sign in to access market intelligence");
  const response = await fetch(`/api/${path}`, {
    headers: { Authorization: authorization },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Intelligence unavailable (${response.status}). Please retry.`);
  return response.json() as Promise<T>;
}
