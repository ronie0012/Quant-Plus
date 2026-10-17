import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Flat panel surface used for every terminal module. Deliberately quiet:
 * a hairline border and one surface tone, so the data carries the emphasis.
 */
export function Card({
  children,
  className,
  glow,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Marks a primary module with an accent rule along its top edge. */
  glow?: boolean;
  /** Entrance stagger in ms. */
  delay?: number;
}) {
  return (
    <section
      style={{ ["--d" as string]: `${delay}ms` }}
      className={cn(
        "dash-rise relative overflow-hidden rounded-lg border border-border bg-panel/80",
        "transition-colors duration-200 hover:border-border-strong",
        className,
      )}
    >
      {glow && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary/50"
        />
      )}
      {children}
    </section>
  );
}

export function CardHead({
  title,
  meta,
  action,
  className,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-14 items-center justify-between gap-4 border-b border-border px-5 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {meta && (
          <p className="mt-0.5 truncate text-[12px] text-subtle first-letter:uppercase">{meta}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function SourceTag({ label = "Provider status" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  /** Only offered when the data failed to load, never for a genuinely empty list. */
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-5 py-8">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="text-[13px] text-muted-foreground">{hint}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-border-strong px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("shimmer rounded", className)} />;
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "positive" | "negative" | "warning" | "primary";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium tracking-[0.02em] uppercase",
        tone === "positive" && "bg-positive/12 text-positive",
        tone === "negative" && "bg-negative/12 text-negative",
        tone === "warning" && "bg-warning/12 text-warning",
        tone === "primary" && "bg-primary/15 text-primary-soft",
        tone === "neutral" && "bg-foreground/[0.06] text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
