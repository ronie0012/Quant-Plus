import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { Card, CardHead, Pill, SourceTag } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { nifty50, nifty50Sectors, type Nifty50Stock } from "@/data/nifty50";
import { formatNum } from "@/hooks/use-dashboard-data";
import { series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

type SortKey = "weight" | "symbol" | "price" | "changePct";

function Spark({ stock }: { stock: Nifty50Stock }) {
  const up = stock.changePct >= 0;
  const points = series(stock.seed, 28, up ? 0.5 : -0.35, 0.8);
  return (
    <svg viewBox="0 0 72 20" className="h-5 w-[72px]" aria-hidden="true">
      <path
        d={toPath(points, 72, 20)}
        fill="none"
        strokeWidth="1.2"
        className={up ? "stroke-positive" : "stroke-negative"}
      />
    </svg>
  );
}

/** Premium NIFTY 50 constituent board — every row opens a dedicated stock page. */
export function StockBoard({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<SortKey>("weight");
  const [asc, setAsc] = useState(false);
  const [showAll, setShowAll] = useState(!compact);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = nifty50.filter(
      (stock) =>
        (sector === "All" || stock.sector === sector) &&
        (!needle ||
          stock.symbol.toLowerCase().includes(needle) ||
          stock.company.toLowerCase().includes(needle)),
    );
    const sorted = [...filtered].sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol) * (asc ? 1 : -1);
      return (Number(a[sort]) - Number(b[sort])) * dir;
    });
    return sorted;
  }, [query, sector, sort, asc]);

  const visible = showAll ? rows : rows.slice(0, 12);
  const advancing = rows.filter((s) => s.changePct >= 0).length;

  const headers: Array<{ key: SortKey | null; label: string; className: string }> = [
    { key: "symbol", label: "Instrument", className: "text-left" },
    { key: null, label: "Sector", className: "hidden text-left lg:table-cell" },
    { key: null, label: "Trend", className: "hidden text-center md:table-cell" },
    { key: "price", label: "Last (₹)", className: "text-right" },
    { key: "changePct", label: "Change", className: "text-right" },
    { key: "weight", label: "Weight", className: "hidden text-right sm:table-cell" },
    { key: null, label: "", className: "text-right" },
  ];

  return (
    <Card delay={220}>
      <CardHead
        title="NIFTY 50 constituents"
        meta={`${rows.length} of 50 shown · ${advancing} advancing · ${rows.length - advancing} declining`}
        action={<SourceTag label="Demonstrative prices" />}
      />

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
                "shrink-0 border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.14em] uppercase transition-colors",
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
                    "px-4 py-2.5 font-mono text-[9px] font-normal tracking-[0.16em] uppercase text-subtle",
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
                        <ChevronDown className={cn("h-3 w-3 transition-transform", asc && "rotate-180")} />
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
              const up = stock.changePct >= 0;
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
                    <span className="inline-block">
                      <Spark stock={stock} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
                    {formatNum(stock.price)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono text-[12px] num-tabular",
                      up ? "text-positive" : "text-negative",
                    )}
                  >
                    {up ? "+" : ""}
                    {formatNum(stock.changePct)}%
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-[11px] num-tabular text-subtle sm:table-cell">
                    {formatNum(stock.weight)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/app/stocks/$symbol" params={{ symbol: stock.symbol }}>
                      <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.14em] uppercase text-subtle transition-colors group-hover/row:text-primary-soft">
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
            className="w-full font-mono text-[10px] tracking-[0.16em] uppercase"
          >
            Show all {rows.length} constituents
          </Button>
        </div>
      )}
    </Card>
  );
}
