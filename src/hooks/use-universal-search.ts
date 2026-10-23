import { useMemo } from "react";
import { nifty50 } from "@/data/nifty50";
import { WORKSPACE_ROUTES } from "@/components/app/workspace-routes";
import { useOrders } from "@/hooks/use-orders";
import { useJournal } from "@/hooks/use-trading-product";
import { useResearchItems } from "@/hooks/use-workspace-prefs";
import { useAnalyses } from "@/hooks/use-dashboard-data";
import { useMarketNews } from "@/hooks/use-intelligence";
import { useEvidenceClaims } from "@/hooks/use-evidence";
import { safeExternalUrl } from "@/lib/safe-url";

export type SearchTarget =
  | { kind: "section"; section: string }
  | { kind: "stock"; symbol: string }
  | { kind: "url"; url: string };

export type SearchResult = {
  id: string;
  type: "Page" | "Symbol" | "Claim" | "Order" | "Plan" | "News" | "Research";
  label: string;
  meta: string;
  target: SearchTarget;
  /** Higher ranks first. */
  score: number;
};

function score(haystack: string, needle: string) {
  const text = haystack.toLowerCase();
  if (!needle) return 1;
  const terms = needle.split(/\s+/).filter(Boolean);
  if (!terms.every((term) => text.includes(term))) return 0;
  return text.startsWith(needle)
    ? 3
    : terms.some((term) => text.split(/\W+/).includes(term))
      ? 2
      : 1;
}

/** One search over symbols, pages, claims, orders, plans, news and research. */
export function useUniversalSearch(query: string, enabled: boolean) {
  const orders = useOrders();
  const journal = useJournal();
  const research = useResearchItems();
  const analyses = useAnalyses();
  const news = useMarketNews();
  const claims = useEvidenceClaims();
  return useMemo(() => {
    if (!enabled) return [];
    const needle = query.trim().toLowerCase();
    const out: SearchResult[] = [];
    const push = (result: Omit<SearchResult, "score">, text: string, weight = 1) => {
      const s = score(text, needle);
      if (s) out.push({ ...result, score: s * weight });
    };
    for (const route of WORKSPACE_ROUTES)
      push(
        {
          id: route.section,
          type: "Page",
          label: route.label,
          meta: route.group,
          target: { kind: "section", section: route.section },
        },
        `${route.label} ${route.section} ${route.keywords}`,
        needle ? 1.2 : 2,
      );
    for (const stock of nifty50)
      push(
        {
          id: stock.symbol,
          type: "Symbol",
          label: stock.symbol,
          meta: `${stock.company} · ${stock.sector}`,
          target: { kind: "stock", symbol: stock.symbol },
        },
        `${stock.symbol} ${stock.company} ${stock.sector}`,
        1.5,
      );
    if (needle) {
      for (const claim of claims)
        push(
          {
            id: claim.id,
            type: "Claim",
            label: `${claim.label}: ${claim.value}`,
            meta: claim.statement,
            target: claim.instrument
              ? { kind: "stock", symbol: claim.instrument.replace(/\.NS$/, "") }
              : { kind: "section", section: claim.page ?? "dashboard" },
          },
          `${claim.label} ${claim.value} ${claim.statement}`,
        );
      for (const order of orders.data ?? [])
        push(
          {
            id: order.id,
            type: "Order",
            label: `${order.side} ${order.quantity} ${order.symbol}`,
            meta: `${order.status} · ${order.order_type} · ${new Date(order.created_at).toLocaleString("en-IN")}`,
            target: { kind: "section", section: "orders" },
          },
          `${order.symbol} ${order.side} ${order.status} ${order.order_type} order ${order.id}`,
        );
      for (const entry of journal.data ?? [])
        push(
          {
            id: entry.id,
            type: "Plan",
            label: `${entry.symbol} · ${entry.thesis.slice(0, 60) || "Untitled"}`,
            meta: `${entry.plan?.decision === "NO_TRADE" ? "No-trade decision" : entry.order_id ? "Linked to order" : "Open plan"} · ${entry.outcome}`,
            target: { kind: "section", section: "journal" },
          },
          `${entry.symbol} ${entry.thesis} ${entry.invalidation} ${entry.plan?.counter_thesis ?? ""} plan journal`,
        );
      for (const article of news.data?.articles ?? [])
        push(
          {
            id: article.id,
            type: "News",
            label: article.title,
            meta: `${article.source} · ${new Date(article.published_at).toLocaleString("en-IN")}`,
            target: safeExternalUrl(article.url)
              ? { kind: "url", url: safeExternalUrl(article.url)! }
              : { kind: "section", section: "research" },
          },
          `${article.title} ${article.source} ${article.symbol} ${article.category} news`,
        );
      for (const item of research.data ?? [])
        push(
          {
            id: item.id,
            type: "Research",
            label: item.title,
            meta: `${item.kind.toLowerCase()} · v${item.version} · ${item.status.toLowerCase()}`,
            target: {
              kind: "section",
              section: item.kind === "STRATEGY" ? "strategy-lab" : "research-network",
            },
          },
          `${item.title} ${item.kind} ${JSON.stringify(item.body).slice(0, 2000)}`,
        );
      for (const analysis of analyses.data ?? [])
        push(
          {
            id: analysis.id,
            type: "Research",
            label: `${analysis.symbol} committee: ${analysis.verdict}`,
            meta: analysis.summary?.slice(0, 120) ?? "Committee analysis",
            target: { kind: "section", section: "decisions" },
          },
          `${analysis.symbol} ${analysis.verdict} ${analysis.summary ?? ""} committee analysis`,
        );
    }
    return out.sort((a, b) => b.score - a.score);
  }, [enabled, query, orders.data, journal.data, research.data, analyses.data, news.data, claims]);
}
