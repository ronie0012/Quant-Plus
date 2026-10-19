import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { relativeTime, useNews } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { newsUnavailableHint } from "@/lib/intelligence-view";

function sentimentTone(s: string) {
  const v = s.toUpperCase();
  if (v === "POSITIVE") return "positive" as const;
  if (v === "NEGATIVE") return "negative" as const;
  return "neutral" as const;
}

export function NewsPanel() {
  const { data, provider, isLoading, isError, isFetching, refetch } = useNews();

  return (
    <Card delay={380} className="flex h-full flex-col">
      <CardHead
        title="Market intelligence"
        meta={`News that matters · ${provider?.provider_status.status ?? "market-wide"}`}
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-md border border-border px-3 py-2 text-xs text-subtle hover:text-foreground disabled:opacity-50"
          >
            {isFetching ? "Updating" : "Refresh"}
          </button>
        }
      />

      {isLoading && (
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && !data?.length && (
        <EmptyState
          title={
            isError || provider?.provider_status.status === "unavailable"
              ? "Market news unavailable"
              : "No recent market news"
          }
          hint={newsUnavailableHint(provider, isError)}
          onRetry={() => void refetch()}
        />
      )}

      {data && data.length > 0 && (
        <>
          {isError && (
            <p role="status" className="px-5 py-3 text-xs text-warning">
              Refresh failed · showing previously retrieved headlines.
            </p>
          )}
          <ul className="divide-y divide-border">
            {data.map((n, i) => {
              const tone = sentimentTone(n.sentiment);
              return (
                <li
                  key={n.id}
                  className="group/row flex items-start gap-4 px-5 py-3.5 transition-colors duration-300 hover:bg-panel-elevated/60"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                      tone === "positive" && "bg-positive",
                      tone === "negative" && "bg-negative",
                      tone === "neutral" && "bg-subtle",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug text-foreground/90 transition-colors group-hover/row:text-foreground">
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary-soft"
                      >
                        {n.headline}
                      </a>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Pill>{n.category}</Pill>
                      <span className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                        {n.source} · {relativeTime(n.published_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Pill tone={tone}>{n.sentiment}</Pill>
                    <span className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                      Impact {n.impact}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
