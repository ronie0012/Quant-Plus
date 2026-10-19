import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { LicenceStrip } from "@/components/app/learn/LicenceStrip";
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
  const [customLayout, setCustomLayout] = useState(false);
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
      <header className="dash-rise flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
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
        </div>
        <button
          type="button"
          onClick={() => setCustomLayout((value) => !value)}
          aria-pressed={customLayout}
          className="min-h-10 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground"
        >
          {customLayout ? "Use overview" : "Custom dashboard"}
        </button>
      </header>

      {customLayout ? (
        <section aria-label="Custom dashboard layout" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm text-muted-foreground">
              Choose a layout for your workflow. Your saved panel preferences are preserved.
            </p>
            <DashboardCustomizer />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            {panels.map((id) => (
              <div key={id} className={cn("min-w-0", SPAN[id])}>
                {renderPanel(id)}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          <NextActionsFeed />
          <LicenceStrip />

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
            <MarketOverview />
            <div className="grid gap-5 xl:grid-cols-2">
              <SentimentPanel />
              <CalendarPanel />
            </div>
          </section>
        </>
      )}

      <p className="pb-10 text-[12px] text-subtle">
        Provider data is labelled by source and freshness · paper trading only · not investment
        advice
      </p>
    </div>
  );
}
