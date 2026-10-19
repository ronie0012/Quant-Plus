import { Gauge, RefreshCw } from "lucide-react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { ProgressBar } from "@/components/app/pages/workspace";
import { relativeTime } from "@/hooks/use-dashboard-data";
import { useStockNews, useStockNewsSentiment } from "@/hooks/use-intelligence";
import { newsUnavailableHint, priceConfirmationText, relevantNews } from "@/lib/intelligence-view";

export function StockNewsIntelligence({ symbol }: { symbol: string }) {
  const news = useStockNews(symbol);
  const sentiment = useStockNewsSentiment(symbol);
  const summary = sentiment.data;
  const articles = relevantNews(news.data);
  const refresh = () => {
    void news.refetch();
    void sentiment.refetch();
  };
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
            <p className="text-xs text-muted-foreground">{priceConfirmationText(summary)}</p>
            {summary.price_as_of && (
              <p className="text-xs text-subtle">
                Price observed {relativeTime(summary.price_as_of)}
              </p>
            )}
            {!!summary.top_drivers.length && (
              <div className="border-t border-border pt-3">
                <h3 className="text-xs font-medium">Top scored news drivers</h3>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {summary.top_drivers.slice(0, 3).map((article) => (
                    <li key={article.id}>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary-soft"
                      >
                        {article.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sentiment.isError && (
              <p role="status" className="text-xs text-warning">
                Refresh failed · showing the previous analysis.
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            title="News sentiment unavailable"
            hint={
              sentiment.isError
                ? "Could not reach sentiment intelligence. Check the backend connection and retry."
                : "No recent headlines were eligible for scoring. Relevant unscored news can still appear below."
            }
            onRetry={refresh}
          />
        )}
      </Card>
      <Card delay={340}>
        <CardHead
          title="News & drivers"
          meta={
            news.data
              ? `${news.data.provider_status.provider.replaceAll("_", " ")} · ${news.data.provider_status.status} · ${articles.length} relevant`
              : "Recent company headlines and scored drivers"
          }
          action={
            <button
              type="button"
              onClick={refresh}
              disabled={news.isFetching || sentiment.isFetching}
              aria-label="Refresh stock news and sentiment"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-subtle hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${news.isFetching || sentiment.isFetching ? "animate-spin" : ""}`}
              />
            </button>
          }
        />
        {news.isLoading ? (
          <Skeleton className="m-5 h-32" />
        ) : articles.length ? (
          <>
            {(news.isError || news.data?.provider_status.status !== "available") && (
              <p role="status" className="border-b border-border px-5 py-3 text-xs text-warning">
                {news.isError
                  ? "Refresh failed · showing previously retrieved headlines."
                  : "Some news providers are unavailable · coverage is partial."}
              </p>
            )}
            <ul className="divide-y divide-border">
              {articles.map((article) => (
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
                    {!article.influences_sentiment && <Pill>Not scored</Pill>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            title={
              news.isError || news.data?.provider_status.status === "unavailable"
                ? "Stock news unavailable"
                : "No relevant recent stock news"
            }
            hint={newsUnavailableHint(news.data, news.isError)}
            onRetry={refresh}
          />
        )}
      </Card>
    </>
  );
}
