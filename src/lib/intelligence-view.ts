import type { NewsArticle, StockNews, StockNewsSentiment } from "./intelligence-api";

export const NEWS_REFRESH_MS = 600_000;
export const FAILURE_REFRESH_MS = 30_000;

/** Price confirmation follows the market cadence, not the ten-minute RSS cache. */
export function sentimentRefreshMs(open: boolean, degraded = false) {
  return degraded ? FAILURE_REFRESH_MS : open ? 45_000 : 300_000;
}

/** A relevant headline remains readable even when its language cannot be scored. */
export function relevantNews(news: StockNews | undefined): NewsArticle[] {
  if (!news) return [];
  const threshold = news.relevance_threshold ?? 55;
  return news.articles
    .filter((article) => article.relevance_score >= threshold)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

export function newsUnavailableHint(news: StockNews | undefined, failed = false) {
  if (failed) return "Could not reach news intelligence. Check the backend connection and retry.";
  if (news?.provider_status.status === "unavailable")
    return "News providers are temporarily unavailable. Prices and research are separate services.";
  if (news?.articles.length)
    return "Headlines were retrieved, but none met the company or market relevance threshold.";
  return "The providers returned no recent relevant headlines. New stories will appear automatically.";
}

export function priceConfirmationText(summary: StockNewsSentiment) {
  if (summary.price_confirmation_status === "unavailable_market_closed")
    return "Market closed · intraday price confirmation is paused.";
  if (summary.price_confirmation_status === "unavailable_market_session")
    return "Price confirmation unavailable · the market session could not be verified.";
  if (summary.price_confirmation_status === "unavailable_news_newer_than_price")
    return "Awaiting a price observation newer than the latest scored headline.";
  if (summary.news_price_divergence)
    return "News/price divergence: daily price direction is moving against the news tone.";
  if (summary.price_confirmation === true) return "Daily price direction supports the news tone.";
  if (summary.price_confirmation === false)
    return "Daily price direction does not confirm the news tone.";
  return "Price confirmation unavailable · a fresh timestamped broker quote is required.";
}
