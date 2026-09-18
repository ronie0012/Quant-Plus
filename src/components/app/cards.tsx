import { useCallback, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Rounded dark surface used for every dashboard module, with a cursor-follow spotlight. */
export function Card({
  children,
  className,
  glow,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  /** Entrance stagger in ms. */
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  const onMove = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      style={{ ["--d" as string]: `${delay}ms` }}
      className={cn(
        "group dash-rise relative overflow-hidden rounded-xl border border-border bg-panel/70 backdrop-blur-sm",
        "transition-[border-color,box-shadow,transform] duration-500 hover:-translate-y-[2px] hover:border-border-strong hover:shadow-[0_24px_60px_-32px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      {/* cursor spotlight */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(240px circle at var(--mx, 50%) var(--my, 0%), color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 70%)",
        }}
      />
      {glow && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-52 w-52 rounded-full opacity-40 blur-[70px] transition-opacity duration-700 group-hover:opacity-70"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 40%, transparent), transparent 70%)",
          }}
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-foreground/[0.035] to-transparent"
      />
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
        "flex items-center justify-between gap-3 border-b border-border px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[15px] tracking-tight">{title}</h2>
        {meta && (
          <p className="mt-1 font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">
            {meta}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

export function SourceTag({ label = "Simulated feed" }: { label?: string }) {
  return (
    <span className="flex items-center gap-2 border border-border px-2 py-1 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
      <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-primary" />
      {label}
    </span>
  );
}

export function EmptyState({ title, hint, onRetry }: { title: string; hint: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 py-10">
      <p className="label-tech">{title}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border border-border-strong px-4 py-2 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground transition-colors hover:text-foreground"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-panel-elevated/70", className)} />;
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
        "inline-flex items-center border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] uppercase",
        tone === "positive" && "border-positive/35 text-positive",
        tone === "negative" && "border-negative/35 text-negative",
        tone === "warning" && "border-warning/35 text-warning",
        tone === "primary" && "border-primary/40 text-primary-soft",
        tone === "neutral" && "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
