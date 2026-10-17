import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { useAnalyses, useEvents, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import { useJournal, usePriceAlerts } from "@/hooks/use-trading-product";
import { buildNextActions, type NextAction } from "@/lib/next-actions";

function priorityTone(priority: NextAction["priority"]) {
  if (priority === "high") return "negative" as const;
  if (priority === "medium") return "warning" as const;
  return "neutral" as const;
}

function NextActionLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-primary-soft transition-colors hover:text-foreground"
    >
      Open <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

/** A compact, data-driven Home queue for unfinished or newly relevant work. */
export function NextActionsFeed() {
  const plans = useJournal();
  const alerts = usePriceAlerts();
  const holdings = useMarkedHoldings();
  const events = useEvents();
  const analyses = useAnalyses();

  const actions = useMemo(
    () =>
      buildNextActions({
        plans: plans.data,
        alerts: alerts.data,
        holdings: holdings.data,
        events: events.data,
        analyses: analyses.data,
      }),
    [plans.data, alerts.data, holdings.data, events.data, analyses.data],
  );

  const loading =
    plans.isLoading ||
    alerts.isLoading ||
    holdings.isLoading ||
    events.isLoading ||
    analyses.isLoading;
  const failed =
    plans.isError || alerts.isError || holdings.isError || events.isError || analyses.isError;
  const hasData =
    plans.data !== undefined ||
    alerts.data !== undefined ||
    holdings.data !== undefined ||
    events.data !== undefined ||
    analyses.data !== undefined;

  return (
    <Card className="flex h-full flex-col" glow>
      <CardHead
        title="Next actions"
        meta="Prioritised from plans, alerts, holdings, events and research"
        action={
          <Link
            to="/app/$section"
            params={{ section: "journal" }}
            className="text-[11px] text-primary-soft hover:text-foreground"
          >
            Review plans
          </Link>
        }
      />

      {loading && (
        <div className="space-y-3 p-5" role="status" aria-label="Loading next actions">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && failed && !hasData && (
        <EmptyState
          title="Next actions are unavailable"
          hint="The workspace signals could not be loaded right now."
          onRetry={() => {
            void plans.refetch();
            void alerts.refetch();
            void holdings.refetch();
            void events.refetch();
            void analyses.refetch();
          }}
        />
      )}

      {!loading && (!failed || hasData) && actions.length === 0 && (
        <EmptyState
          title="You are up to date"
          hint="No alerts, incomplete plans or time-sensitive reviews need attention."
        />
      )}

      {!loading && actions.length > 0 && (
        <ul className="divide-y divide-border">
          {actions.map((action) => (
            <li
              key={action.id}
              className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-panel-elevated/60"
            >
              <Pill tone={priorityTone(action.priority)}>{action.priority}</Pill>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">{action.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {action.reason}
                </p>
              </div>
              <NextActionLink href={action.href} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
