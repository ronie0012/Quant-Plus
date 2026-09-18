import { Card, CardHead, EmptyState, Skeleton } from "@/components/app/cards";
import { formatINR, useHoldings } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

const ALLOC_TONES = [
  "bg-primary",
  "bg-primary/70",
  "bg-primary-soft/70",
  "bg-positive/60",
  "bg-warning/60",
  "bg-border-strong",
];

export function PortfolioSnapshot() {
  const { data, isLoading, isError, refetch } = useHoldings();

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-5 h-24 w-full" />
      </Card>
    );
  }

  if (isError || !data || data.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No holdings"
          hint="Your portfolio has no positions yet."
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const invested = data.reduce((s, h) => s + Number(h.quantity) * Number(h.avg_price), 0);
  const current = data.reduce((s, h) => s + Number(h.quantity) * Number(h.last_price), 0);
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  const alloc = [...data]
    .map((h) => ({
      symbol: h.symbol,
      value: Number(h.quantity) * Number(h.last_price),
      pnlPct:
        Number(h.avg_price) > 0
          ? ((Number(h.last_price) - Number(h.avg_price)) / Number(h.avg_price)) * 100
          : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const stats = [
    { label: "Invested", value: formatINR(invested) },
    { label: "Current value", value: formatINR(current) },
    {
      label: "Profit / loss",
      value: `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`,
      tone: pnl >= 0 ? "positive" : "negative",
    },
    {
      label: "Return",
      value: `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`,
      tone: pnlPct >= 0 ? "positive" : "negative",
    },
    { label: "Holdings", value: String(data.length) },
    {
      label: "Portfolio risk",
      value: Math.abs(pnlPct) > 12 ? "Elevated" : Math.abs(pnlPct) > 6 ? "Moderate" : "Low",
    },
  ] as const;

  return (
    <Card delay={620} className="flex h-full flex-col">
      <CardHead title="Portfolio snapshot" meta="Your positions · simulated account" />

      <div className="px-5 pt-5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-border/70" aria-hidden="true">
          {alloc.map((a, i) => (
            <span
              key={a.symbol}
              className={cn("grow-bar block h-full", ALLOC_TONES[i % ALLOC_TONES.length])}
              style={{
                width: `${(a.value / current) * 100}%`,
                ["--d" as string]: `${700 + i * 70}ms`,
              }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {alloc.slice(0, 4).map((a, i) => (
            <li key={a.symbol} className="flex items-center gap-1.5">
              <span
                className={cn("h-1.5 w-1.5 rounded-full", ALLOC_TONES[i % ALLOC_TONES.length])}
                aria-hidden="true"
              />
              <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-subtle">
                {a.symbol}
              </span>
              <span
                className={cn(
                  "font-mono text-[9px] num-tabular",
                  a.pnlPct >= 0 ? "text-positive/80" : "text-negative/80",
                )}
              >
                {a.pnlPct >= 0 ? "+" : ""}
                {a.pnlPct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mt-5 grid flex-1 grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-panel/70 px-4 py-4 transition-colors duration-300 hover:bg-panel-elevated"
          >
            <dt className="font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">
              {s.label}
            </dt>
            <dd
              className={cn(
                "mt-2 font-mono text-[13px] num-tabular",
                "tone" in s && s.tone === "positive" && "text-positive",
                "tone" in s && s.tone === "negative" && "text-negative",
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
