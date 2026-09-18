import { Activity, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { displayNameFrom, greetingFor } from "@/hooks/use-session";
import { useAccount, useAnalyses, useHoldings, useSentiment } from "@/hooks/use-dashboard-data";
import { series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/TradingDesk";

const dateLabel = () =>
  new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * Command header: greeting, session context and the three numbers that frame
 * the whole terminal, over an ambient market backdrop.
 */
export function DashboardHero({ session }: { session: Session | null }) {
  const { data: account } = useAccount();
  const { data: holdings } = useHoldings();
  const { data: analyses } = useAnalyses();
  const { data: sentiment } = useSentiment();
  const { openTicket, openCommand } = useTradingDesk();

  const name = displayNameFrom(session);
  const profit = account ? Number(account.profit) : null;
  const profitPct = account ? Number(account.profit_pct) : null;
  const deployed =
    account && Number(account.total_funds) > 0
      ? (Number(account.funds_used) / Number(account.total_funds)) * 100
      : null;

  const spark = series(21, 90, 1.4);
  const path = toPath(spark, 1200, 200);

  const stats: { label: string; node: React.ReactNode; tone?: "positive" | "primary" }[] = [
    {
      label: "Unrealised P&L",
      tone: "positive",
      node:
        profit === null ? (
          <span className="text-subtle">—</span>
        ) : (
          <>
            <AnimatedNumber value={profit} locale="en-IN" prefix="+₹" decimals={0} />
            <span className="ml-2 text-[11px] text-positive/70">
              {profitPct === null ? "" : `${profitPct.toFixed(1)}%`}
            </span>
          </>
        ),
    },
    {
      label: "Capital deployed",
      tone: "primary",
      node:
        deployed === null ? (
          <span className="text-subtle">—</span>
        ) : (
          <>
            <AnimatedNumber value={deployed} decimals={0} suffix="%" />
            <span className="ml-2 text-[11px] text-subtle">
              {holdings ? `${holdings.length} positions` : ""}
            </span>
          </>
        ),
    },
    {
      label: "Committee verdicts",
      node: (
        <>
          <AnimatedNumber value={analyses ? analyses.length : 0} decimals={0} />
          <span className="ml-2 text-[11px] text-subtle">
            {sentiment ? `market ${sentiment.label.toLowerCase()}` : "awaiting feed"}
          </span>
        </>
      ),
    },
  ];

  return (
    <section
      className="dash-rise relative overflow-hidden rounded-xl border border-border bg-panel/60 backdrop-blur-sm"
      style={{ ["--d" as string]: "0ms" }}
    >
      {/* ambient backdrop */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(900px 260px at 12% -20%, color-mix(in oklab, var(--color-primary) 22%, transparent), transparent 70%)",
        }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full opacity-[0.28]"
      >
        <defs>
          <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L1200,200 L0,200 Z`} fill="url(#hero-fill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-primary-soft)"
          strokeWidth="1.4"
          className="animate-draw"
          style={{ ["--draw-length" as string]: "2600" }}
        />
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] uppercase text-subtle">
              <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                <span className="absolute h-1.5 w-1.5 rounded-full bg-primary pulse-ring" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {dateLabel()}
            </p>
            <h1 className="mt-2 text-[clamp(1.5rem,3vw,2.3rem)] leading-[1.05] tracking-tight">
              {greetingFor()},{" "}
              <span className="bg-gradient-to-r from-foreground via-foreground to-primary-soft bg-clip-text text-transparent">
                {name}
              </span>
            </h1>
            <p className="mt-2 max-w-md text-[13px] text-muted-foreground">
              Markets, portfolio and committee intelligence assembled into a single view.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={openCommand}
              className="h-10 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground"
            >
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              Live feed
            </Button>
            <Button
              type="button"
              onClick={() => openTicket()}
              className="sheen group/cta h-10 font-mono text-[10px] tracking-[0.18em] uppercase"
            >
              <Sparkles className="h-3.5 w-3.5 transition-transform duration-500 group-hover/cta:rotate-12" aria-hidden="true" />
              Open trade ticket
            </Button>
          </div>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="dash-rise group/stat relative bg-panel/80 px-4 py-4 transition-colors duration-300 hover:bg-panel-elevated"
              style={{ ["--d" as string]: `${140 + i * 90}ms` }}
            >
              <dt className="font-mono text-[9px] tracking-[0.2em] uppercase text-subtle">
                {s.label}
              </dt>
              <dd
                className={cn(
                  "mt-2 flex items-baseline font-mono text-[clamp(1.1rem,1.7vw,1.5rem)] num-tabular tracking-tight",
                  s.tone === "positive" && "text-positive",
                  s.tone === "primary" && "text-primary-soft",
                )}
              >
                {s.node}
              </dd>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-px scale-x-0 bg-primary/60 transition-transform duration-500 group-hover/stat:scale-x-100"
              />
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
