import { Card, CardHead, EmptyState, Skeleton } from "@/components/app/cards";
import { formatNum, useWatchlist } from "@/hooks/use-dashboard-data";
import { series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function WatchlistPanel() {
  const { data, isLoading, isError, refetch } = useWatchlist();

  return (
    <Card className="flex h-full flex-col">
      <CardHead title="Watchlist" meta="Your tracked instruments" />

      {isLoading && (
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {(isError || (!isLoading && (!data || data.length === 0))) && (
        <EmptyState
          title="Watchlist is empty"
          hint="Add instruments to follow them here."
          onRetry={() => void refetch()}
        />
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((w) => {
            const up = Number(w.change_pct) >= 0;
            const spark = series(
              w.symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 3),
              24,
              w.change_pct,
            );
            return (
              <li
                key={w.id}
                className="group/row flex items-center gap-3 px-5 py-3 transition-colors duration-300 hover:bg-panel-elevated/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] tracking-[0.14em] uppercase">
                    {w.symbol}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-subtle">{w.company}</span>
                </span>
                <svg viewBox="0 0 60 16" className="hidden h-4 w-14 sm:block" aria-hidden="true">
                  <path
                    d={toPath(spark, 60, 16)}
                    fill="none"
                    strokeWidth="1.2"
                    className={cn("opacity-70 transition-opacity group-hover/row:opacity-100", up ? "stroke-positive" : "stroke-negative")}
                  />
                </svg>
                <span className="w-20 text-right font-mono text-[12px] num-tabular">
                  ₹{formatNum(Number(w.price))}
                </span>
                <span
                  className={cn(
                    "w-16 text-right font-mono text-[11px] num-tabular",
                    up ? "text-positive" : "text-negative",
                  )}
                >
                  {up ? "+" : ""}
                  {formatNum(Number(w.change_pct))}%
                </span>
                <button
                  type="button"
                  className="hidden shrink-0 border border-border px-2 py-1 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle opacity-0 transition-all duration-300 group-hover/row:opacity-100 hover:border-primary/50 hover:text-primary-soft md:block"
                >
                  Analyze
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
