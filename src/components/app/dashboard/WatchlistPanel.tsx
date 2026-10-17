import { Card, CardHead, EmptyState, Skeleton } from "@/components/app/cards";
import { formatNum, useWatchlist } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/trading-desk-context";
import { useStockQuotes } from "@/hooks/use-agent-stock";

export function WatchlistPanel() {
  const { data, isLoading, isError, refetch } = useWatchlist();
  const { openTicket } = useTradingDesk();
  const feed = useStockQuotes((data ?? []).map((item) => item.symbol));

  return (
    <Card delay={460} className="flex h-full flex-col">
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
          onRetry={isError ? () => void refetch() : undefined}
        />
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((w) => {
            const quote = feed.quotes[w.symbol];
            const price = quote?.price ?? null;
            const change = quote?.change_pct ?? null;
            const up = (change ?? 0) >= 0;
            return (
              <li
                key={w.id}
                className="group/row flex items-center gap-3 px-5 py-3 transition-colors duration-300 hover:bg-panel-elevated/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[11px] tracking-[0.06em] uppercase">
                    {w.symbol}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-subtle">{w.company}</span>
                </span>
                <span className="w-20 text-right font-mono text-[12px] num-tabular">
                  {price == null ? "—" : `₹${formatNum(price)}`}
                </span>
                <span
                  className={cn(
                    "w-16 text-right font-mono text-[11px] num-tabular",
                    up ? "text-positive" : "text-negative",
                  )}
                >
                  {up ? "+" : ""}
                  {change == null ? "—" : `${formatNum(change)}%`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openTicket({ symbol: w.symbol, price: price ?? 0 })}
                  className="hidden h-7 shrink-0 px-2 font-medium text-[11px] tracking-[0.06em] uppercase text-subtle opacity-0 transition-all duration-300 group-hover/row:opacity-100 hover:border-primary/50 hover:text-primary-soft md:inline-flex"
                >
                  Trade
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
