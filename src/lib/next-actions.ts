import type { Analysis, Holding, MarketEvent } from "../hooks/use-dashboard-data.ts";
import type { PriceAlert, JournalEntry } from "../hooks/use-trading-product.ts";
import { planReadiness } from "./quant/decision-plan.ts";

export type NextActionPriority = "high" | "medium" | "low";

export type NextAction = {
  id: string;
  priority: NextActionPriority;
  title: string;
  reason: string;
  href: string;
};

export type NextActionEvent = MarketEvent & {
  symbol?: string | null;
};

export type NextActionsInput = {
  plans?: readonly JournalEntry[] | undefined;
  alerts?: readonly PriceAlert[] | undefined;
  holdings?: readonly Holding[] | undefined;
  events?: readonly NextActionEvent[] | undefined;
  analyses?: readonly Analysis[] | undefined;
  /** Supplying now keeps the model deterministic for previews and checks. */
  now?: Date | number | string;
};

const PRIORITY_RANK: Record<NextActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const DAY = 86_400_000;

function timeOf(value: Date | number | string | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

function symbolForEvent(event: NextActionEvent, holdings: readonly Holding[]) {
  const explicit = event.symbol?.trim().toUpperCase();
  if (explicit) return explicit.replace(/\.NS$/, "");
  const text = event.event.toUpperCase();
  return holdings.find((holding) => text.includes(holding.symbol.toUpperCase()))?.symbol;
}

function eventWhen(eventAt: number, now: number) {
  const days = Math.ceil((eventAt - now) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function alertReason(alert: PriceAlert) {
  if (alert.note.trim()) return alert.note.trim();
  const labels: Record<PriceAlert["alert_type"], string> = {
    PRICE_ABOVE: "Price moved above your threshold.",
    PRICE_BELOW: "Price moved below your threshold.",
    MOVE_PERCENT: "The configured percentage move was reached.",
    VOLUME: "The configured volume condition was reached.",
    NEWS: "A related news condition was reached.",
  };
  return labels[alert.alert_type];
}

/**
 * Build the Home feed from the existing product records. Rules are explicit,
 * capped where a source can be noisy, and sorted by a stable priority/id pair.
 */
export function buildNextActions(input: NextActionsInput): NextAction[] {
  const now = timeOf(input.now ?? Date.now());
  const current = Number.isFinite(now) ? now : Date.now();
  const holdings = input.holdings ?? [];
  const actions: NextAction[] = [];

  for (const alert of input.alerts ?? []) {
    if (!alert.triggered_at) continue;
    actions.push({
      id: `alert:${alert.id}`,
      priority: "high",
      title: `Your ${alert.symbol} alert triggered`,
      reason: alertReason(alert),
      href: `/app/alerts?alert=${encodeURIComponent(alert.id)}`,
    });
  }

  for (const plan of input.plans ?? []) {
    if (plan.plan?.invalidated_at && !plan.reflection.trim()) {
      actions.push({
        id: `plan:${plan.id}:invalidated`,
        priority: "high",
        title: `${plan.symbol} thesis was invalidated`,
        reason:
          "Review the evidence, execution and process while the decision context is available.",
        href: `/app/journal?plan=${encodeURIComponent(plan.id)}&symbol=${encodeURIComponent(plan.symbol)}`,
      });
      continue;
    }
    const horizonPassed = Boolean(plan.plan?.time_exit && timeOf(plan.plan.time_exit) <= current);
    if (
      !plan.reflection.trim() &&
      ((plan.order_id && plan.outcome !== "OPEN") ||
        horizonPassed ||
        plan.plan?.decision === "NO_TRADE")
    ) {
      actions.push({
        id: `plan:${plan.id}:review`,
        priority: plan.order_id && plan.outcome !== "OPEN" ? "high" : "medium",
        title: `${plan.symbol} decision is ready for review`,
        reason:
          plan.plan?.decision === "NO_TRADE"
            ? "Record whether waiting protected the process and what evidence would change your mind."
            : horizonPassed
              ? "The planned horizon has elapsed; compare the thesis with what actually happened."
              : "The outcome is recorded; add a reflection before moving on.",
        href: `/app/journal?plan=${encodeURIComponent(plan.id)}&symbol=${encodeURIComponent(plan.symbol)}`,
      });
    }
    if (plan.outcome !== "OPEN" || plan.plan?.decision === "NO_TRADE") continue;
    const readiness = planReadiness(plan);
    if (!readiness.ready) {
      const missing = readiness.missing.slice(0, 2).join(" and ");
      actions.push({
        id: `plan:${plan.id}`,
        priority: readiness.score < 50 ? "high" : "medium",
        title: `${plan.symbol} plan is incomplete`,
        reason: missing
          ? `Complete ${missing.toLowerCase()} before paper trading.`
          : "Finish the plan before paper trading.",
        href: `/app/journal?plan=${encodeURIComponent(plan.id)}`,
      });
    } else if (!plan.order_id) {
      actions.push({
        id: `plan:${plan.id}:paper-trade`,
        priority: "medium",
        title: `Paper trade ${plan.symbol} when ready`,
        reason: "The plan is complete and has no linked paper order yet.",
        href: `/app/stocks/${encodeURIComponent(plan.symbol)}?plan=${encodeURIComponent(plan.id)}`,
      });
    }
  }

  const heldSymbols = new Set(holdings.map((holding) => holding.symbol.toUpperCase()));
  for (const event of input.events ?? []) {
    const eventAt = timeOf(event.event_time);
    if (!Number.isFinite(eventAt) || eventAt < current - DAY || eventAt > current + 7 * DAY)
      continue;
    const symbol = symbolForEvent(event, holdings);
    const highImportance = event.importance.toUpperCase() === "HIGH";
    if (!highImportance && !(symbol && heldSymbols.has(symbol.toUpperCase()))) continue;
    const when = eventWhen(eventAt, current);
    actions.push({
      id: `event:${event.id}`,
      priority: symbol && highImportance ? "high" : "medium",
      title: `${symbol ? `${symbol} ` : ""}${event.event} is coming up`,
      reason: `${highImportance ? "Important" : "Relevant to your holdings"} event scheduled ${when}.`,
      href: symbol
        ? `/app/stocks/${encodeURIComponent(symbol)}?event=${encodeURIComponent(event.id)}`
        : `/app/events?event=${encodeURIComponent(event.id)}`,
    });
  }

  const recentAnalyses = [...(input.analyses ?? [])]
    .filter((analysis) => analysis.symbol.trim())
    .sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at) || a.id.localeCompare(b.id))
    .slice(0, 3);
  for (const analysis of recentAnalyses) {
    actions.push({
      id: `analysis:${analysis.id}`,
      priority: "medium",
      title: `${analysis.symbol} research is ready`,
      reason: `Review the ${analysis.verdict.toUpperCase()} AI verdict${
        analysis.summary ? `: ${analysis.summary}` : "."
      }`,
      href: `/app/decisions?analysis=${encodeURIComponent(analysis.id)}`,
    });
  }

  const degraded = holdings
    .filter((holding) => holding.quote_missing || holding.quote_stale || holding.quote_delayed)
    .slice(0, 3);
  for (const holding of degraded) {
    const missing = holding.quote_missing;
    actions.push({
      id: `holding:${holding.id}:mark`,
      priority: missing ? "high" : "medium",
      title: `${holding.symbol} data needs a check`,
      reason: missing
        ? "No fresh provider mark is available for this holding."
        : "The latest provider mark is delayed or stale.",
      href: `/app/stocks/${encodeURIComponent(holding.symbol)}?from=portfolio`,
    });
  }
  if (holdings.length > 0 && degraded.length === 0) {
    const largest = [...holdings].sort(
      (a, b) =>
        Number(b.quantity) * Number(b.last_price) - Number(a.quantity) * Number(a.last_price),
    )[0];
    actions.push({
      id: "portfolio:exposure",
      priority: "low",
      title: "Review portfolio exposure",
      reason: largest
        ? `${largest.symbol} is your largest current position by marked value.`
        : `${holdings.length} holding${holdings.length === 1 ? "" : "s"} are currently open.`,
      href: "/app/portfolio?view=exposure",
    });
  }

  return actions.sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.id.localeCompare(b.id),
  );
}
