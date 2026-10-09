import { createFileRoute } from "@tanstack/react-router";
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
import { AlertsPage, JournalPage as JournalBase, ReplayPage, RiskPage } from "@/components/app/pages/ProductPages";
import { ScreenerPage } from "@/components/app/pages/ScreenerPage";
import { BasketPage, OptionsPage, XrayPage } from "@/components/app/pages/NextPages";
import { TradeReviewPanel } from "@/components/app/TradeReviewPanel";
function JournalPage() { return <><JournalBase /><TradeReviewPanel /></>; }

const pageMeta: Record<string, { title: string; description: string }> = {
  markets: {
    title: "Markets — Quant Plus Terminal",
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
  risk: { title: "Risk Centre — Quant Plus Terminal", description: "Portfolio stress testing, concentration diagnostics and trading guardrails." },
  alerts: { title: "Alerts — Quant Plus Terminal", description: "Manage explainable price and market movement alerts." },
  journal: { title: "Decision Journal — Quant Plus Terminal", description: "Record trade theses, risks, invalidation rules and outcomes." },
  options: { title: "Options Lab — Quant Plus Terminal", description: "Simulated option chain, Greeks, strategy builder and payoff diagrams." },
  basket: { title: "Basket Orders — Quant Plus Terminal", description: "Build and execute a basket of simulated NIFTY 50 orders in one click." },
  xray: { title: "Portfolio X-ray — Quant Plus Terminal", description: "See which holdings drove today's portfolio move." },
  screener: { title: "Stock Screener — Quant Plus Terminal", description: "Filter NIFTY 50 stocks by momentum, RSI, volume and Quant AI conviction." },
  replay: { title: "Market Replay — Quant Plus Terminal", description: "Practice decisions with a bar-by-bar synthetic market replay." },
  watchlist: {
    title: "Watchlist — Quant Plus Terminal",
    description: "Track instruments, inspect movement and begin structured analysis.",
  },
  research: {
    title: "Research — Quant Plus Terminal",
    description: "Evidence-led market briefs across macro, risk, sectors and AI analysis.",
  },
  decisions: {
    title: "Decisions — Quant Plus Terminal",
    description: "Review committee verdicts, conviction, risk and supporting rationale.",
  },
  history: {
    title: "History — Quant Plus Terminal",
    description: "A private chronological record of completed analyses and decisions.",
  },
  "quant-ai": {
    title: "Quant AI — Quant Plus Terminal",
    description: "A grounded market copilot for market structure and portfolio risk questions.",
  },
  committee: {
    title: "Committee — Quant Plus Terminal",
    description: "Inspect multi-agent investment reasoning, consensus and disagreement.",
  },
  "agent-activity": {
    title: "Agent Activity — Quant Plus Terminal",
    description: "Observe analytical agent status, processing traces and recent tasks.",
  },
  settings: {
    title: "Settings — Quant Plus Terminal",
    description: "Manage terminal display, notification and risk-language preferences.",
  },
  "data-sources": {
    title: "Data Sources — Quant Plus Terminal",
    description: "Inspect source coverage, freshness, health and connection status.",
  },
  help: {
    title: "Help — Quant Plus Terminal",
    description: "Guidance for Quant Plus workflows, data boundaries and common questions.",
  },
};

export const Route = createFileRoute("/_authenticated/app/$section")({
  head: ({ params }) => {
    const meta = pageMeta[params.section] ?? {
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
  markets: MarketsPage,
  portfolio: PortfolioPage,
  watchlist: WatchlistPage,
  orders: OrdersPage,
  wallet: WalletPage,
  risk: RiskPage,
  alerts: AlertsPage,
  journal: JournalPage,
  replay: ReplayPage,
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
  "data-sources": DataSourcesPage,
  help: HelpPage,
};

function SectionPage() {
  const { section } = Route.useParams();
  const Page = pages[section];
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
