import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const ranges = ["1D", "1W", "1M", "3M", "1Y"] as const;

function pointsFor(seed: number, count = 64) {
  let value = 54;
  let state = seed;
  return Array.from({ length: count }, (_, index) => {
    state = (state * 9301 + 49297) % 233280;
    const noise = state / 233280 - 0.46;
    value = Math.max(18, Math.min(88, value + noise * 9 + Math.sin(index / 7) * 0.8));
    return value;
  });
}

function pathFrom(values: number[]) {
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - value;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TerminalChart() {
  const [range, setRange] = useState<(typeof ranges)[number]>("1D");
  const [cursor, setCursor] = useState<number | null>(null);
  const values = useMemo(() => pointsFor(ranges.indexOf(range) + 19), [range]);
  const path = pathFrom(values);
  const cursorIndex = cursor === null ? null : Math.min(values.length - 1, Math.round(cursor * (values.length - 1)));
  const cursorValue = cursorIndex === null ? null : values[cursorIndex];

  return (
    <div>
      <div className="flex items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2"><span className="font-mono text-sm font-medium">RELIANCE</span><span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] text-subtle">NSE</span></div>
          <div className="mt-3 flex items-baseline gap-3"><span className="font-mono text-3xl num-tabular">₹1,428.40</span><span className="font-mono text-xs text-positive">+1.82%</span></div>
        </div>
        <div className="flex rounded-md border border-border bg-background p-1">
          {ranges.map((item) => <button key={item} type="button" onClick={() => setRange(item)} className={cn("rounded-sm px-2.5 py-1.5 font-mono text-[9px] transition-colors", range === item ? "bg-panel-elevated text-foreground" : "text-subtle hover:text-foreground")}>{item}</button>)}
        </div>
      </div>
      <div className="relative mt-6 h-64 overflow-hidden border-t border-border" onMouseMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setCursor(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))); }} onMouseLeave={() => setCursor(null)}>
        <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${range} demonstration price chart`}>
          <defs><linearGradient id="terminal-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="text-primary" stopColor="currentColor" stopOpacity=".2"/><stop offset="1" className="text-primary" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
          {[20,40,60,80].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} className="stroke-border" strokeWidth=".3" vectorEffect="non-scaling-stroke" />)}
          <path d={`${path} L100,100 L0,100 Z`} fill="url(#terminal-fill)" />
          <path d={path} fill="none" className="stroke-primary animate-draw" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          {cursor !== null && <line x1={cursor * 100} y1="0" x2={cursor * 100} y2="100" className="stroke-primary-soft/60" strokeWidth=".5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
        </svg>
        {cursor !== null && typeof cursorValue === "number" && <div className="pointer-events-none absolute top-3 rounded-sm border border-border-strong bg-panel-elevated px-2 py-1 font-mono text-[9px] num-tabular" style={{ left: `${Math.min(cursor * 100, 84)}%` }}>₹{(1390 + cursorValue * .7).toFixed(2)}</div>}
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex h-10 items-end gap-px opacity-30" aria-hidden="true">{values.map((value, index) => <span key={`${range}-${index}`} className={cn("flex-1", index && value < (values[index - 1] ?? value) ? "bg-negative" : "bg-primary-soft")} style={{ height: `${15 + (value % 70)}%` }} />)}</div>
      </div>
    </div>
  );
}