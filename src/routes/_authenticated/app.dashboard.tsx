import { createFileRoute } from "@tanstack/react-router";
import { FundsRow } from "@/components/app/dashboard/FundsRow";
import { MarketOverview } from "@/components/app/dashboard/MarketOverview";
import { SentimentPanel } from "@/components/app/dashboard/SentimentPanel";
import { SectorSentimentPanel } from "@/components/app/dashboard/SectorSentimentPanel";
import { NewsPanel } from "@/components/app/dashboard/NewsPanel";
import { WatchlistPanel } from "@/components/app/dashboard/WatchlistPanel";
import { CalendarPanel } from "@/components/app/dashboard/CalendarPanel";
import { AnalysesPanel } from "@/components/app/dashboard/AnalysesPanel";
import { PortfolioSnapshot } from "@/components/app/dashboard/PortfolioSnapshot";
import { DashboardHero } from "@/components/app/dashboard/DashboardHero";
import { useSession } from "@/hooks/use-session";
import { OnboardingChecklist } from "@/components/app/dashboard/OnboardingChecklist";
import { useInstruments } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs, type PanelId } from "@/hooks/use-workspace-prefs";
import {
  DashboardCustomizer,
  EventsWidget,
  PlansWidget,
  RegimeWidget,
  TrustWidget,
} from "@/components/app/dashboard/IntelligenceWidgets";

/** Column span of each panel on wide screens (out of 3). */
const SPAN: Record<PanelId, string> = {
  hero: "xl:col-span-3",
  onboarding: "xl:col-span-3",
  funds: "xl:col-span-3",
  market: "xl:col-span-2",
  sentiment: "",
  sectors: "xl:col-span-3",
  news: "xl:col-span-2",
  watchlist: "",
  analyses: "",
  calendar: "",
  portfolio: "",
  trust: "",
  plans: "",
  events: "",
  regime: "",
};

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
  const market = useInstruments();
  const { panels } = useWorkspacePrefs();
  const renderPanel = (id: PanelId) => {
    switch (id) {
      case "hero":
        return <DashboardHero session={session} />;
      case "onboarding":
        return <OnboardingChecklist />;
      case "funds":
        return <FundsRow />;
      case "market":
        return <MarketOverview />;
      case "sentiment":
        return <SentimentPanel />;
      case "sectors":
        return <SectorSentimentPanel />;
      case "news":
        return <NewsPanel />;
      case "watchlist":
        return <WatchlistPanel />;
      case "analyses":
        return <AnalysesPanel />;
      case "calendar":
        return <CalendarPanel />;
      case "portfolio":
        return <PortfolioSnapshot />;
      case "trust":
        return <TrustWidget />;
      case "plans":
        return <PlansWidget />;
      case "events":
        return <EventsWidget />;
      case "regime":
        return <RegimeWidget />;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          className="focus-hide dash-rise flex h-9 min-w-0 flex-1 items-center overflow-x-auto rounded-md border border-border bg-panel/50 [scrollbar-width:none]"
          style={{ ["--d" as string]: "0ms" }}
        >
          <div className="flex min-w-max items-center gap-6 px-3.5 text-[12px] num-tabular">
            <span className="font-medium text-subtle">NSE indices</span>
            {(market.data ?? []).map((item) => (
              <span key={item.symbol} className="text-muted-foreground">
                {item.name}{" "}
                <b
                  className={cn(
                    "font-medium",
                    (item.change_pct ?? 0) >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {item.change_pct == null
                    ? "—"
                    : `${item.change_pct >= 0 ? "+" : ""}${item.change_pct.toFixed(2)}%`}
                </b>
              </span>
            ))}
            {!market.data?.length && <span className="text-subtle">Awaiting market data</span>}
          </div>
        </div>
        <DashboardCustomizer />
      </div>
      <div className="grid grid-flow-row-dense gap-5 xl:grid-cols-3">
        {panels.map((id) => (
          <div key={id} className={cn("min-w-0", SPAN[id])}>
            {renderPanel(id)}
          </div>
        ))}
      </div>

      <p className="pb-10 text-[12px] text-subtle">
        Provider data is labelled by source and freshness · paper trading only · not investment
        advice
      </p>
    </div>
  );
}
