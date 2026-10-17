import { Gauge, Newspaper } from "lucide-react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { ProgressBar } from "@/components/app/pages/workspace";
import { relativeTime } from "@/hooks/use-dashboard-data";
import { useStockNews, useStockNewsSentiment } from "@/hooks/use-intelligence";

export function StockNewsIntelligence({ symbol }: { symbol: string }) {
  const news = useStockNews(symbol);
  const sentiment = useStockNewsSentiment(symbol);
  const summary = sentiment.data;
  return (
    <>
      <Card delay={260}>
        <CardHead
          title="Stock news sentiment"
          meta="Weighted relevance, impact, confidence and recency"
          action={<Gauge className="h-4 w-4 text-primary-soft" />}
        />
        {sentiment.isLoading ? (
          <Skeleton className="m-5 h-24" />
        ) : summary?.score != null ? (
          <div className="space-y-4 p-5">
            <div className="flex items-end justify-between">
              <p className="font-mono text-4xl num-tabular">{summary.score}</p>
              <Pill
                tone={
                  summary.score >= 60 ? "positive" : summary.score <= 40 ? "negative" : "neutral"
                }
              >
                {summary.label.replaceAll("_", " ")}
              </Pill>
            </div>
            <ProgressBar
              value={summary.score}
              tone={summary.score >= 60 ? "positive" : summary.score <= 40 ? "negative" : "primary"}
            />
            <p className="text-xs text-subtle">
              {summary.positive_articles} positive · {summary.neutral_articles} neutral ·{" "}
              {summary.negative_articles} negative · {summary.high_impact_articles} high impact
            </p>
            <p className="text-xs text-subtle">
              Confidence {Math.round(summary.confidence * 100)}% · {summary.data_quality} · updated{" "}
              {relativeTime(summary.updated_at)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.news_price_divergence
                ? "News/price divergence: price is moving against the news tone."
                : summary.price_confirmation === true
                  ? "Daily price direction supports the news tone."
                  : summary.price_confirmation === false
                    ? "Daily price direction does not confirm the news tone."
                    : "Price confirmation unavailable."}
            </p>
          </div>
        ) : (
          <EmptyState
            title="News sentiment unavailable"
            hint="No sufficiently relevant recent headlines or the provider is unavailable."
            onRetry={() => void sentiment.refetch()}
          />
        )}
      </Card>
      <Card delay={340}>
        <CardHead
          title="News & drivers"
          meta="Recent headlines · Google News RSS"
          action={<Newspaper className="h-4 w-4 text-primary-soft" />}
        />
        {news.isLoading ? (
          <Skeleton className="m-5 h-32" />
        ) : news.data?.articles.some((a) => a.influences_sentiment) ? (
          <ul className="divide-y divide-border">
            {news.data.articles
              .filter((a) => a.influences_sentiment)
              .map((article) => (
                <li key={article.id} className="p-4 transition-colors hover:bg-panel-elevated">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] leading-relaxed hover:text-primary-soft"
                  >
                    {article.title}
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-subtle">
                      {article.source} · {relativeTime(article.published_at)}
                    </span>
                    <Pill
                      tone={
                        article.sentiment === "positive"
                          ? "positive"
                          : article.sentiment === "negative"
                            ? "negative"
                            : "neutral"
                      }
                    >
                      {article.sentiment}
                    </Pill>
                    <Pill tone={article.impact === "high" ? "warning" : "neutral"}>
                      {article.impact} impact
                    </Pill>
                    <Pill>{article.category}</Pill>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <EmptyState
            title="No relevant recent stock news"
            hint="Provider failures leave live prices and research available."
            onRetry={() => void news.refetch()}
          />
        )}
      </Card>
    </>
  );
}
