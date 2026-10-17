/** The only destinations promoted to the persistent sidebar. */
export const WORKSPACE_AREAS = ["Home", "Discover", "Portfolio", "Review", "More"] as const;
export type WorkspaceArea = (typeof WORKSPACE_AREAS)[number];

export type WorkspaceRoute = {
  /** Stable URL segment used by the existing section route. */
  section: string;
  /** Plain-language label shown in search, breadcrumbs and the More page. */
  label: string;
  /** Canonical lifecycle area that owns this route. */
  area: WorkspaceArea;
  /** Kept for search metadata and compatibility with the previous route catalog. */
  group: "Terminal" | "Decisions" | "Intelligence" | "System";
  keywords: string;
  /** True only for the five entries rendered in the primary sidebar. */
  primary: boolean;
  /** Older or friendlier slugs that should resolve to this route. */
  aliases: readonly string[];
  /** False for capabilities that remain deep-linkable but are not available. */
  available?: boolean;
};

/**
 * Canonical route metadata shared by navigation, universal search and page
 * metadata. Existing section slugs remain stable; labels and aliases provide
 * the new information hierarchy without deleting any depth.
 */
export const WORKSPACE_ROUTES: readonly WorkspaceRoute[] = [
  {
    section: "dashboard",
    label: "Home",
    area: "Home",
    group: "Terminal",
    keywords: "home today overview dashboard layout",
    primary: true,
    aliases: ["home", "today"],
  },
  {
    section: "markets",
    label: "Discover",
    area: "Discover",
    group: "Terminal",
    keywords: "discover markets indices nifty market feed",
    primary: true,
    aliases: ["discover"],
  },
  {
    section: "portfolio",
    label: "Portfolio",
    area: "Portfolio",
    group: "Terminal",
    keywords: "portfolio holdings positions book",
    primary: true,
    aliases: [],
  },
  {
    section: "journal",
    label: "Review",
    area: "Review",
    group: "Decisions",
    keywords: "review journal plans decision plans thesis lifecycle outcome",
    primary: true,
    aliases: ["review", "plans", "decision-plans"],
  },
  {
    section: "more",
    label: "More",
    area: "More",
    group: "System",
    keywords: "more advanced tools system settings help",
    primary: true,
    aliases: ["advanced", "tools"],
  },
  {
    section: "watchlist",
    label: "Watchlist",
    area: "Discover",
    group: "Terminal",
    keywords: "watchlist favourites discover watch",
    primary: false,
    aliases: ["watch"],
  },
  {
    section: "screener",
    label: "Screener",
    area: "Discover",
    group: "Terminal",
    keywords: "screener filter scan discover",
    primary: false,
    aliases: ["screen"],
  },
  {
    section: "events",
    label: "Events",
    area: "Discover",
    group: "Decisions",
    keywords: "events event radar earnings dividends expiry calendar discover",
    primary: false,
    aliases: ["event-radar", "calendar"],
  },
  {
    section: "regime",
    label: "Market context",
    area: "Discover",
    group: "Intelligence",
    keywords: "market context regime map analogs market state volatility breadth",
    primary: false,
    aliases: ["market-context", "regime-map"],
  },
  {
    section: "research",
    label: "Research",
    area: "Discover",
    group: "Intelligence",
    keywords: "research briefs evidence market context",
    primary: false,
    aliases: ["briefs"],
  },
  {
    section: "orders",
    label: "Orders",
    area: "Portfolio",
    group: "Terminal",
    keywords: "orders fills executions trades portfolio",
    primary: false,
    aliases: ["executions", "trades"],
  },
  {
    section: "wallet",
    label: "Wallet",
    area: "Portfolio",
    group: "Terminal",
    keywords: "wallet cash funds ledger portfolio",
    primary: false,
    aliases: ["cash"],
  },
  {
    section: "alerts",
    label: "Alerts",
    area: "Portfolio",
    group: "Terminal",
    keywords: "alerts price notifications portfolio",
    primary: false,
    aliases: ["notifications"],
  },
  {
    section: "basket",
    label: "Basket",
    area: "Portfolio",
    group: "Terminal",
    keywords: "basket multi order portfolio",
    primary: false,
    aliases: ["basket-orders"],
  },
  {
    section: "risk",
    label: "Risk",
    area: "Portfolio",
    group: "Decisions",
    keywords: "risk limits stress portfolio guardrails risk centre risk center",
    primary: false,
    aliases: ["risk-centre", "risk-center"],
  },
  {
    section: "xray",
    label: "Exposure",
    area: "Portfolio",
    group: "Decisions",
    keywords: "exposure portfolio x-ray factor correlation stress digital twin",
    primary: false,
    aliases: ["exposure", "portfolio-xray"],
  },
  {
    section: "options",
    label: "Options",
    area: "Portfolio",
    group: "Terminal",
    keywords: "options options lab derivatives unavailable",
    primary: false,
    aliases: ["options-lab"],
    available: false,
  },
  {
    section: "behavior",
    label: "Trading habits",
    area: "Review",
    group: "Decisions",
    keywords: "trading habits behavioural risk behavior revenge cooling protections",
    primary: false,
    aliases: ["trading-habits", "behavioural-risk", "behavioral-risk"],
  },
  {
    section: "replay",
    label: "Replay",
    area: "Review",
    group: "Decisions",
    keywords: "replay flight simulator blind challenge practice",
    primary: false,
    aliases: ["flight-simulator"],
  },
  {
    section: "history",
    label: "History",
    area: "Review",
    group: "Intelligence",
    keywords: "history past analyses review",
    primary: false,
    aliases: [],
  },
  {
    section: "track-record",
    label: "Track record",
    area: "Review",
    group: "Intelligence",
    keywords: "track record calibration brier accuracy forecasts review",
    primary: false,
    aliases: ["track-record"],
  },
  {
    section: "strategy-lab",
    label: "Strategy lab",
    area: "Review",
    group: "Intelligence",
    keywords: "strategy lab hypothesis backtest compiler review",
    primary: false,
    aliases: ["strategy"],
  },
  {
    section: "decisions",
    label: "Verdict details",
    area: "Review",
    group: "Intelligence",
    keywords: "verdict details committee decisions AI verdict research review",
    primary: false,
    aliases: ["verdict-details", "committee-decisions"],
  },
  {
    section: "quant-ai",
    label: "AI assistant",
    area: "More",
    group: "Intelligence",
    keywords: "AI assistant Quant AI copilot chat",
    primary: false,
    aliases: ["ai", "copilot"],
  },
  {
    section: "committee",
    label: "AI debate",
    area: "More",
    group: "Intelligence",
    keywords: "AI debate committee agents verdict reasoning",
    primary: false,
    aliases: ["ai-debate"],
  },
  {
    section: "agent-activity",
    label: "Research trace",
    area: "More",
    group: "Intelligence",
    keywords: "research trace agent activity traces processing",
    primary: false,
    aliases: ["research-trace", "agent-traces"],
  },
  {
    section: "research-network",
    label: "Research review",
    area: "More",
    group: "Intelligence",
    keywords: "research review research network memos bundles collaboration",
    primary: false,
    aliases: ["research-network"],
  },
  {
    section: "settings",
    label: "Settings",
    area: "More",
    group: "System",
    keywords: "settings preferences layout focus review bandwidth",
    primary: false,
    aliases: [],
  },
  {
    section: "data-sources",
    label: "Data status",
    area: "More",
    group: "System",
    keywords: "data status data sources health latency trust score",
    primary: false,
    aliases: ["data-status", "trust-control-room"],
  },
  {
    section: "capabilities",
    label: "Roadmap",
    area: "More",
    group: "System",
    keywords: "roadmap market roadmap futures options broker gates capabilities",
    primary: false,
    aliases: ["roadmap", "market-roadmap"],
  },
  {
    section: "help",
    label: "Help",
    area: "More",
    group: "System",
    keywords: "help guide shortcuts",
    primary: false,
    aliases: [],
  },
];

