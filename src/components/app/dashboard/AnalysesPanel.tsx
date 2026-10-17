import { Link } from "@tanstack/react-router";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { relativeTime, useAnalyses } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

function verdictTone(v: string) {
  const s = v.toUpperCase();
  if (s === "BUY") return "positive" as const;
  if (s === "SELL") return "negative" as const;
  return "neutral" as const;
}

export function AnalysesPanel() {
  const { data, isLoading, isError, refetch } = useAnalyses();

  return (
    <Card delay={540} className="flex h-full flex-col">
      <CardHead
        title="Recent analyses"
        meta="From the AI investment committee"
        action={
          <Link
            to="/app/$section"
            params={{ section: "committee" }}
            className="hidden border border-border px-3 py-1.5 font-medium text-[11px] tracking-[0.06em] uppercase text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary-soft sm:block"
          >
            Run analysis
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {(isError || (!isLoading && (!data || data.length === 0))) && (
        <EmptyState
          title="No analyses yet"
          hint="Run an analysis to see the committee verdict here."
          onRetry={isError ? () => void refetch() : undefined}
        />
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((a) => (
            <li
              key={a.id}
              className="group/row px-5 py-3.5 transition-colors duration-300 hover:bg-panel-elevated/60"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-[11px] tracking-[0.06em] uppercase">
                  {a.symbol}
                </span>
                <Pill tone={verdictTone(a.verdict)}>{a.verdict}</Pill>
                <span className="ml-auto font-mono text-[11px] num-tabular text-muted-foreground">
                  {a.conviction == null ? "—" : `${a.conviction}/100`}
                </span>
                <span className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                  {a.risk}
                </span>
              </div>
              {a.summary && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  {a.summary}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border">
                  <span
                    className={cn(
                      "block h-px transition-[width] duration-[1200ms] ease-out",
                      verdictTone(a.verdict) === "negative" ? "bg-negative/70" : "bg-primary/70",
                    )}
                    style={{ width: `${Math.min(100, a.conviction ?? 0)}%` }}
                  />
                </span>
                <span className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                  {relativeTime(a.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
