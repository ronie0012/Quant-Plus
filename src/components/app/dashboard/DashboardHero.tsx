import { Activity, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { WorkspaceSession } from "@/lib/workspace-session";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { displayNameFrom, greetingFor } from "@/hooks/use-session";
import { useAccount, useAnalyses, useHoldings, useSentiment } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/trading-desk-context";

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
export function DashboardHero({ session }: { session: WorkspaceSession | null }) {
  const { data: account } = useAccount();
  const { data: holdings } = useHoldings();
  const { data: analyses } = useAnalyses();
  const { data: sentiment } = useSentiment();
  const { openTicket } = useTradingDesk();

  const name = displayNameFrom(session);
  const profit = account ? Number(account.profit) : null;
  const profitPct = account ? Number(account.profit_pct) : null;
  const deployed =
    account && Number(account.total_funds) > 0
      ? (Number(account.funds_used) / Number(account.total_funds)) * 100
      : null;

  const stats: {
    label: string;
    node: React.ReactNode;
    tone?: "positive" | "negative" | "primary" | undefined;
  }[] = [
    {
      // account.profit is booked (realised) P&L; open-position marks live on the portfolio page.
      label: "Realised P&L",
      tone: profit === null ? undefined : profit < 0 ? "negative" : "positive",
      node:
        profit === null ? (
          <span className="text-subtle">—</span>
        ) : (
          <>
            <AnimatedNumber
              value={Math.abs(profit)}
              locale="en-IN"
              prefix={profit < 0 ? "−₹" : "+₹"}
              decimals={0}
            />
            <span className="ml-2 text-[12px] font-normal opacity-75">
              {profitPct === null ? "" : `${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(1)}%`}
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
            <span className="ml-2 text-[12px] font-normal text-subtle">
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
          <span className="ml-2 text-[12px] font-normal text-subtle">
            {sentiment ? `market ${sentiment.label.toLowerCase()}` : "awaiting feed"}
          </span>
        </>
      ),
    },
  ];

  return (
    <section
      className="dash-rise rounded-lg border border-border bg-panel/80"
      style={{ ["--d" as string]: "0ms" }}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] text-subtle">{dateLabel()}</p>
            <h1 className="mt-1 text-[24px] leading-tight font-semibold tracking-tight">
              {greetingFor()}, {name}
            </h1>
            <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
              Markets, portfolio and committee intelligence in a single view.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="h-9 text-[13px] font-medium text-muted-foreground"
            >
              <Link to="/app/$section" params={{ section: "markets" }}>
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                Live feed
              </Link>
            </Button>
            <Button
              type="button"
              onClick={() => openTicket()}
              className="h-9 text-[13px] font-semibold"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Open trade ticket
            </Button>
          </div>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-panel px-4 py-3.5">
              <dt className="label-tech text-subtle">{s.label}</dt>
              <dd
                className={cn(
                  "mt-1.5 flex items-baseline font-mono text-[22px] leading-tight font-semibold num-tabular tracking-tight",
                  s.tone === "positive" && "text-positive",
                  s.tone === "negative" && "text-negative",
                  s.tone === "primary" && "text-primary-soft",
                )}
              >
                {s.node}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
