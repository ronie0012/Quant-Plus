import { createFileRoute } from "@tanstack/react-router";
import { FundsRow } from "@/components/app/dashboard/FundsRow";
import { MarketOverview } from "@/components/app/dashboard/MarketOverview";
import { SentimentPanel } from "@/components/app/dashboard/SentimentPanel";
import { NewsPanel } from "@/components/app/dashboard/NewsPanel";
import { WatchlistPanel } from "@/components/app/dashboard/WatchlistPanel";
import { CalendarPanel } from "@/components/app/dashboard/CalendarPanel";
import { AnalysesPanel } from "@/components/app/dashboard/AnalysesPanel";
import { PortfolioSnapshot } from "@/components/app/dashboard/PortfolioSnapshot";
import { DashboardHero } from "@/components/app/dashboard/DashboardHero";
import { useSession } from "@/hooks/use-session";
import { OnboardingChecklist } from "@/components/app/dashboard/OnboardingChecklist";

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

  return (
    <div className="flex flex-col gap-5">
      <div className="dash-rise -mx-4 -mt-6 flex h-9 items-center overflow-hidden border-b border-border bg-surface/70 sm:-mx-6 lg:-mx-8" style={{ ["--d" as string]: "0ms" }}>
        <div className="flex min-w-max items-center gap-7 px-4 font-mono text-[9px] tracking-[0.12em] uppercase sm:px-6 lg:px-8">
          <span className="text-subtle">NSE</span><span>NIFTY 50 <b className="font-normal text-positive">+0.62%</b></span><span>SENSEX <b className="font-normal text-positive">+0.54%</b></span><span>BANK NIFTY <b className="font-normal text-negative">−0.18%</b></span><span>INDIA VIX <b className="font-normal text-warning">14.26</b></span><span className="text-subtle">Demonstrative tape</span>
        </div>
      </div>
      <DashboardHero session={session} />
      <OnboardingChecklist />

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
