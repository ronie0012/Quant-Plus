import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import {
  formatNum,
  relativeTime,
  useInstruments,
  type Instrument,
} from "@/hooks/use-dashboard-data";
import { series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

const ranges = ["1D", "1W", "1M", "3M", "1Y"] as const;
const pointsFor = { "1D": 78, "1W": 96, "1M": 120, "3M": 150, "1Y": 180 } as const;

function seedOf(symbol: string) {
  return symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 7);
}

export function MarketOverview() {
  const { data, isLoading, isError, refetch } = useInstruments();
  const [active, setActive] = useState(0);
  const [range, setRange] = useState<(typeof ranges)[number]>("1D");
  const [hover, setHover] = useState<number | null>(null);

  const instrument: Instrument | undefined = data?.[active];

  const points = useMemo(() => {
    if (!instrument) return [];
    return series(seedOf(instrument.symbol) + range.length, pointsFor[range], instrument.change_pct);
  }, [instrument, range]);

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-10 w-56" />
        <Skeleton className="mt-6 h-[260px] w-full" />
      </Card>
    );
  }

  if (isError || !data || !instrument) {
    return (
      <Card>
        <EmptyState
          title="No market data"
          hint="Data source temporarily unavailable."
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const up = Number(instrument.change_pct) >= 0;
  const w = 1000;
  const h = 300;
  const path = toPath(points, w, h);
  const hoverValue =
    hover !== null && points[hover] !== undefined
      ? Number(instrument.value) * (1 + ((points[hover] ?? 0.5) - 0.5) * 0.02)
      : null;

  return (
    <Card glow className="flex h-full flex-col">
      <CardHead
        title="Market overview"
        meta={`Updated ${relativeTime(instrument.updated_at)} · demonstrative data`}
        action={<SourceTag />}
      />

      {/* instrument selector */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
        {data.map((inst, i) => (
          <button
            key={inst.symbol}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={active === i}
            className={cn(
              "relative shrink-0 rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] whitespace-nowrap uppercase transition-colors duration-300",
              active === i
                ? "bg-panel-elevated text-foreground"
                : "text-subtle hover:text-muted-foreground",
            )}
          >
            {inst.name}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-2 bottom-0.5 h-px origin-left bg-primary transition-transform duration-300",
                active === i ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="label-tech">{instrument.name}</span>
            <Pill tone="primary">Live</Pill>
          </div>
          <p className="mt-3 font-mono text-[clamp(1.6rem,2.6vw,2.4rem)] tracking-tight num-tabular">
            {instrument.kind === "commodity" ? "₹" : ""}
            <AnimatedNumber
              value={hoverValue ?? Number(instrument.value)}
              locale="en-IN"
              decimals={instrument.kind === "commodity" ? 0 : 2}
            />
          </p>
          <p
            className={cn(
              "mt-2 font-mono text-[13px] num-tabular",
              up ? "text-positive" : "text-negative",
            )}
          >
            {up ? "+" : ""}
            {formatNum(Number(instrument.change_abs), instrument.kind === "commodity" ? 0 : 2)}{" "}
            <span className="text-subtle">·</span> {up ? "+" : ""}
            {formatNum(Number(instrument.change_pct))}%
          </p>
        </div>

        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={cn(
                "rounded border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.14em] transition-colors duration-300",
                range === r
                  ? "border-primary/50 bg-primary/10 text-primary-soft"
                  : "border-border text-subtle hover:text-muted-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* chart */}
      <div className="relative mt-5 flex-1 px-2 pb-4">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-[240px] w-full sm:h-[300px]"
          role="img"
          aria-label={`${instrument.name} ${range} price trend, demonstrative data`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
          }}
        >
          <defs>
            <linearGradient id="mo-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={up ? "var(--color-positive)" : "var(--color-negative)"}
                stopOpacity="0.22"
              />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line
              key={g}
              x1="0"
              x2={w}
              y1={h * g}
              y2={h * g}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
          ))}

          <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#mo-fill)" />
          <path
            key={`${instrument.symbol}-${range}`}
            d={path}
            fill="none"
            strokeWidth="1.6"
            className={cn("animate-draw", up ? "stroke-positive" : "stroke-negative")}
            style={{ ["--draw-length" as string]: "2600" }}
          />

          {hover !== null && points[hover] !== undefined && (
            <>
              <line
                x1={(hover / (points.length - 1)) * w}
                x2={(hover / (points.length - 1)) * w}
                y1="0"
                y2={h}
                stroke="var(--color-border-strong)"
                strokeWidth="1"
              />
              <circle
                cx={(hover / (points.length - 1)) * w}
                cy={h - (points[hover] ?? 0) * h}
                r="4"
                className={up ? "fill-positive" : "fill-negative"}
              />
            </>
          )}
        </svg>
      </div>

      {/* indices strip */}
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {data.map((inst, i) => {
          const rising = Number(inst.change_pct) >= 0;
          const spark = series(seedOf(inst.symbol), 26, inst.change_pct);
          return (
            <button
              key={inst.symbol}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "flex items-center justify-between gap-3 bg-panel/70 px-4 py-3.5 text-left transition-colors duration-300 hover:bg-panel-elevated",
                active === i && "bg-panel-elevated",
              )}
            >
              <span className="min-w-0">
                <span className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
                  {inst.name}
                </span>
                <span className="mt-1.5 block font-mono text-[13px] num-tabular">
                  {inst.kind === "commodity" ? "₹" : ""}
                  {formatNum(Number(inst.value), inst.kind === "commodity" ? 0 : 2)}
                </span>
              </span>
              <span className="flex items-center gap-2.5">
                <svg viewBox="0 0 60 18" className="h-4 w-14" aria-hidden="true">
                  <path
                    d={toPath(spark, 60, 18)}
                    fill="none"
                    strokeWidth="1.2"
                    className={rising ? "stroke-positive" : "stroke-negative"}
                  />
                </svg>
                <span
                  className={cn(
                    "font-mono text-[11px] num-tabular",
                    rising ? "text-positive" : "text-negative",
                  )}
                >
                  {rising ? "+" : ""}
                  {formatNum(Number(inst.change_pct))}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
