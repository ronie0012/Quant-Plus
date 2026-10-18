import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/app/cards";
import { EmptyModule, PageIntro } from "@/components/app/pages/workspace";
import {
  MarketsPage,
  PortfolioPage,
  ResearchPage,
  WatchlistPage,
} from "@/components/app/pages/TerminalPages";
import {
  AgentActivityPage,
  CommitteePage,
  DecisionsPage,
  HistoryPage,
  QuantAIPage,
} from "@/components/app/pages/IntelligencePages";
import { DataSourcesPage, HelpPage, SettingsPage } from "@/components/app/pages/SystemPages";
import { OrdersPage } from "@/components/app/pages/OrdersPage";
import { WalletPage } from "@/components/app/pages/WalletPage";
import { AlertsPage, RiskPage } from "@/components/app/pages/ProductPages";
import { ScreenerPage } from "@/components/app/pages/ScreenerPage";
import { BasketPage, OptionsPage, XrayPage as XrayBase } from "@/components/app/pages/NextPages";
import { TradeReviewPanel } from "@/components/app/TradeReviewPanel";
import { DecisionLifecyclePage } from "@/components/app/pages/DecisionLifecyclePage";
import { BehaviorPage } from "@/components/app/pages/BehaviorPage";
import { TrackRecordPage } from "@/components/app/pages/TrackRecordPage";
import { RegimePage } from "@/components/app/pages/RegimePage";
import { StrategyLabPage } from "@/components/app/pages/StrategyLabPage";
import { EventRadarPage } from "@/components/app/pages/EventRadarPage";
import { PortfolioIntelligence } from "@/components/app/pages/PortfolioIntelligence";
import { FlightSimulatorPage } from "@/components/app/pages/FlightSimulatorPage";
import { TrustControlRoom } from "@/components/app/pages/TrustControlRoom";
import { ResearchNetworkPage } from "@/components/app/pages/ResearchNetworkPage";
import { CapabilitiesPage } from "@/components/app/pages/CapabilitiesPage";
import { ReviewHub } from "@/components/app/pages/ReviewHub";
import { RipplePage } from "@/components/app/pages/RipplePage";
import { LearnPage } from "@/components/app/learn/LearnPage";
import { InvestorDnaPage } from "@/components/app/learn/InvestorDnaPage";
import { CompanySimPage } from "@/components/app/learn/CompanySimPage";
import { TutorPage } from "@/components/app/learn/TutorPage";
import {
  SECONDARY_WORKSPACE_ROUTES,
  WORKSPACE_AREAS,
  resolveWorkspaceRoute,
} from "@/components/app/workspace-routes";

function JournalPage() {
  return (
    <>
      <ReviewHub />
      <DecisionLifecyclePage />
      <TradeReviewPanel />
    </>
  );
}

function XrayPage() {
  return (
    <div className="flex flex-col gap-5">
      <XrayBase />
      <PortfolioIntelligence />
    </div>
  );
}

function TrustPage() {
  return (
    <div className="flex flex-col gap-5">
      <TrustControlRoom />
      <DataSourcesPage />
    </div>
  );
}

