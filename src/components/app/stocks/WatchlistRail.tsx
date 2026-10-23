import { Link } from "@tanstack/react-router";
import { formatNum, useWatchlist } from "@/hooks/use-dashboard-data";
import { useStockQuotes } from "@/hooks/use-agent-stock";
import { usePriceFlash } from "@/hooks/use-price-flash";
import type { MarketQuote } from "@/lib/agent-api";
import { cn } from "@/lib/utils";

/** Live watchlist beside the chart: one click switches the instrument. */
export function WatchlistRail({ active }: { active: string }) {
  const { data: items, isPending } = useWatchlist();
  const symbols = (items ?? []).map((item) => item.symbol);
  const feed = useStockQuotes(symbols);
  return (
    <section
      aria-label="Watchlist"
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-panel/60"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Watchlist</h2>
        <Link
          to="/app/$section"
          params={{ section: "watchlist" }}
          className="text-[12px] text-primary-soft hover:text-foreground"
        >
          Manage
        </Link>
      </header>
      {isPending ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-8 rounded" />
          ))}
        </div>
      ) : !items?.length ? (
        <p className="px-4 py-4 text-[12px] text-subtle">
          Add stocks with “Add to watchlist” to follow them here.
        </p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto [scrollbar-width:thin]">
          {items.map((item) => (
            <WatchRow
              key={item.id}
              symbol={item.symbol}
              company={item.company}
              quote={feed.quotes[item.symbol] ?? null}
              active={item.symbol === active}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function WatchRow({
  symbol,
  company,
  quote,
  active,
}: {
  symbol: string;
  company: string;
  quote: MarketQuote | null;
  active: boolean;
}) {
  const flash = usePriceFlash(quote?.price);
  const change = quote?.change_pct;
  return (
    <li>
      <Link
        to="/app/stocks/$symbol"
        params={{ symbol }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 transition-colors last:border-b-0 hover:bg-foreground/[0.035]",
          active && "bg-primary/10",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold">{symbol}</span>
          <span className="block truncate text-[11px] text-subtle">{company}</span>
        </span>
        <span className="text-right font-mono text-[12.5px] num-tabular">
          <span className={cn("block rounded px-1", flash)}>
            {quote?.price != null ? formatNum(quote.price) : "—"}
          </span>
          <span
            className={cn(
              "block px-1 text-[11px]",
              change == null ? "text-subtle" : change >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {change == null ? "—" : `${change >= 0 ? "+" : ""}${formatNum(change)}%`}
          </span>
        </span>
      </Link>
    </li>
  );
}
