import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { relativeTime, useEvents } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

export function CalendarPanel() {
  const { data, isLoading, isError, refetch } = useEvents();

  return (
    <Card className="flex h-full flex-col">
      <CardHead title="Market calendar" meta="Events that move Indian & global markets" />

      {isLoading && (
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {(isError || (!isLoading && (!data || data.length === 0))) && (
        <EmptyState
          title="No calendar data"
          hint="Event source temporarily unavailable."
          onRetry={() => void refetch()}
        />
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-border">
          {data.map((e) => {
            const high = e.importance.toUpperCase() === "HIGH";
            return (
              <li
                key={e.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-300 hover:bg-panel-elevated/60"
              >
                <span
                  aria-hidden="true"
                  className={cn("h-8 w-[2px] shrink-0", high ? "bg-warning" : "bg-border-strong")}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px]">{e.event}</p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                    {new Date(e.event_time).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {relativeTime(e.event_time)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill>{e.region}</Pill>
                  <Pill tone={high ? "warning" : "neutral"}>{e.importance}</Pill>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