function MorePage() {
  const groups = WORKSPACE_AREAS.filter((area) => area !== "Home").map((area) => ({
    area,
    routes: SECONDARY_WORKSPACE_ROUTES.filter((route) => route.area === area),
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="More"
        title="Advanced workspace tools"
        body="Keep the primary loop focused while every deeper route remains one click away."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <Card key={group.area} className="h-full">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[14px] font-semibold">{group.area}</h2>
              <p className="mt-1 text-[12px] text-subtle">Secondary routes</p>
            </div>
            <ul className="divide-y divide-border">
              {group.routes.map((route) => (
                <li key={route.section}>
                  <Link
                    to="/app/$section"
                    params={{ section: route.section }}
                    className="group flex items-center gap-3 px-5 py-3 text-[13px] transition-colors hover:bg-panel-elevated"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{route.label}</span>
                      {route.available === false && (
                        <span className="mt-0.5 block text-[11px] text-warning">Unavailable</span>
                      )}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

const pageMeta: Record<string, { title: string; description: string }> = {
  dashboard: {
    title: "Home — Quant Plus Terminal",
    description: "Money, market context and next actions in one workspace.",
  },
  markets: {
    title: "Discover — Quant Plus Terminal",
    description: "Interactive market structure, price action and cross-market context.",
  },
  portfolio: {
    title: "Portfolio — Quant Plus Terminal",
    description: "Portfolio value, holdings, allocation, contribution and risk intelligence.",
  },
  orders: {
    title: "Orders — Quant Plus Terminal",
    description: "Manage simulated buy and sell orders, statuses and net positions.",
  },
  wallet: {
    title: "Wallet — Quant Plus Terminal",
    description: "Simulated cash balance, funding controls and a full cash ledger.",
  },
  risk: {
    title: "Risk — Quant Plus Terminal",
    description: "Portfolio stress testing, concentration diagnostics and trading guardrails.",
  },
  alerts: {
    title: "Alerts — Quant Plus Terminal",
    description: "Manage explainable price and market movement alerts.",
  },
  journal: {
    title: "Review — Quant Plus Terminal",
    description:
      "One connected decision lifecycle: snapshot, evidence, thesis, risk plan, order and outcome attribution.",
  },
  behavior: {
    title: "Trading Habits — Quant Plus Terminal",
    description:
      "Consent-based analysis of your own trading patterns, with configurable protections.",
  },
  "track-record": {
    title: "Track Record — Quant Plus Terminal",
    description: "Calibrated, matured-forecast track records instead of a single confidence score.",
  },
  regime: {
    title: "Market Context — Quant Plus Terminal",
    description: "Observable market features and historical analogs shown as distributions.",
  },
  "strategy-lab": {
    title: "Strategy Lab — Quant Plus Terminal",
    description: "Compile a plain-language hypothesis and run a falsification pipeline.",
  },
  events: {
    title: "Events — Quant Plus Terminal",
    description: "Corporate, macro, expiry and settlement events with source and knowability.",
  },
  "research-network": {
    title: "Research Review — Quant Plus Terminal",
    description: "Versioned memos, review workflow and hash-verified research bundles.",
  },
  capabilities: {
    title: "Roadmap — Quant Plus Terminal",
    description: "Capability gates for broader markets, in order.",
  },
  options: {
    title: "Options — Quant Plus Terminal",
    description:
      "Unavailable until observed option chains and verified contract rules are connected.",
  },
  basket: {
    title: "Basket Orders — Quant Plus Terminal",
    description: "Build and execute a basket of simulated NIFTY 50 orders in one click.",
  },
  xray: {
    title: "Exposure — Quant Plus Terminal",
    description:
      "What moved today, and what can hurt the portfolio next: exposures, stress and a digital twin.",
  },
  screener: {
    title: "Stock Screener — Quant Plus Terminal",
    description: "Filter NIFTY 50 stocks by measured momentum, RSI, volume and agent opinion.",
  },
  replay: {
    title: "Replay — Quant Plus Terminal",
    description:
      "Replay the information environment with no future information, partial fills and a separate replay wallet.",
  },
  learn: {
    title: "Learn — Quant Plus Terminal",
    description:
      "A market driving school: lessons by doing and a trading licence earned through discipline.",
  },
  "investor-dna": {
    title: "Investor DNA — Quant Plus Terminal",
    description:
      "Stated risk capacity and tolerance compared with your revealed paper-trading behaviour.",
  },
  "be-the-company": {
    title: "Be the Company — Quant Plus Terminal",
    description:
      "Run a chai brand to its IPO and learn shares, dilution, EPS and P/E from the inside.",
  },
  tutor: {
    title: "AI Tutor — Quant Plus Terminal",
    description:
      "Concept checks with knowledge tracing and a Socratic AI tutor in English or Hindi.",
  },
  ripple: {
    title: "Ripple Map — Quant Plus Terminal",
    description:
      "How one news event spreads to connected NIFTY 50 companies, with the reasoning chain and a graded record.",
  },
  watchlist: {
    title: "Watchlist — Quant Plus Terminal",
    description: "Track instruments, inspect movement and begin structured analysis.",
  },
  research: {
    title: "Research — Quant Plus Terminal",
    description: "Evidence-led market briefs across macro, risk, sectors and AI analysis.",
  },
  decisions: {
    title: "Verdict Details — Quant Plus Terminal",
    description: "Review committee verdicts, opinion strength, risks and supporting rationale.",
  },
  history: {
    title: "History — Quant Plus Terminal",
    description: "A private chronological record of completed analyses and decisions.",
  },
  "quant-ai": {
    title: "AI Assistant — Quant Plus Terminal",
    description: "A grounded market copilot for market structure and portfolio risk questions.",
  },
  committee: {
    title: "AI Debate — Quant Plus Terminal",
    description: "Inspect multi-agent investment reasoning, consensus and disagreement.",
  },
  "agent-activity": {
    title: "Research Trace — Quant Plus Terminal",
    description: "Observe analytical agent status, processing traces and recent tasks.",
  },
  settings: {
    title: "Settings — Quant Plus Terminal",
    description: "Manage terminal display, notification and risk-language preferences.",
  },
  "data-sources": {
    title: "Data Status — Quant Plus Terminal",
    description: "Live data quality, a decomposable trust score and every degraded capability.",
  },
  help: {
    title: "Help — Quant Plus Terminal",
    description: "Guidance for Quant Plus workflows, data boundaries and common questions.",
  },
  more: {
    title: "More — Quant Plus Terminal",
    description: "Advanced Quant Plus tools, settings, data status and help.",
  },
};

export const Route = createFileRoute("/_authenticated/app/$section")({
  head: ({ params }) => {
    const canonical = resolveWorkspaceRoute(params.section)?.section ?? params.section;
    const meta = pageMeta[canonical] ?? {
      title: "Workspace — Quant Plus Terminal",
      description: "A private Quant Plus terminal workspace.",
    };
    return {
      meta: [
        { title: meta.title },
        { name: "description", content: meta.description },
        { property: "og:title", content: meta.title },
        { property: "og:description", content: meta.description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SectionPage,
});

const pages: Record<string, () => React.JSX.Element> = {
  learn: LearnPage,
  "investor-dna": InvestorDnaPage,
  "be-the-company": CompanySimPage,
  tutor: TutorPage,
  markets: MarketsPage,
  ripple: RipplePage,
  portfolio: PortfolioPage,
  watchlist: WatchlistPage,
  orders: OrdersPage,
  wallet: WalletPage,
  risk: RiskPage,
  alerts: AlertsPage,
  journal: JournalPage,
  replay: FlightSimulatorPage,
  screener: ScreenerPage,
  options: OptionsPage,
  basket: BasketPage,
  xray: XrayPage,
  research: ResearchPage,
  decisions: DecisionsPage,
  history: HistoryPage,
  "quant-ai": QuantAIPage,
  committee: CommitteePage,
  "agent-activity": AgentActivityPage,
  settings: SettingsPage,
  "data-sources": TrustPage,
  behavior: BehaviorPage,
  "track-record": TrackRecordPage,
  regime: RegimePage,
  "strategy-lab": StrategyLabPage,
  events: EventRadarPage,
  "research-network": ResearchNetworkPage,
  capabilities: CapabilitiesPage,
  help: HelpPage,
  more: MorePage,
};

function SectionPage() {
  const { section } = Route.useParams();
  const navigate = useNavigate();
  const route = resolveWorkspaceRoute(section);
  const canonical = route?.section ?? section;

  // The dashboard has its own file route. Aliases still work, but land on the
  // canonical Home URL so browser history and metadata stay consistent.
  useEffect(() => {
    if (canonical === "dashboard" && section !== canonical) {
      void navigate({ to: "/app/dashboard", replace: true });
    }
  }, [canonical, navigate, section]);

  if (canonical === "dashboard" && section !== canonical) {
    return <p className="text-sm text-muted-foreground">Opening Home…</p>;
  }

  const Page = pages[canonical];
  if (Page) return <Page />;

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Workspace"
        title="Module not found"
        body="This destination is not part of the Quant Plus terminal."
      />
      <Card>
        <EmptyModule
          title="Unknown destination"
          body="Choose a workspace from the sidebar to continue."
        />
      </Card>
    </div>
  );
}
