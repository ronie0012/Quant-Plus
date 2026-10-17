import type { ReactNode } from "react";
import { Activity, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMarketHistory } from "@/hooks/use-agent-stock";
import { validCloses } from "@/lib/market-history";

export function PageIntro({
  eyebrow,
  title,
  body,
  status = "Simulated workspace",
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  status?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="dash-rise flex flex-col gap-5 border-b border-border pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="text-[12px] font-medium text-primary-soft">{eyebrow}</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-panel/60 px-2.5 text-[12px] text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary-soft" aria-hidden="true" />
            {status}
          </span>
          {action}
        </div>
      </div>
      {children && <div>{children}</div>}
    </header>
  );
}

export function MetricStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    note?: string;
    tone?: "positive" | "negative" | "primary" | "warning";
  }>;
}) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
      {items.map((item, i) => (
        <div
          key={item.label}
          className="dash-rise rounded-lg border border-border bg-panel/80 px-4 py-3.5"
          style={{ ["--d" as string]: `${60 + i * 40}ms` }}
        >
          <dt className="label-tech text-subtle">{item.label}</dt>
          <dd
            className={cn(
              "mt-1.5 text-[20px] leading-tight font-semibold tracking-tight num-tabular",
              item.tone === "positive" && "text-positive",
              item.tone === "negative" && "text-negative",
              item.tone === "primary" && "text-primary-soft",
              item.tone === "warning" && "text-warning",
            )}
          >
            {item.value}
            {item.note && (
              <span className="mt-1 block text-[12px] font-normal tracking-normal text-subtle">
                {item.note}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Close-price line from provider history. Without a symbol, or when the
 * provider returns no valid series, it states that history is unavailable.
 */
export function SparkChart({
  symbol,
  range = "1M",
  height = 80,
  className,
}: {
  symbol?: string | null | undefined;
  range?: "1D" | "1W" | "1M" | "6M" | "1Y";
  height?: number;
  className?: string;
}) {
  if (!symbol)
    return (
      <div
        className={cn("flex items-center justify-center text-xs text-muted-foreground", className)}
        style={{ height }}
        role="status"
      >
        No instrument price series for this item
      </div>
    );
  return <HistorySpark symbol={symbol} range={range} height={height} className={className} />;
}

function HistorySpark({
  symbol,
  range,
  height,
  className,
}: {
  symbol: string;
  range: "1D" | "1W" | "1M" | "6M" | "1Y";
  height: number;
  className?: string | undefined;
}) {
  const history = useMarketHistory(symbol, range);
  const closes = validCloses(history.data?.candles);
  if (history.isLoading)
    return <div className={cn("animate-pulse bg-panel/50", className)} style={{ height }} />;
  if (closes.length < 2)
    return (
      <div
        className={cn("flex items-center justify-center text-xs text-muted-foreground", className)}
        style={{ height }}
        role="status"
      >
        Price history unavailable
      </div>
    );
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const width = 200;
  const path = closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width;
      const y = 4 + (1 - (close - min) / span) * (height - 8);
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const up = closes.at(-1)! >= closes[0]!;
  return (
    <figure className={cn("relative", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={`${symbol} ${range} closing prices from ${history.data?.source ?? "provider"}, ${closes.length} bars`}
      >
        <path
          d={path}
          fill="none"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className={up ? "stroke-positive" : "stroke-negative"}
        />
      </svg>
      <figcaption className="absolute bottom-0 right-0 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
        {range} · {history.data?.source ?? "provider"}
        {history.data?.delayed ? " · delayed" : ""}
      </figcaption>
    </figure>
  );
}

/** Enum-style values ("PARTIALLY_FILLED") read as words; codes like "1D" stay as written. */
const isEnumLabel = (item: string) => /^[A-Z_]{3,}$/.test(item);

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      className="flex max-w-full gap-0.5 overflow-x-auto rounded-md border border-border bg-background/50 p-0.5 [scrollbar-width:none]"
      role="group"
      aria-label={label}
    >
      {items.map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={value === item}
          onClick={() => onChange(item)}
          className={cn(
            "h-7 shrink-0 rounded-[5px] px-2.5 text-[12px] font-medium text-muted-foreground shadow-none hover:bg-panel-elevated hover:text-foreground",
            value === item && "bg-panel-elevated text-foreground hover:bg-panel-elevated",
          )}
        >
          {isEnumLabel(item) ? (
            <span className="block lowercase first-letter:uppercase">
              {item.replace(/_/g, " ")}
            </span>
          ) : (
            item
          )}
        </Button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "primary",
  delay = 0,
}: {
  value: number;
  tone?: "primary" | "positive" | "negative" | "warning";
  delay?: number;
}) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-border">
      <span
        className={cn(
          "grow-bar block h-full rounded-full",
          tone === "primary" && "bg-primary",
          tone === "positive" && "bg-positive",
          tone === "negative" && "bg-negative",
          tone === "warning" && "bg-warning",
        )}
        style={{ width: `${Math.max(2, Math.min(100, value))}%`, ["--d" as string]: `${delay}ms` }}
      />
    </span>
  );
}

export function EmptyModule({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-5 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-panel-elevated text-primary-soft">
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-[15px] font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
