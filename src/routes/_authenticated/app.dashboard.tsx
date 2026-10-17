import { createFileRoute } from "@tanstack/react-router";
import { NextActionsFeed } from "@/components/app/dashboard/NextActionsFeed";
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
import { displayNameFrom, greetingFor, useSession } from "@/hooks/use-session";
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
      { title: "Home — Quant Plus Terminal" },
      {
        name: "description",
        content: "Your Quant Plus Home: money, market context and next actions in one surface.",
      },
      { property: "og:title", content: "Home — Quant Plus Terminal" },
      {
        property: "og:description",
        content: "Money, market context and next actions in one workspace.",
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
      <header className="dash-rise rounded-lg border border-border bg-panel/70 p-5 sm:p-6">
        <p className="text-[12px] text-subtle">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
        <h1 className="mt-1 text-[24px] leading-tight font-semibold tracking-tight">
          {greetingFor()}, {displayNameFrom(session)}
        </h1>
        <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
          Start with what needs your attention, then follow the evidence into a decision.
        </p>
      </header>

      <section aria-labelledby="home-money" className="flex flex-col gap-3">
        <div>
          <h2 id="home-money" className="text-lg font-semibold tracking-tight">
            Money
          </h2>
          <p className="mt-1 text-[12px] text-subtle">
            How your paper account and positions are doing.
          </p>
        </div>
        <FundsRow />
        <PortfolioSnapshot />
      </section>

      <section aria-labelledby="home-market" className="flex flex-col gap-3">
        <div>
          <h2 id="home-market" className="text-lg font-semibold tracking-tight">
            Market
          </h2>
          <p className="mt-1 text-[12px] text-subtle">
            What is moving, and what could matter next.
          </p>
        </div>
        <div
          className="focus-hide dash-rise flex min-h-9 items-center overflow-x-auto rounded-md border border-border bg-panel/50 [scrollbar-width:none]"
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
        <MarketOverview />
        <div className="grid gap-5 xl:grid-cols-2">
          <SentimentPanel />
          <CalendarPanel />
        </div>
      </section>

      <section aria-labelledby="home-next-actions" className="flex flex-col gap-3">
        <div>
          <h2 id="home-next-actions" className="text-lg font-semibold tracking-tight">
            Next actions
          </h2>
          <p className="mt-1 text-[12px] text-subtle">
            A short queue assembled from the rest of your workspace.
          </p>
        </div>
        <NextActionsFeed />
      </section>

      <details className="rounded-lg border border-border bg-panel/50">
        <summary className="cursor-pointer px-5 py-4 text-[13px] font-medium text-muted-foreground hover:text-foreground">
          Advanced dashboard views
        </summary>
        <div className="border-t border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-[12px] text-subtle">
              Custom layouts remain available here for deeper workflows without changing the Home
              hierarchy.
            </p>
            <DashboardCustomizer />
          </div>
          <div className="mt-5 grid grid-flow-row-dense gap-5 xl:grid-cols-3">
            {panels.map((id) => (
              <div key={id} className={cn("min-w-0", SPAN[id])}>
                {renderPanel(id)}
              </div>
            ))}
          </div>
        </div>
      </details>

      <p className="pb-10 text-[12px] text-subtle">
        Provider data is labelled by source and freshness · paper trading only · not investment
        advice
      </p>
    </div>
  );
}
