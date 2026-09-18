import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { FundsRow } from "@/components/app/dashboard/FundsRow";
import { MarketOverview } from "@/components/app/dashboard/MarketOverview";
import { SentimentPanel } from "@/components/app/dashboard/SentimentPanel";
import { NewsPanel } from "@/components/app/dashboard/NewsPanel";
import { WatchlistPanel } from "@/components/app/dashboard/WatchlistPanel";
import { CalendarPanel } from "@/components/app/dashboard/CalendarPanel";
import { AnalysesPanel } from "@/components/app/dashboard/AnalysesPanel";
import { PortfolioSnapshot } from "@/components/app/dashboard/PortfolioSnapshot";
import { displayNameFrom, greetingFor, useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Quant Plus Terminal" },
      {
        name: "description",
        content:
          "Your Quant Plus terminal: funds, market overview, sentiment, intelligence and portfolio in one surface.",
      },
      { property: "og:title", content: "Dashboard — Quant Plus Terminal" },
      {
        property: "og:description",
        content: "Funds, market overview, sentiment and portfolio intelligence in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = useSession();
  const name = displayNameFrom(session?.user ?? null);

  return (
    <div className="flex flex-col gap-5">
      <header className="reveal-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.3rem,2.4vw,1.75rem)] tracking-tight">
            {greetingFor()}, {name}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Here&apos;s your portfolio and market overview for today.
          </p>
        </div>
        <button
          type="button"
          className="group flex items-center gap-2 border border-primary/50 bg-primary/10 px-4 py-2.5 font-mono text-[10px] tracking-[0.18em] uppercase text-primary-soft transition-colors duration-300 hover:bg-primary/20"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Run analysis
        </button>
      </header>

      <FundsRow />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <MarketOverview />
        </div>
        <SentimentPanel />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <NewsPanel />
        </div>
        <WatchlistPanel />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <AnalysesPanel />
        <CalendarPanel />
        <PortfolioSnapshot />
      </div>

      <p className="pb-16 font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">
        All figures shown are demonstrative simulated data · not investment advice
      </p>
    </div>
  );
}
