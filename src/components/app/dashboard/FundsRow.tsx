import { Coins, PiggyBank, TrendingUp, Wallet } from "lucide-react";
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
  tone?: "positive" | "negative";
};

function specs(a: Account): CardSpec[] {
  const available = Number(a.wallet_balance);
  const deployed = a.total_funds > 0 ? (Number(a.funds_used) / Number(a.total_funds)) * 100 : 0;
  return [
    {
      label: "Funds added",
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
      label: "Realised P&L",
      value: Number(a.profit),
      support: `${Number(a.profit_pct) >= 0 ? "+" : ""}${Number(a.profit_pct).toFixed(1)}% overall`,
      icon: TrendingUp,
      fill: Math.min(100, Math.abs(Number(a.profit_pct)) * 5),
      tone: Number(a.profit) >= 0 ? "positive" : "negative",
    },
    {
      label: "Wallet balance",
      value: available,
      support: "Available to trade",
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
          <Card key={i} className="p-5" delay={i * 70}>
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
      {specs(data).map((s, i) => {
        return (
          <Card key={s.label} glow={s.tone === "positive"} delay={140 + i * 80} className="p-5">
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span className="label-tech">{s.label}</span>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground/[0.05]">
                  <s.icon
                    className={cn(
                      "h-3.5 w-3.5",
                      s.tone === "positive" ? "text-positive" : "text-subtle",
                    )}
                    aria-hidden="true"
                  />
                </span>
              </div>

              <p
                className={cn(
                  "mt-3 font-mono text-[26px] leading-tight font-semibold num-tabular tracking-tight",
                  s.tone === "positive" && "text-positive",
                  s.tone === "negative" && "text-negative",
                )}
              >
                {s.tone === "positive" && "+"}
                <AnimatedNumber value={s.value} locale="en-IN" prefix="₹" decimals={0} />
              </p>

              <p className="mt-1 text-[12px] text-subtle">{s.support}</p>

              <span
                className="mt-4 block h-1 w-full overflow-hidden rounded-full bg-border"
                aria-hidden="true"
              >
                <span
                  className={cn(
                    "grow-bar block h-full rounded-full",
                    s.tone === "positive" ? "bg-positive" : "bg-primary",
                  )}
                  style={{
                    width: `${Math.max(4, Math.min(100, s.fill))}%`,
                    ["--d" as string]: `${260 + i * 90}ms`,
                  }}
                />
              </span>
            </div>
          </Card>
        );
      })}
      <span className="sr-only">{formatINR(Number(data.total_funds))} total funds</span>
    </div>
  );
}
