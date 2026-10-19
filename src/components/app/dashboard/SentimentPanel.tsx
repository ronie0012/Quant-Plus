import { Card, CardHead, EmptyState, Skeleton, SourceTag } from "@/components/app/cards";
import { relativeTime, useSentiment } from "@/hooks/use-dashboard-data";
import { useMarketSentimentHistory } from "@/hooks/use-intelligence";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

function historyPath(values: Array<{ score: number | null }>) {
  const usable = values.filter((item) => item.score !== null);
  if (usable.length < 2) return "";
  return usable
    .map((item, index) => {
      const x = (index / (usable.length - 1)) * 300;
      const y = 100 - (Number(item.score) / 100) * 100;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Maps a qualitative breakdown value to a 0-1 strength and tone for the bars. */
function readValue(score: number | null): {
  strength: number;
  tone: "positive" | "negative" | "neutral";
} {
  return {
    strength: score === null ? 0 : score / 100,
    tone:
      score !== null && score >= 60
        ? "positive"
        : score !== null && score <= 40
          ? "negative"
          : "neutral",
  };
}

export function SentimentPanel() {
  const { data, isLoading, isError, isFetching, refetch } = useSentiment();
  const history = useMarketSentimentHistory("1h");

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mx-auto mt-8 h-44 w-44 rounded-full" />
        <Skeleton className="mt-8 h-24 w-full" />
      </Card>
    );
  }

  if (!data || data.score === null) {
    return (
      <Card>
        <CardHead
          title="Market sentiment"
          meta={data?.market_status ?? "Quantitative market data"}
        />
        <EmptyState
          title="Market sentiment unavailable"
          hint={
            isError
              ? "Could not reach market intelligence. Check the backend connection and retry."
              : "Fresh quantitative market coverage is insufficient. News alone is not presented as a live market score."
          }
          onRetry={() => void refetch()}
        />
        {data && (
          <div className="space-y-3 border-t border-border p-5 text-xs text-muted-foreground">
            {data.components["news_sentiment"]?.score != null && (
              <p>
                News tone {Math.round(data.components["news_sentiment"].score)}/100 · not a
                composite market score.
              </p>
            )}
            <ul className="space-y-2" aria-label="Sentiment data warnings">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <Link
              to="/app/$section"
              params={{ section: "data-sources" }}
              className="inline-block text-primary-soft hover:underline"
            >
              Check data sources and broker connection
            </Link>
          </div>
        )}
      </Card>
    );
  }

  const score = Math.max(0, Math.min(100, data.score));
  const label = data.label.toUpperCase();
  const tone = label.includes("BULLISH")
    ? "positive"
    : label.includes("BEARISH")
      ? "negative"
      : "neutral";
  const toneText =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-primary-soft";

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
        action={
          <>
            <SourceTag label={data.data_quality} />
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
              aria-label="Refresh market sentiment"
              className="rounded-md border border-border px-2 py-2 text-xs text-subtle hover:text-foreground disabled:opacity-50"
            >
              {isFetching ? "Updating" : "Refresh"}
            </button>
          </>
        }
      />
      {(isError || data.warnings.length > 0) && (
        <div
          role="status"
          className="space-y-1 border-b border-border px-5 py-3 text-xs text-warning"
        >
          {isError && <p>Refresh failed · showing the previous analysis.</p>}
          {data.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

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
          <span
            className={cn("mt-2 font-medium text-[11px] tracking-[0.06em] uppercase", toneText)}
          >
            {data.label.replaceAll("_", " ")}
          </span>
          <span className="mt-2 text-xs text-subtle">
            {data.regime.replaceAll("_", " ")} · confidence {Math.round(data.confidence * 100)}%
          </span>
          <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
            <span>Data {data.data_quality}</span>
            {data.data_quality_score !== undefined && (
              <span>{data.data_quality_score}/100 quality</span>
            )}
            {data.market_status && <span>{data.market_status}</span>}
          </div>
        </div>

        <div className="mt-6 w-full border-y border-border/70 py-3">
          <div className="flex items-center justify-between font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
            <span>1H change</span>
            <span
              className={cn(
                "text-[11px]",
                (data.trend?.change_1h ?? 0) > 0
                  ? "text-positive"
                  : (data.trend?.change_1h ?? 0) < 0
                    ? "text-negative"
                    : "text-muted-foreground",
              )}
            >
              {(data.trend?.change_1h ?? 0) > 0 ? "+" : ""}
              {data.trend?.change_1h ?? "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{data.trend?.direction?.replaceAll("_", " ") ?? "Awaiting history"}</span>
            <span>{data.trend?.velocity ? `${data.trend.velocity} velocity` : "—"}</span>
          </div>
        </div>

        <div className="mt-6 flex w-full items-center justify-between font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
          <span>Fear</span>
          <span>Neutral</span>
          <span>Greed</span>
        </div>
      </div>

      <div className="border-t border-border px-5 py-5">
        <div className="flex items-center justify-between">
          <span className="label-tech">Market sentiment · last hour</span>
          {history.isFetching && (
            <span className="font-mono text-[11px] text-subtle">Updating</span>
          )}
        </div>
        {history.data?.snapshots?.length ? (
          <svg
            viewBox="0 0 300 100"
            className="mt-4 h-24 w-full"
            role="img"
            aria-label="Market sentiment history"
          >
            {[20, 40, 60, 80].map((threshold) => (
              <line
                key={threshold}
                x1="0"
                x2="300"
                y1={100 - threshold}
                y2={100 - threshold}
                stroke="var(--color-border)"
                strokeWidth=".7"
                strokeDasharray="2 3"
              />
            ))}
            <path
              d={historyPath(history.data.snapshots)}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <p className="mt-4 text-[11px] text-subtle">
            Snapshots are collected during the open market session.
          </p>
        )}
      </div>

      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
        <div className="bg-panel/70 p-5">
          <span className="label-tech">Strongest positive drivers</span>
          <ul className="mt-3 space-y-2 text-[11px] text-muted-foreground">
            {(data.drivers ?? []).slice(0, 3).map((driver) => (
              <li key={driver} className="text-positive">
                ↑ {driver}
              </li>
            ))}
            {!data.drivers?.length && (
              <li className="text-subtle">No confirmed positive driver.</li>
            )}
          </ul>
        </div>
        <div className="bg-panel/70 p-5">
          <span className="label-tech">Risks and warnings</span>
          <ul className="mt-3 space-y-2 text-[11px] text-muted-foreground">
            {(data.divergences?.length
              ? data.divergences.map((item) => item.description)
              : (data.risks ?? [])
            )
              .slice(0, 3)
              .map((risk) => (
                <li key={risk} className="text-warning">
                  ⚠ {risk}
                </li>
              ))}
            {!data.divergences?.length && !data.risks?.length && (
              <li className="text-subtle">No active divergence detected.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-auto pt-7">
        <ul className="grid gap-px border-t border-border bg-border">
          {data.breakdown.map((b, i) => {
            const r = readValue(b.score);
            return (
              <li
                key={b.label}
                className="group/row bg-panel/70 px-5 py-3 transition-colors duration-300 hover:bg-panel-elevated"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
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
