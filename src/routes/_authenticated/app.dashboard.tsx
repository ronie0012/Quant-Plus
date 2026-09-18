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
      <DashboardHero session={session} />

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
