import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Card, Skeleton } from "@/components/app/cards";
import { EmptyModule, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { resolveWorkspaceRoute } from "@/components/app/workspace-routes";

/**
 * Each workspace page is its own chunk, so opening one tool downloads only
 * that tool instead of the whole terminal.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType<object>>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

const MarketsPage = page(() => import("@/components/app/pages/TerminalPages"), "MarketsPage");
const PortfolioPage = page(() => import("@/components/app/pages/TerminalPages"), "PortfolioPage");
const ResearchPage = page(() => import("@/components/app/pages/TerminalPages"), "ResearchPage");
const WatchlistPage = page(() => import("@/components/app/pages/TerminalPages"), "WatchlistPage");
const AgentActivityPage = page(
  () => import("@/components/app/pages/IntelligencePages"),
  "AgentActivityPage",
);
const CommitteePage = page(
  () => import("@/components/app/pages/IntelligencePages"),
  "CommitteePage",
);
const DecisionsPage = page(
  () => import("@/components/app/pages/IntelligencePages"),
  "DecisionsPage",
);
const HistoryPage = page(() => import("@/components/app/pages/IntelligencePages"), "HistoryPage");
const QuantAIPage = page(() => import("@/components/app/pages/IntelligencePages"), "QuantAIPage");
const DataSourcesPage = page(() => import("@/components/app/pages/SystemPages"), "DataSourcesPage");
const HelpPage = page(() => import("@/components/app/pages/SystemPages"), "HelpPage");
const SettingsPage = page(() => import("@/components/app/pages/SystemPages"), "SettingsPage");
const OrdersPage = page(() => import("@/components/app/pages/OrdersPage"), "OrdersPage");
const WalletPage = page(() => import("@/components/app/pages/WalletPage"), "WalletPage");
const AlertsPage = page(() => import("@/components/app/pages/ProductPages"), "AlertsPage");
const RiskPage = page(() => import("@/components/app/pages/ProductPages"), "RiskPage");
const ScreenerPage = page(() => import("@/components/app/pages/ScreenerPage"), "ScreenerPage");
const BasketPage = page(() => import("@/components/app/pages/NextPages"), "BasketPage");
const XrayBase = page(() => import("@/components/app/pages/NextPages"), "XrayPage");
const OptionsPage = page(() => import("@/components/app/pages/OptionChainPage"), "OptionsPage");
const TradeReviewPanel = page(
  () => import("@/components/app/TradeReviewPanel"),
  "TradeReviewPanel",
);
const DecisionLifecyclePage = page(
  () => import("@/components/app/pages/DecisionLifecyclePage"),
  "DecisionLifecyclePage",
);
const BehaviorPage = page(() => import("@/components/app/pages/BehaviorPage"), "BehaviorPage");
const TrackRecordPage = page(
  () => import("@/components/app/pages/TrackRecordPage"),
  "TrackRecordPage",
);
const RegimePage = page(() => import("@/components/app/pages/RegimePage"), "RegimePage");
const StrategyLabPage = page(
  () => import("@/components/app/pages/StrategyLabPage"),
  "StrategyLabPage",
);
const EventRadarPage = page(
  () => import("@/components/app/pages/EventRadarPage"),
  "EventRadarPage",
);
const PortfolioIntelligence = page(
  () => import("@/components/app/pages/PortfolioIntelligence"),
  "PortfolioIntelligence",
);
const FlightSimulatorPage = page(
  () => import("@/components/app/pages/FlightSimulatorPage"),
  "FlightSimulatorPage",
);
const TrustControlRoom = page(
  () => import("@/components/app/pages/TrustControlRoom"),
  "TrustControlRoom",
);
const ResearchNetworkPage = page(
  () => import("@/components/app/pages/ResearchNetworkPage"),
  "ResearchNetworkPage",
);
const CapabilitiesPage = page(
  () => import("@/components/app/pages/CapabilitiesPage"),
  "CapabilitiesPage",
);
const ReviewHub = page(() => import("@/components/app/pages/ReviewHub"), "ReviewHub");
const RipplePage = page(() => import("@/components/app/pages/RipplePage"), "RipplePage");
const LearnPage = page(() => import("@/components/app/learn/LearnPage"), "LearnPage");
const InvestorDnaPage = page(
  () => import("@/components/app/learn/InvestorDnaPage"),
  "InvestorDnaPage",
);
const CompanySimPage = page(
  () => import("@/components/app/learn/CompanySimPage"),
  "CompanySimPage",
);
const TutorPage = page(() => import("@/components/app/learn/TutorPage"), "TutorPage");
const WorkspaceToolsPage = page(
  () => import("@/components/app/pages/WorkspaceToolsPage"),
  "WorkspaceToolsPage",
);

function JournalPage() {
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const [view, setView] = useState("Decision plans");
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.has("symbol") || params.has("plan")) setView("Decision plans");
  }, [search]);
  return (
    <div className="space-y-6">
      <Segmented
        items={["Decision plans", "Review overview", "Execution review"]}
        value={view}
        onChange={setView}
        label="Review workspace view"
      />
      <section hidden={view !== "Decision plans"}>
        <DecisionLifecyclePage />
      </section>
      <section hidden={view !== "Review overview"}>
        <ReviewHub />
      </section>
      <section hidden={view !== "Execution review"}>
        <PageIntro
          eyebrow="Review"
          title="Execution review"
          body="Compare the paper fill with the plan and record what you learned."
        />
        <TradeReviewPanel />
      </section>
    </div>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <DataSourcesPage />
      <details
        className="rounded-lg border border-border bg-panel/40"
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
          Detailed operational diagnostics
        </summary>
        {detailsOpen && (
          <div className="border-t border-border p-4 sm:p-5">
            <TrustControlRoom />
          </div>
        )}
      </details>
    </div>
  );
}

function MorePage() {
  return <WorkspaceToolsPage />;
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
    title: "Option chain — Quant Plus Terminal",
    description: "Observed FYERS calls, puts and open interest by strike, with PCR and max pain.",
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

const pages: Record<string, ComponentType> = {
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
  if (Page)
    return (
      <Suspense fallback={<PageFallback />}>
        <Page />
      </Suspense>
    );

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

function PageFallback() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-[320px] w-full rounded-lg" />
    </div>
  );
}
