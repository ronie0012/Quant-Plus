import { Card, CardHead, EmptyState, Skeleton, SourceTag } from "@/components/app/cards";
import { relativeTime, useSentiment } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

export function SentimentPanel() {
  const { data, isLoading, isError, refetch } = useSentiment();

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mx-auto mt-8 h-44 w-44 rounded-full" />
        <Skeleton className="mt-8 h-24 w-full" />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          title="No sentiment data"
          hint="Sentiment source temporarily unavailable."
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const score = Math.max(0, Math.min(100, data.score));
  const r = 66;
  const circ = 2 * Math.PI * r;
  const tone =
    data.label.toUpperCase() === "BULLISH"
      ? "text-positive"
      : data.label.toUpperCase() === "BEARISH"
        ? "text-negative"
        : "text-primary-soft";

  return (
    <Card glow className="flex h-full flex-col">
      <CardHead
        title="Market sentiment"
        meta={`Overall market · updated ${relativeTime(data.updated_at)}`}
        action={<SourceTag />}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-8">
        <div className="relative">
          <svg viewBox="0 0 160 160" className="h-44 w-44 -rotate-90" role="img" aria-label={`Sentiment score ${score} of 100, ${data.label}`}>
            <defs>
              <linearGradient id="sent-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-primary-soft)" />
              </linearGradient>
            </defs>
            <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
            <circle
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke="url(#sent-grad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ}
              style={{
                animation: "sent-sweep 1.5s cubic-bezier(0.16,1,0.3,1) forwards",
                ["--sent-target" as string]: `${circ * (1 - score / 100)}`,
              }}
            />
          </svg>
          <style>{`@keyframes sent-sweep{to{stroke-dashoffset:var(--sent-target)}}`}</style>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-4xl num-tabular tracking-tight">{score}</span>
            <span className={cn("mt-1 font-mono text-[10px] tracking-[0.2em] uppercase", tone)}>
              {data.label}
            </span>
          </div>
        </div>
      </div>

      <ul className="grid gap-px border-t border-border bg-border">
        {data.breakdown.map((b) => (
          <li
            key={b.label}
            className="flex items-center justify-between bg-panel/70 px-5 py-2.5 transition-colors duration-300 hover:bg-panel-elevated"
          >
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-subtle">
              {b.label}
            </span>
            <span className="text-[13px] text-muted-foreground">{b.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
