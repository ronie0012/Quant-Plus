import { Card, CardHead, EmptyState, Skeleton } from "@/components/app/cards";
import { formatINR, useHoldings } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

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
  const largest = [...data].sort(
    (a, b) => Number(b.quantity) * Number(b.last_price) - Number(a.quantity) * Number(a.last_price),
  )[0];

  const stats = [
    { label: "Invested", value: formatINR(invested) },
    { label: "Current value", value: formatINR(current) },
    {
      label: "Profit / loss",
      value: `${pnl >= 0 ? "+" : ""}${formatINR(pnl)} (${pnlPct.toFixed(2)}%)`,
      tone: pnl >= 0 ? "positive" : "negative",
    },
    { label: "Holdings", value: String(data.length) },
    { label: "Largest position", value: largest ? largest.symbol : "—" },
    {
      label: "Portfolio risk",
      value: Math.abs(pnlPct) > 12 ? "Elevated" : Math.abs(pnlPct) > 6 ? "Moderate" : "Low",
    },
  ] as const;

  return (
    <Card className="flex h-full flex-col">
      <CardHead title="Portfolio snapshot" meta="Your positions · simulated account" />
      <dl className="grid flex-1 grid-cols-2 gap-px bg-border sm:grid-cols-3">
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
