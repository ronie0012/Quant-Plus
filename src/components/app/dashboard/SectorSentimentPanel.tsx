import { Card, CardHead, EmptyState, Skeleton, SourceTag } from "@/components/app/cards";
import { useSectorSentiment } from "@/hooks/use-intelligence";
import { cn } from "@/lib/utils";

function tone(score: number | null) {
  return score === null
    ? "text-subtle"
    : score >= 60
      ? "text-positive"
      : score <= 40
        ? "text-negative"
        : "text-muted-foreground";
}

export function SectorSentimentPanel() {
  const { data, isLoading, isError, refetch } = useSectorSentiment();

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-48 w-full" />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          title="Sector data unavailable"
          hint="Sector sentiment could not be loaded."
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const sectors = Object.entries(data.sectors);
  return (
    <Card>
      <CardHead
        title="Sector sentiment"
        meta={`${data.bullish_sectors ?? 0} bullish · ${data.neutral_sectors ?? 0} neutral · ${data.bearish_sectors ?? 0} bearish`}
        action={<SourceTag label={data.data_quality} />}
      />
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {sectors.map(([name, sector]) => (
          <div key={name} className="bg-panel/70 px-4 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] tracking-[0.04em] text-subtle">{name}</span>
              <span className={cn("font-mono text-[13px]", tone(sector.score))}>
                {sector.score ?? "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              <span>
                {sector.change_1h === null || sector.change_1h === undefined
                  ? "—"
                  : `${sector.change_1h >= 0 ? "+" : ""}${sector.change_1h} 1H`}
              </span>
              <span className={tone(sector.score)}>
                {sector.trend?.replaceAll("_", " ") ?? "STABLE"}
              </span>
            </div>
            <span className="mt-3 block h-px bg-border">
              <span
                className="block h-px bg-primary/70"
                style={{ width: `${sector.score ?? 0}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
