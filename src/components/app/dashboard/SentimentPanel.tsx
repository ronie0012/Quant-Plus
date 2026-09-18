import { Card, CardHead, EmptyState, Skeleton, SourceTag } from "@/components/app/cards";
import { relativeTime, useSentiment } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

/** Maps a qualitative breakdown value to a 0-1 strength and tone for the bars. */
function readValue(value: string): { strength: number; tone: "positive" | "negative" | "neutral" } {
  const v = value.toLowerCase();
  if (/(very bullish|strong|net buyers|positive|bullish|improving|low)/.test(v))
    return { strength: 0.82, tone: "positive" };
  if (/(bearish|negative|net sellers|elevated|high|weak)/.test(v))
    return { strength: 0.76, tone: "negative" };
  return { strength: 0.5, tone: "neutral" };
}

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
  const label = data.label.toUpperCase();
  const tone =
    label === "BULLISH" ? "positive" : label === "BEARISH" ? "negative" : "neutral";
  const toneText =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-primary-soft";

  // Semi-circular gauge geometry (180 degrees, -90 to +90).
  const R = 74;
  const arc = Math.PI * R;
  const angle = -90 + (score / 100) * 180;

  const ticks = Array.from({ length: 21 }, (_, i) => i);

  return (
    <Card glow delay={260} className="flex h-full flex-col">
      <CardHead
        title="Market sentiment"
        meta={`Overall market · updated ${relativeTime(data.updated_at)}`}
        action={<SourceTag />}
      />

      <div className="flex flex-col items-center px-5 pt-7">
        <div className="relative w-full max-w-[260px]">
          <svg
            viewBox="0 0 200 116"
            className="w-full"
            role="img"
            aria-label={`Sentiment score ${score} of 100, ${data.label}`}
          >
            <defs>
              <linearGradient id="sent-arc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-negative)" stopOpacity="0.8" />
                <stop offset="50%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-positive)" />
              </linearGradient>
            </defs>

            {/* tick scale */}
            {ticks.map((t) => {
              const a = (-180 + (t / 20) * 180) * (Math.PI / 180);
              const inner = t % 5 === 0 ? 54 : 60;
              const x1 = 100 + Math.cos(a) * inner;
              const y1 = 100 + Math.sin(a) * inner;
              const x2 = 100 + Math.cos(a) * 64;
              const y2 = 100 + Math.sin(a) * 64;
              return (
                <line
                  key={t}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--color-border-strong)"
                  strokeWidth={t % 5 === 0 ? 1.4 : 0.7}
                  opacity={t % 5 === 0 ? 0.9 : 0.5}
                />
              );
            })}

            {/* track + value arc */}
            <path
              d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
              fill="none"
              stroke="url(#sent-arc)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={arc}
              strokeDashoffset={arc}
              style={{
                animation: "sent-sweep 1.6s cubic-bezier(0.16,1,0.3,1) forwards",
                ["--sent-target" as string]: `${arc * (1 - score / 100)}`,
              }}
            />

            {/* needle */}
            <g
              style={{
                transformOrigin: "100px 100px",
                animation: "sent-needle 1.6s cubic-bezier(0.16,1,0.3,1) forwards",
                ["--needle-angle" as string]: `${angle}deg`,
              }}
            >
              <line
                x1="100"
                y1="100"
                x2="100"
                y2="38"
                stroke="var(--color-foreground)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>
            <circle cx="100" cy="100" r="4" fill="var(--color-foreground)" />
          </svg>
          <style>{`@keyframes sent-sweep{to{stroke-dashoffset:var(--sent-target)}}@keyframes sent-needle{from{transform:rotate(-90deg)}to{transform:rotate(var(--needle-angle))}}`}</style>

        </div>

        <div className="mt-4 flex flex-col items-center">
          <span className="font-mono text-[2.6rem] leading-none num-tabular tracking-tight">
            {score}
          </span>
          <span className={cn("mt-2 font-mono text-[10px] tracking-[0.22em] uppercase", toneText)}>
            {data.label}
          </span>
        </div>

        <div className="mt-6 flex w-full items-center justify-between font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">
          <span>Fear</span>
          <span>Neutral</span>
          <span>Greed</span>
        </div>
      </div>

      <div className="mt-auto pt-7">
      <ul className="grid gap-px border-t border-border bg-border">
        {data.breakdown.map((b, i) => {
          const r = readValue(b.value);
          return (
            <li
              key={b.label}
              className="group/row bg-panel/70 px-5 py-3 transition-colors duration-300 hover:bg-panel-elevated"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-subtle">
                  {b.label}
                </span>
                <span
                  className={cn(
                    "text-[12px]",
                    r.tone === "positive"
                      ? "text-positive"
                      : r.tone === "negative"
                        ? "text-negative"
                        : "text-muted-foreground",
                  )}
                >
                  {b.value}
                </span>
              </div>
              <span className="mt-2 block h-[2px] w-full overflow-hidden rounded-full bg-border/80">
                <span
                  className={cn(
                    "grow-bar block h-full rounded-full",
                    r.tone === "positive"
                      ? "bg-positive/70"
                      : r.tone === "negative"
                        ? "bg-negative/70"
                        : "bg-primary/60",
                  )}
                  style={{
                    width: `${r.strength * 100}%`,
                    ["--d" as string]: `${400 + i * 90}ms`,
                  }}
                />
              </span>
            </li>
          );
        })}
        </ul>
      </div>
    </Card>
  );
}
