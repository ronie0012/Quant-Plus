import { Coins, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Card, EmptyState, Skeleton } from "@/components/app/cards";
import { formatINR, useAccount, type Account } from "@/hooks/use-dashboard-data";
import { series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

type CardSpec = {
  label: string;
  value: number;
  support: string;
  icon: typeof Wallet;
  fill: number;
  seed: number;
  tone?: "positive";
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
      seed: 7,
    },
    {
      label: "Total funds used",
      value: Number(a.funds_used),
      support: `${deployed.toFixed(0)}% deployed`,
      icon: Coins,
      fill: deployed,
      seed: 19,
    },
    {
      label: "Profit made",
      value: Number(a.profit),
      support: `+${Number(a.profit_pct).toFixed(1)}% overall`,
      icon: TrendingUp,
      fill: Math.min(100, Number(a.profit_pct) * 5),
      seed: 31,
      tone: "positive",
    },
    {
      label: "Wallet balance",
      value: available,
      support: "Wallet balance",
      icon: PiggyBank,
      fill: a.total_funds > 0 ? (available / Number(a.total_funds)) * 100 : 0,
      seed: 43,
    },
  ];
}

/** Ring that visualises the share of capital each metric represents. */
function Ring({ pct, tone }: { pct: number; tone?: "positive" | undefined }) {
  const r = 13;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90" aria-hidden="true">
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={tone === "positive" ? "var(--color-positive)" : "var(--color-primary)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * clamped) / 100}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <span
        className={cn(
          "absolute font-mono text-[8px] num-tabular",
          tone === "positive" ? "text-positive" : "text-primary-soft",
        )}
      >
        {clamped >= 99.5 ? "" : clamped.toFixed(0)}
      </span>
    </span>
  );
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
        const spark = series(s.seed, 40, s.tone === "positive" ? 1.6 : 0.6);
        const path = toPath(spark, 320, 80);
        return (
          <Card
            key={s.label}
            glow={s.tone === "positive"}
            delay={140 + i * 80}
            className={cn("p-5", s.tone === "positive" && "border-positive/25")}
          >
            {/* micro chart backdrop */}
            <svg
              aria-hidden="true"
              viewBox="0 0 320 80"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-25 transition-opacity duration-500 group-hover:opacity-50"
            >
              <path
                d={`${path} L320,80 L0,80 Z`}
                fill={
                  s.tone === "positive"
                    ? "color-mix(in oklab, var(--color-positive) 18%, transparent)"
                    : "color-mix(in oklab, var(--color-primary) 16%, transparent)"
                }
              />
              <path
                d={path}
                fill="none"
                strokeWidth="1.2"
                stroke={
                  s.tone === "positive" ? "var(--color-positive)" : "var(--color-primary-soft)"
                }
                className="animate-draw"
                style={{ ["--draw-length" as string]: "900" }}
              />
            </svg>

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <span className="label-tech">{s.label}</span>
                <Ring pct={s.fill} tone={s.tone} />
              </div>

              <p
                className={cn(
                  "mt-4 font-mono text-[clamp(1.4rem,2.1vw,1.85rem)] num-tabular tracking-tight",
                  s.tone === "positive" && "text-positive",
                )}
              >
                {s.tone === "positive" && "+"}
                <AnimatedNumber value={s.value} locale="en-IN" prefix="₹" decimals={0} />
              </p>

              <div className="mt-4 flex items-center gap-2">
                <s.icon
                  className={cn(
                    "h-3 w-3 shrink-0",
                    s.tone === "positive" ? "text-positive/70" : "text-subtle",
                  )}
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-subtle">
                  {s.support}
                </span>
              </div>

              <span className="mt-3 block h-[3px] w-full overflow-hidden rounded-full bg-border/70" aria-hidden="true">
                <span
                  className={cn(
                    "grow-bar block h-full rounded-full",
                    s.tone === "positive"
                      ? "bg-gradient-to-r from-positive/40 to-positive"
                      : "bg-gradient-to-r from-primary/30 to-primary",
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
