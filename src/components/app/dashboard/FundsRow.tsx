import { ArrowUpRight, Coins, TrendingUp, Wallet, PiggyBank } from "lucide-react";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Card, EmptyState, Skeleton } from "@/components/app/cards";
import { formatINR, useAccount, type Account } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

type CardSpec = {
  label: string;
  value: number;
  support: string;
  icon: typeof Wallet;
  fill: number;
  tone?: "positive";
};

function specs(a: Account): CardSpec[] {
  const available = Number(a.total_funds) - Number(a.funds_used);
  const deployed = a.total_funds > 0 ? (Number(a.funds_used) / Number(a.total_funds)) * 100 : 0;
  return [
    {
      label: "Total funds",
      value: Number(a.total_funds),
      support: "Account value",
      icon: Wallet,
      fill: 100,
    },
    {
      label: "Total funds used",
      value: Number(a.funds_used),
      support: `${deployed.toFixed(0)}% deployed`,
      icon: Coins,
      fill: deployed,
    },
    {
      label: "Profit made",
      value: Number(a.profit),
      support: `+${Number(a.profit_pct).toFixed(1)}%`,
      icon: TrendingUp,
      fill: Math.min(100, Number(a.profit_pct) * 5),
      tone: "positive",
    },
    {
      label: "Available funds",
      value: available,
      support: "Ready to deploy",
      icon: PiggyBank,
      fill: a.total_funds > 0 ? (available / Number(a.total_funds)) * 100 : 0,
    },
  ];
}

export function FundsRow() {
  const { data, isLoading, isError, refetch } = useAccount();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-36" />
            <Skeleton className="mt-4 h-2 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          title="No account data"
          hint="Your funds could not be loaded right now."
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {specs(data).map((s, i) => (
        <Card
          key={s.label}
          glow={s.tone === "positive"}
          className={cn(
            "p-5 transition-transform duration-500 hover:-translate-y-0.5",
            s.tone === "positive" && "border-positive/20",
          )}
          // staggered entry
        >
          <div
            className="reveal-in"
            style={{ animationDelay: `${i * 70}ms`, transitionDelay: `${i * 70}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="label-tech">{s.label}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-subtle transition-colors duration-500 group-hover:text-primary-soft">
                <s.icon className="h-3.5 w-3.5" />
              </span>
            </div>

            <p
              className={cn(
                "mt-4 font-mono text-[clamp(1.35rem,2vw,1.75rem)] num-tabular tracking-tight",
                s.tone === "positive" && "text-positive",
              )}
            >
              {s.tone === "positive" && "+"}
              <AnimatedNumber value={s.value} locale="en-IN" prefix="₹" decimals={0} />
            </p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-subtle">
                {s.support}
              </span>
              <ArrowUpRight className="h-3 w-3 text-subtle opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </div>

            <span className="mt-3 block h-px w-full bg-border" aria-hidden="true">
              <span
                className={cn(
                  "block h-px transition-[width] duration-[1400ms] ease-out",
                  s.tone === "positive" ? "bg-positive/70" : "bg-primary/60",
                )}
                style={{ width: `${Math.max(4, Math.min(100, s.fill))}%` }}
              />
            </span>
          </div>
        </Card>
      ))}
      <span className="sr-only">{formatINR(Number(data.total_funds))} total funds</span>
    </div>
  );
}
