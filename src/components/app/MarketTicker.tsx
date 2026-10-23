import { Link } from "@tanstack/react-router";
import { formatNum, useInstruments, type Instrument } from "@/hooks/use-dashboard-data";
import { usePriceFlash } from "@/hooks/use-price-flash";
import { useOverviewStream } from "@/hooks/use-overview-stream";
import { cn } from "@/lib/utils";

/** Shown while the overview loads or when the provider is offline. */
const PLACEHOLDER = ["NIFTY 50", "BANK NIFTY", "SENSEX", "NIFTY IT", "INDIA VIX"];

/** Index strip under the top bar: the market's pulse on every screen. */
export function MarketTicker() {
  const { data, isError } = useInstruments();
  useOverviewStream();
  const items = data?.length ? data : null;
  return (
    <div
      role="region"
      aria-label="Market indices"
      tabIndex={0}
      className="flex h-9 items-center gap-0 overflow-x-auto border-b border-border bg-surface/80 px-2 text-[12px] [scrollbar-width:none] sm:px-4 lg:px-6"
    >
      {items
        ? items.map((instrument) => <TickerItem key={instrument.symbol} instrument={instrument} />)
        : PLACEHOLDER.map((name) => (
            <span
              key={name}
              className="flex shrink-0 items-center gap-2 border-r border-border px-3 last:border-r-0"
            >
              <span className="text-muted-foreground">{name}</span>
              <span className="font-mono text-subtle">—</span>
            </span>
          ))}
      {isError && !items && (
        <span className="ml-auto shrink-0 pl-3 text-[11px] text-subtle">Index data offline</span>
      )}
    </div>
  );
}

function TickerItem({ instrument }: { instrument: Instrument }) {
  const flash = usePriceFlash(instrument.value);
  const change = instrument.change_pct;
  const up = (change ?? 0) >= 0;
  return (
    <Link
      to="/app/$section"
      params={{ section: "markets" }}
      title={`${instrument.name}${instrument.delayed ? " · delayed" : ""}`}
      className="flex shrink-0 items-center gap-2 border-r border-border px-3 transition-colors last:border-r-0 hover:bg-panel"
    >
      <span className="whitespace-nowrap text-muted-foreground">{instrument.name}</span>
      <span className={cn("rounded px-0.5 font-mono text-foreground num-tabular", flash)}>
        {instrument.value != null ? formatNum(instrument.value) : "—"}
      </span>
      {change != null && (
        <span className={cn("font-mono num-tabular", up ? "text-positive" : "text-negative")}>
          {up ? "+" : ""}
          {formatNum(change)}%
        </span>
      )}
    </Link>
  );
}
