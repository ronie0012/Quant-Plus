/** Every terminal destination, shared by the sidebar, search and page metadata. */
export type WorkspaceRoute = {
  section: string;
  label: string;
  group: "Terminal" | "Decisions" | "Intelligence" | "System";
  keywords: string;
};

export const WORKSPACE_ROUTES: readonly WorkspaceRoute[] = [
  { section: "dashboard", label: "Dashboard", group: "Terminal", keywords: "home overview layout" },
  { section: "markets", label: "Markets", group: "Terminal", keywords: "indices nifty" },
  { section: "portfolio", label: "Portfolio", group: "Terminal", keywords: "holdings positions" },
  { section: "watchlist", label: "Watchlist", group: "Terminal", keywords: "favourites" },
  { section: "orders", label: "Orders", group: "Terminal", keywords: "fills executions" },
  { section: "wallet", label: "Wallet", group: "Terminal", keywords: "cash funds ledger" },
  { section: "alerts", label: "Alerts", group: "Terminal", keywords: "price notifications" },
  { section: "screener", label: "Screener", group: "Terminal", keywords: "filter scan" },
  { section: "basket", label: "Basket", group: "Terminal", keywords: "multi order" },
  {
    section: "options",
    label: "Options lab (unavailable)",
    group: "Terminal",
    keywords: "derivatives",
  },
  {
    section: "journal",
    label: "Decision plans",
    group: "Decisions",
    keywords: "journal thesis lifecycle outcome",
  },
  { section: "risk", label: "Risk centre", group: "Decisions", keywords: "limits stress" },
  {
    section: "behavior",
    label: "Behavioural risk",
    group: "Decisions",
    keywords: "revenge cooling protections habits",
  },
  {
    section: "xray",
    label: "Portfolio X-ray",
    group: "Decisions",
    keywords: "factor correlation stress digital twin",
  },
  {
    section: "events",
    label: "Event radar",
    group: "Decisions",
    keywords: "earnings dividends expiry calendar",
  },
  {
    section: "replay",
    label: "Flight simulator",
    group: "Decisions",
    keywords: "replay blind challenge practice",
  },
  { section: "research", label: "Research", group: "Intelligence", keywords: "briefs" },
  {
    section: "decisions",
    label: "Committee decisions",
    group: "Intelligence",
    keywords: "verdicts",
  },
  { section: "history", label: "History", group: "Intelligence", keywords: "past analyses" },
  {
    section: "track-record",
    label: "Track record",
    group: "Intelligence",
    keywords: "calibration brier accuracy forecasts",
  },
  {
    section: "regime",
    label: "Regime map",
    group: "Intelligence",
    keywords: "analogs market state volatility breadth",
  },
  {
    section: "strategy-lab",
    label: "Strategy lab",
    group: "Intelligence",
    keywords: "hypothesis backtest compiler",
  },
  {
    section: "research-network",
    label: "Research network",
    group: "Intelligence",
    keywords: "memos bundles review collaboration",
  },
  { section: "quant-ai", label: "Quant AI", group: "Intelligence", keywords: "copilot chat" },
  { section: "committee", label: "Committee", group: "Intelligence", keywords: "agents debate" },
  { section: "agent-activity", label: "Agent activity", group: "Intelligence", keywords: "traces" },
  {
    section: "settings",
    label: "Settings",
    group: "System",
    keywords: "preferences layout focus review bandwidth",
  },
  {
    section: "data-sources",
    label: "Trust control room",
    group: "System",
    keywords: "data sources health latency trust score",
  },
  {
    section: "capabilities",
    label: "Market roadmap",
    group: "System",
    keywords: "futures options broker gates",
  },
  { section: "help", label: "Help", group: "System", keywords: "guide shortcuts" },
];
