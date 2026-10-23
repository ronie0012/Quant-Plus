import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import {
  formatNum,
  relativeTime,
  useIndexHistory,
  useInstruments,
  type Instrument,
} from "@/hooks/use-dashboard-data";
import { AreaChart } from "@/components/app/AreaChart";
import { cn } from "@/lib/utils";

const ranges = ["1D", "1W", "1M", "3M", "1Y"] as const;

export function MarketOverview() {
  const { data, isLoading, isError, refetch } = useInstruments();
  const [active, setActive] = useState(0);
  const [range, setRange] = useState<(typeof ranges)[number]>("1D");
  const [hover, setHover] = useState<number | null>(null);

  const instrument: Instrument | undefined = data?.[active];
  const history = useIndexHistory(instrument?.symbol, range);

  const candles = useMemo(() => history.data?.candles ?? [], [history.data]);

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

  const hasValue = instrument.value != null;
  const up = Number(instrument.change_pct ?? 0) >= 0;
  const hoverValue =
    hover !== null && history.data?.candles[hover]?.close != null
      ? history.data.candles[hover].close
      : null;

  return (
    <Card glow delay={180} className="flex h-full flex-col">
      <CardHead
        title="Market overview"
        meta={
          instrument.updated_at
            ? `Updated ${relativeTime(instrument.updated_at)}`
            : "Awaiting provider data"
        }
        action={
          <SourceTag label={instrument.source ? instrument.source.toUpperCase() : "UNAVAILABLE"} />
        }
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
              "relative shrink-0 rounded px-3 py-1.5 font-medium text-[11px] tracking-[0.06em] whitespace-nowrap uppercase transition-colors duration-300",
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
            <Pill
              tone={instrument.source === "fyers" && !instrument.stale ? "positive" : "warning"}
            >
              {instrument.market_session === "closed"
                ? "Last session"
                : instrument.delayed
                  ? "Delayed"
                  : instrument.source === "fyers"
                    ? "Live"
                    : "Unavailable"}
            </Pill>
          </div>
          <p className="mt-3 font-mono text-[clamp(1.6rem,2.6vw,2.4rem)] tracking-tight num-tabular">
            {hasValue ? (
              <>
                {instrument.kind === "commodity" ? "₹" : ""}
                <AnimatedNumber
                  value={hoverValue ?? Number(instrument.value)}
                  locale="en-IN"
                  decimals={instrument.kind === "commodity" ? 0 : 2}
                />
              </>
            ) : (
              "—"
            )}
          </p>
          <p
            className={cn(
              "mt-2 font-mono text-[13px] num-tabular",
              up ? "text-positive" : "text-negative",
            )}
          >
            {instrument.change_abs != null && instrument.change_pct != null
              ? `${up ? "+" : ""}${formatNum(Number(instrument.change_abs), instrument.kind === "commodity" ? 0 : 2)} · ${up ? "+" : ""}${formatNum(Number(instrument.change_pct))}%`
              : "No provider change data"}
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
                "rounded border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.04em] transition-colors duration-300",
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
      <div className="relative mt-3 flex-1 px-2 pb-3">
        {candles.length > 1 ? (
          <AreaChart
            points={candles}
            up={up}
            intraday={range === "1D" || range === "1W"}
            label={`${instrument.name} ${range} price trend`}
            className="h-[240px] sm:h-[300px]"
            onHover={(index) =>
              setHover(index == null ? null : Math.min(index, candles.length - 1))
            }
          />
        ) : (
          <div className="flex h-[240px] items-center justify-center text-[13px] text-subtle sm:h-[300px]">
            {history.isLoading
              ? "Loading provider history…"
              : history.isError
                ? "Provider history unavailable"
                : "No provider history for this range"}
          </div>
        )}
        {history.isError && (
          <button
            type="button"
            className="absolute bottom-7 left-1/2 min-h-11 -translate-x-1/2 rounded-md border border-border px-3 text-xs text-primary-soft hover:text-foreground"
            onClick={() => void history.refetch()}
          >
            Retry history
          </button>
        )}
      </div>

      {/* indices strip */}
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {data.map((inst, i) => {
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
                <span className="block font-medium text-[11px] tracking-[0.06em] uppercase text-muted-foreground">
                  {inst.name}
                </span>
                <span className="mt-1.5 block font-mono text-[13px] num-tabular">
                  {inst.value != null
                    ? `${inst.kind === "commodity" ? "₹" : ""}${formatNum(Number(inst.value), inst.kind === "commodity" ? 0 : 2)}`
                    : "—"}
                </span>
              </span>
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "font-mono text-[11px] num-tabular",
                    inst.change_pct == null
                      ? "text-subtle"
                      : inst.change_pct >= 0
                        ? "text-positive"
                        : "text-negative",
                  )}
                >
                  {inst.change_pct != null
                    ? `${(inst.change_pct ?? 0) >= 0 ? "+" : ""}${formatNum(Number(inst.change_pct))}%`
                    : "—"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
