import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { Card, EmptyState, Pill } from "@/components/app/cards";
import { PageIntro } from "./workspace";
import { SECONDARY_WORKSPACE_ROUTES, type WorkspaceArea } from "@/components/app/workspace-routes";

const GROUPS: { area: WorkspaceArea; title: string; hint: string }[] = [
  {
    area: "Learn",
    title: "Learn & practise",
    hint: "Understand yourself, learn the basics, then practise a decision.",
  },
  {
    area: "Discover",
    title: "Research a company",
    hint: "Move from a market event to a shortlist and sourced evidence.",
  },
  {
    area: "Portfolio",
    title: "Manage your paper account",
    hint: "Track positions, cash, orders and risk together.",
  },
  {
    area: "Review",
    title: "Improve your process",
    hint: "Review decisions and test ideas against observed history.",
  },
  {
    area: "More",
    title: "Workspace & research tools",
    hint: "Assistant, research transparency, preferences and support.",
  },
];
const PURPOSE: Record<string, string> = {
  learn: "Your recommended next learning step",
  "investor-dna": "Reflect on risk capacity and tolerance",
  "be-the-company": "Learn shares and valuation through a simulation",
  tutor: "Check your understanding and ask for help",
  ripple: "Explore how a news event may affect connected companies",
  watchlist: "Keep a shortlist of companies you choose",
  screener: "Filter stocks using available observations",
  events: "Check upcoming market and company events",
  regime: "Inspect market conditions and historical analogs",
  research: "Read market context and research briefs",
  orders: "Inspect paper orders, fills and protections",
  wallet: "Manage virtual funds and view the cash ledger",
  alerts: "Follow price levels without placing an order",
  basket: "Prepare multiple paper orders for review",
  risk: "Review risk limits before a paper decision",
  xray: "Inspect portfolio exposure and stress scenarios",
  options: "See why derivatives are not yet available",
  behavior: "Reflect on your trading habits with consent",
  replay: "Practise with historical information only",
  history: "Revisit previous research",
  "track-record": "Inspect matured outcomes and limitations",
  "strategy-lab": "Test and challenge a repeatable hypothesis",
  decisions: "Inspect the rationale behind research verdicts",
  "quant-ai": "Ask a read-only question with evidence",
  committee: "Compare analyst views and counterarguments",
  "agent-activity": "Follow the research process",
  "research-network": "Organise memos, reviews and research bundles",
  settings: "Set workspace and paper-ticket preferences",
  "data-sources": "Check data freshness and service readiness",
  capabilities: "Inspect capability gates and planned markets",
  help: "Find guidance and keyboard shortcuts",
};

export function WorkspaceToolsPage() {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const groups = GROUPS.map((group) => ({
    ...group,
    routes: SECONDARY_WORKSPACE_ROUTES.filter(
      (route) =>
        route.area === group.area &&
        `${route.label} ${route.keywords} ${PURPOSE[route.section] ?? ""}`
          .toLowerCase()
          .includes(term),
    ),
  })).filter((group) => group.routes.length);
  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="More"
        title="Workspace tools"
        body="Find the right tool for the task. Your everyday workflow stays in Home, Discover, Portfolio and Review."
        status="All tools in one place"
      />
      <label className="flex min-h-12 max-w-xl items-center gap-3 rounded-lg border border-border bg-panel px-4">
        <Search className="h-4 w-4 text-subtle" aria-hidden="true" />
        <span className="sr-only">Find workspace tools</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools, learning or settings…"
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
        />
      </label>
      {groups.length ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.area}>
              <div className="border-b border-border p-5">
                <h2 className="text-base font-semibold">{group.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{group.hint}</p>
              </div>
              <ul className="divide-y divide-border">
                {group.routes.map((route) => (
                  <li key={route.section}>
                    <Link
                      to="/app/$section"
                      params={{ section: route.section }}
                      className="group flex min-h-16 items-center gap-3 px-5 py-4 transition-colors hover:bg-panel-elevated"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {route.label}
                          {route.available === false && <Pill tone="warning">Not connected</Pill>}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {PURPOSE[route.section]}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-subtle group-hover:text-primary-soft"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No matching tools"
            hint="Try a task such as learning, risk, news, replay or settings."
          />
        </Card>
      )}
    </div>
  );
}
