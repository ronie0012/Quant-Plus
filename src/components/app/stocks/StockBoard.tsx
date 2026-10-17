import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { Card, CardHead, Pill, SourceTag } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { nifty50, nifty50Sectors } from "@/data/nifty50";
import { INSTRUMENT_MASTER_SOURCE } from "@/data/instrument-master";
import { formatNum, useStockUniverse } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { StockSearch } from "@/components/app/stocks/StockSearch";
import { useStockQuotes, usePredictionPreload } from "@/hooks/use-agent-stock";
import { quoteIsStale } from "@/lib/market-session";
import { MetricStrip } from "@/components/app/pages/workspace";

type SortKey = "symbol" | "price" | "changePct";

/** Premium NIFTY 50 constituent board — every row opens a dedicated stock page. */
export function StockBoard({ compact = false }: { compact?: boolean }) {
  const universe = useStockUniverse();
  const constituents = useMemo(
    () =>
      universe.data?.length
        ? universe.data.map((item) => {
            const reference = nifty50.find((stock) => stock.symbol === item.symbol);
            return {
              ...reference,
              symbol: item.symbol,
              company: item.company,
              sector: item.sector,
            };
          })
        : nifty50,
    [universe.data],
  );
  usePredictionPreload(constituents.map((stock) => stock.symbol));
  const feed = useStockQuotes(constituents.map((stock) => stock.symbol));
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<SortKey>("symbol");
  const [asc, setAsc] = useState(true);
  const [showAll, setShowAll] = useState(!compact);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = constituents
      .map((stock) => ({
        ...stock,
        price: feed.quotes[stock.symbol]?.price ?? null,
        changePct: feed.quotes[stock.symbol]?.change_pct ?? null,
      }))
      .filter(
        (stock) =>
          (sector === "All" || stock.sector === sector) &&
          (!needle ||
            stock.symbol.toLowerCase().includes(needle) ||
            stock.company.toLowerCase().includes(needle)),
      );
    const sorted = [...filtered].sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol) * (asc ? 1 : -1);
      // Unobserved values sort last in either direction.
      const left = a[sort];
      const right = b[sort];
      if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
      return (left - right) * dir;
    });
    return sorted;
  }, [query, sector, sort, asc, feed.quotes, constituents]);

  const visible = showAll ? rows : rows.slice(0, 12);
  const priced = rows.filter((s): s is typeof s & { changePct: number } => s.changePct != null);
  const advancing = priced.filter((s) => s.changePct > 0).length;
  const declining = priced.filter((s) => s.changePct < 0).length;
  const gainers = [...priced].sort((a, b) => b.changePct - a.changePct);
  const losers = [...priced].sort((a, b) => a.changePct - b.changePct);

  const headers: Array<{ key: SortKey | null; label: string; className: string }> = [
    { key: "symbol", label: "Instrument", className: "text-left" },
    { key: null, label: "Sector", className: "hidden text-left lg:table-cell" },
    { key: null, label: "Feed", className: "hidden text-center md:table-cell" },
    { key: "price", label: "Last (₹)", className: "text-right" },
    { key: "changePct", label: "Change", className: "text-right" },
    { key: null, label: "", className: "text-right" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <StockSearch />
      <div className="rounded-lg border border-border bg-panel/80 p-4">
        <MetricStrip
          items={[
            {
              label: "Quotes received",
              value: `${rows.filter((s) => (feed.quotes[s.symbol]?.price ?? 0) > 0).length}/${rows.length}`,
              tone: "primary",
            },
            { label: "Breadth", value: `${advancing} up / ${declining} down` },
            {
              label: "Strongest change",
              value: gainers[0]
                ? `${gainers[0].symbol} ${gainers[0].changePct > 0 ? "+" : ""}${formatNum(gainers[0].changePct)}%`
                : "Awaiting quotes",
              tone: gainers[0] && gainers[0].changePct < 0 ? "negative" : "positive",
            },
            {
              label: "Weakest change",
              value: losers[0]
                ? `${losers[0].symbol} ${losers[0].changePct > 0 ? "+" : ""}${formatNum(losers[0].changePct)}%`
                : "Awaiting quotes",
              tone: losers[0] && losers[0].changePct > 0 ? "positive" : "negative",
            },
          ]}
        />
        <p className="mt-3 text-[11px] text-subtle">
          Filtered instruments · latest provider snapshots · delayed and closed-session quotes are
          labelled below.
        </p>
      </div>
      <Card delay={220}>
        <CardHead
          title="NIFTY 50 constituents"
          meta={`${rows.length} of ${constituents.length} shown · ${advancing} advancing · ${declining} declining · ${universe.data?.length ? "provider universe" : `NSE list as of ${INSTRUMENT_MASTER_SOURCE.retrieved}`}`}
          action={<SourceTag label={feed.connected ? "Provider quotes" : "Connecting feed"} />}
        />

        {feed.error && (
          <p role="alert" className="px-5 py-3 text-xs text-negative">
            {feed.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 border border-border bg-background/40 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-subtle" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol or company"
              aria-label="Search NIFTY 50"
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-subtle"
            />
          </label>
          <div className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
            {nifty50Sectors.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSector(item)}
                aria-pressed={sector === item}
                className={cn(
                  "shrink-0 border px-2.5 py-1.5 font-medium text-[11px] tracking-[0.06em] uppercase transition-colors",
                  sector === item
                    ? "border-primary/50 bg-primary/10 text-primary-soft"
                    : "border-border text-subtle hover:text-muted-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-background/30">
                {headers.map((head) => (
                  <th
                    key={head.label || "action"}
                    scope="col"
                    className={cn(
                      "px-4 py-2.5 text-[11px] font-normal tracking-[0.06em] uppercase text-subtle",
                      head.className,
                    )}
                  >
                    {head.key ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (sort === head.key) setAsc((value) => !value);
                          else {
                            setSort(head.key as SortKey);
                            setAsc(false);
                          }
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                          sort === head.key && "text-primary-soft",
                        )}
                      >
                        {head.label}
                        {sort === head.key && (
                          <ChevronDown
                            className={cn("h-3 w-3 transition-transform", asc && "rotate-180")}
                          />
                        )}
                      </button>
                    ) : (
                      head.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((stock, index) => {
                const up = (stock.changePct ?? 0) >= 0;
                const quote = feed.quotes[stock.symbol];
                const stale = quoteIsStale(quote ?? null, feed.connected, feed.now);
                return (
                  <tr
                    key={stock.symbol}
                    className="dash-rise group/row border-b border-border/70 transition-colors last:border-0 hover:bg-panel-elevated"
                    style={{ ["--d" as string]: `${Math.min(index, 14) * 25}ms` }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/app/stocks/$symbol"
                        params={{ symbol: stock.symbol }}
                        className="block"
                        aria-label={`Open ${stock.company}`}
                      >
                        <span className="block font-mono text-[11.5px] tracking-[0.08em]">
                          {stock.symbol}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-subtle">
                          {stock.company}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Pill>{stock.sector}</Pill>
                    </td>
                    <td className="hidden px-4 py-3 text-center md:table-cell">
                      <span className="font-mono text-[11px] text-subtle">
                        {quote?.source === "fyers"
                          ? quote.market_session === "closed"
                            ? "Fyers / market closed"
                            : stale
                              ? "Fyers / last quote"
                              : "Fyers / live"
                          : quote?.source === "yahoo"
                            ? "Yahoo / delayed"
                            : "Connecting"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
                      {quote?.price != null ? formatNum(quote.price) : "--"}
                      {quote?.as_of && (
                        <span className="mt-1 block text-[11px] text-subtle">
                          {new Date(quote.as_of).toLocaleString("en-IN")}
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono text-[12px] num-tabular",
                        up ? "text-positive" : "text-negative",
                      )}
                    >
                      {quote?.change_pct != null
                        ? `${up ? "+" : ""}${formatNum(quote.change_pct)}%`
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/app/stocks/$symbol" params={{ symbol: stock.symbol }}>
                        <span className="inline-flex items-center gap-1 font-medium text-[11px] tracking-[0.06em] uppercase text-subtle transition-colors group-hover/row:text-primary-soft">
                          Open
                          <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!showAll && rows.length > 12 && (
          <div className="border-t border-border p-3">
            <Button
              variant="ghost"
              onClick={() => setShowAll(true)}
              className="w-full font-medium text-[11px] tracking-[0.06em] uppercase"
            >
              Show all {rows.length} constituents
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
