import type { ReactNode } from "react";
import { Activity, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function PageIntro({ eyebrow, title, body, status = "Simulated workspace", action, children }: { eyebrow: string; title: string; body: string; status?: string; action?: ReactNode; children?: ReactNode }) {
  return <header className="dash-rise relative overflow-hidden rounded-xl border border-border bg-panel/60 px-5 py-6 sm:px-7 sm:py-7">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid-lines opacity-20" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] uppercase text-primary-soft"><span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full bg-primary pulse-ring" /><span className="h-1.5 w-1.5 rounded-full bg-primary" /></span>{eyebrow}</p>
        <h1 className="mt-3 text-[clamp(1.65rem,3.4vw,2.8rem)] leading-none tracking-tight">{title}</h1>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex items-center gap-2 border border-border bg-background/35 px-3 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle"><Activity className="h-3 w-3 text-primary-soft" />{status}</span>
        {action}
      </div>
    </div>
    {children && <div className="relative mt-6">{children}</div>}
  </header>;
}

export function MetricStrip({ items }: { items: Array<{ label: string; value: ReactNode; note?: string; tone?: "positive" | "negative" | "primary" | "warning" }> }) {
  return <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">{items.map((item, i) => <div key={item.label} className="dash-rise bg-panel/80 px-4 py-4 transition-colors hover:bg-panel-elevated" style={{ ["--d" as string]: `${100 + i * 70}ms` }}><dt className="font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">{item.label}</dt><dd className={cn("mt-2 font-mono text-xl num-tabular", item.tone === "positive" && "text-positive", item.tone === "negative" && "text-negative", item.tone === "primary" && "text-primary-soft", item.tone === "warning" && "text-warning")}>{item.value}</dd>{item.note && <p className="mt-1 text-[11px] text-subtle">{item.note}</p>}</div>)}</dl>;
}

export function SparkChart({ seed, positive = true, height = 80, className, label = "Demonstrative trend" }: { seed: number; positive?: boolean; height?: number; className?: string; label?: string }) {
  const points = series(seed, 62, positive ? .55 : -.25, .7);
  const path = toPath(points, 600, height);
  const id = `spark-${seed}-${height}`;
  return <svg viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" className={cn("w-full", className)} role="img" aria-label={label}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={positive ? "var(--color-positive)" : "var(--color-negative)"} stopOpacity=".18"/><stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0"/></linearGradient></defs>{[.25,.5,.75].map(v=><line key={v} x1="0" x2="600" y1={height*v} y2={height*v} stroke="var(--color-border)"/>)}<path d={`${path} L600,${height} L0,${height} Z`} fill={`url(#${id})`}/><path d={path} fill="none" stroke={positive ? "var(--color-positive)" : "var(--color-negative)"} strokeWidth="1.4" className="animate-draw" style={{ ["--draw-length" as string]: "1400" }}/></svg>;
}

export function Segmented<T extends string>({ items, value, onChange, label }: { items: readonly T[]; value: T; onChange: (value: T) => void; label: string }) {
  return <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-border bg-background/40 p-1 [scrollbar-width:none]" role="group" aria-label={label}>{items.map(item=><Button key={item} type="button" size="sm" variant="ghost" aria-pressed={value === item} onClick={()=>onChange(item)} className={cn("h-7 shrink-0 rounded px-2.5 font-mono text-[9px] tracking-[0.14em] uppercase text-subtle shadow-none", value === item && "bg-primary/15 text-primary-soft hover:bg-primary/20 hover:text-primary-soft")}>{item}</Button>)}</div>;
}

export function ProgressBar({ value, tone = "primary", delay = 0 }: { value: number; tone?: "primary" | "positive" | "negative" | "warning"; delay?: number }) {
  return <span className="block h-1.5 overflow-hidden rounded-full bg-border"><span className={cn("grow-bar block h-full rounded-full", tone === "primary" && "bg-primary", tone === "positive" && "bg-positive", tone === "negative" && "bg-negative", tone === "warning" && "bg-warning")} style={{ width: `${Math.max(2, Math.min(100, value))}%`, ["--d" as string]: `${delay}ms` }} /></span>;
}

export function EmptyModule({ title, body }: { title: string; body: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center"><span className="grid h-11 w-11 place-items-center border border-border bg-panel-elevated text-primary-soft"><ArrowUpRight className="h-4 w-4" /></span><h2 className="mt-4 text-base">{title}</h2><p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{body}</p></div>;
}
