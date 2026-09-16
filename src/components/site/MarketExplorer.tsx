import { useState } from "react";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { instruments, series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function MarketExplorer() {
  const [active, setActive] = useState(3);
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);
  const inst = instruments[active] ?? instruments[0]!;
  const points = series(inst.seed, 90, inst.change >= 0 ? 0.45 : -0.4);
  const path = toPath(points, 1000, 320, 12);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(u * (points.length - 1))));
    setHover({ x: u * 1000, y: 12 + (1 - (points[index] ?? 0)) * 296, index });
  };

  return (
    <SectionShell id="explorer" className="border-t border-border bg-surface">
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>Market explorer</Eyebrow>
          <h2 className="display-section mt-7">
            Institutional depth.
            <span className="block text-muted-foreground">Without the clutter.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Pick an instrument, read its regime, and see what the AI analyst makes of the underlying
          data — in one view.
        </p>
      </Reveal>

      <Reveal delay={100} className="mt-16 grid gap-px border border-border bg-border lg:grid-cols-12">
        {/* asset list */}
        <ul className="bg-background lg:col-span-3">
          {instruments.map((item, i) => (
            <li key={item.symbol} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={active === i}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors duration-400 sm:px-5",
                  active === i ? "bg-panel" : "hover:bg-panel/50",
                )}
              >
                <span className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] tracking-[0.12em] uppercase">
                    {item.symbol}
                  </span>
                  <span className="text-[11px] text-subtle">{item.name}</span>
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    item.change >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {item.change >= 0 ? "+" : ""}
                  {item.change.toFixed(2)}%
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* chart */}
        <div className="bg-background p-5 sm:p-6 lg:col-span-6">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-mono text-lg tracking-tight">{inst.symbol}</p>
              <p className="label-tech mt-2">{inst.name}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg">{inst.last}</p>
              <p
                className={cn(
                  "mt-1 font-mono text-xs",
                  inst.change >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {inst.change >= 0 ? "+" : ""}
                {inst.change.toFixed(2)}%
              </p>
            </div>
          </div>

          <svg
            viewBox="0 0 1000 320"
            className="mt-6 h-[220px] w-full sm:h-[300px]"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`${inst.symbol} sample price series`}
          >
            {[0.25, 0.5, 0.75].map((g) => (
              <line
                key={g}
                x1="0"
                x2="1000"
                y1={320 * g}
                y2={320 * g}
                strokeWidth="1"
                className="stroke-border"
              />
            ))}
            <path
              d={`${path} L1000,320 L0,320 Z`}
              className={cn(inst.change >= 0 ? "fill-positive/8" : "fill-negative/8")}
              stroke="none"
            />
            <path
              d={path}
              fill="none"
              strokeWidth="1.5"
              className={inst.change >= 0 ? "stroke-positive" : "stroke-negative"}
            />
            {hover && (
              <g>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1="0"
                  y2="320"
                  strokeWidth="1"
                  className="stroke-primary/60"
                />
                <circle cx={hover.x} cy={hover.y} r="3" className="fill-primary" />
              </g>
            )}
          </svg>

          <div className="mt-5 grid grid-cols-3 gap-px border-t border-border bg-border pt-px">
            {[
              ["Momentum", inst.momentum],
              ["Volatility", inst.volatility],
              ["Breadth", inst.breadth],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-background pt-4">
                <span className="label-tech">{label}</span>
                <p className="mt-2 font-mono text-base">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI summary */}
        <div className="bg-panel p-5 sm:p-6 lg:col-span-3">
          <span className="label-tech">Market regime</span>
          <p className="mt-3 font-mono text-2xl tracking-tight">{inst.regime}</p>

          <div className="mt-8 space-y-4">
            {[
              ["Momentum", inst.momentum],
              ["Volatility", inst.volatility],
              ["Breadth", inst.breadth],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="flex items-baseline justify-between font-mono text-[11px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{value}</span>
                </div>
                <div className="mt-2 h-px bg-border-strong">
                  <div
                    className="h-px bg-primary transition-all duration-700"
                    style={{ width: `${value as number}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <span className="label-tech">AI summary</span>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{inst.summary}</p>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