export const PRIMARY_WORKSPACE_ROUTES = WORKSPACE_ROUTES.filter((route) => route.primary);
export const SECONDARY_WORKSPACE_ROUTES = WORKSPACE_ROUTES.filter((route) => !route.primary);

export function resolveWorkspaceRoute(section: string | undefined) {
  if (!section) return undefined;
  const normalized = section.toLowerCase();
  return WORKSPACE_ROUTES.find(
    (route) => route.section === normalized || route.aliases.includes(normalized),
  );
}

export function canonicalSectionFor(section: string | undefined) {
  return resolveWorkspaceRoute(section)?.section ?? section;
}

export function workspacePath(route: WorkspaceRoute) {
  return `/app/${route.section}`;
}

export type WorkspaceLocation = {
  area: WorkspaceArea;
  label: string;
  route?: WorkspaceRoute;
};

/** Resolve a pathname to the area that owns it, including stock context pages. */
export function workspaceLocationForPathname(pathname: string): WorkspaceLocation {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "app" && segments[1] === "stocks") {
    return { area: "Discover", label: "Stock workspace" };
  }
  const route = resolveWorkspaceRoute(segments[1] ?? "dashboard");
  if (route) return { area: route.area, label: route.label, route };
  return { area: "More", label: segments[1]?.replaceAll("-", " ") || "Workspace" };
}
