import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { formatQuote, useLiveQuotes } from "@/hooks/use-live";
import { instruments, series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function MarketExplorer() {
  const [active, setActive] = useState(3);
  const [hover, setHover] = useState<{ x: number; y: number; index: number; value: number } | null>(
    null,
  );
  const quotes = useLiveQuotes(instruments, { interval: 2600 });
  const inst = instruments[active] ?? instruments[0]!;
  const live = quotes[active];
  const change = live?.change ?? inst.change;
  const last = live?.last ?? Number(inst.last.replace(/,/g, ""));
  const momentum = live?.momentum ?? inst.momentum;

  const points = useMemo(
    () => series(inst.seed, 90, change >= 0 ? 0.45 : -0.4),
    [inst.seed, change >= 0],
  );
  const path = toPath(points, 1000, 320, 12);
  const basePrice = Number(inst.last.replace(/,/g, "")) || 0;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(u * (points.length - 1))));
    const p = points[index] ?? 0;
    setHover({
      x: (index / (points.length - 1)) * 1000,
      y: 12 + (1 - p) * 296,
      index,
      value: basePrice * (0.985 + p * 0.03),
    });
  };

  const metrics: [string, number][] = [
    ["Momentum", momentum],
    ["Volatility", inst.volatility],
    ["Breadth", inst.breadth],
  ];

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

      <Reveal
        delay={100}
        variant="scale"
        className="mt-16 grid gap-px border border-border bg-border lg:grid-cols-12"
      >
        {/* asset list */}
        <ul
          className="bg-background lg:col-span-3"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive(
                (i) =>
                  (i + (e.key === "ArrowDown" ? 1 : -1) + instruments.length) % instruments.length,
              );
            }
          }}
        >
          {instruments.map((item, i) => {
            const q = quotes[i];
            const itemChange = q?.change ?? item.change;
            const isActive = active === i;
            return (
              <li key={item.symbol} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  aria-pressed={isActive}
                  className={cn(
                    "relative flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors duration-500 sm:px-5",
                    isActive ? "bg-panel" : "hover:bg-panel/50",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-0 bottom-0 left-0 w-px origin-top bg-primary transition-transform duration-500",
                      isActive ? "scale-y-100" : "scale-y-0",
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-mono text-[11px] tracking-[0.12em] uppercase">
                      {item.symbol}
                    </span>
                    <span className="truncate text-[11px] text-subtle">{item.name}</span>
                  </span>
                  <AnimatedNumber
                    value={itemChange}
                    signed
                    suffix="%"
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      itemChange >= 0 ? "text-positive" : "text-negative",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        {/* chart */}
        <div className="bg-background p-5 sm:p-6 lg:col-span-6">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-lg tracking-tight">{inst.symbol}</p>
              <p className="label-tech mt-2 truncate">{inst.name}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-lg">
                <AnimatedNumber value={last} />
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-xs",
                  change >= 0 ? "text-positive" : "text-negative",
                )}
              >
                <AnimatedNumber value={change} signed suffix="%" />
              </p>
            </div>
          </div>

          <svg
            viewBox="0 0 1000 320"
            className="mt-6 h-[220px] w-full touch-none sm:h-[300px]"
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
              key={`area-${inst.symbol}`}
              d={`${path} L1000,320 L0,320 Z`}
              className={cn(
                "transition-opacity duration-700",
                change >= 0 ? "fill-positive/8" : "fill-negative/8",
              )}
              stroke="none"
            />
            <path
              key={`line-${inst.symbol}`}
              d={path}
              fill="none"
              strokeWidth="1.5"
              className={cn(
                "animate-draw",
                change >= 0 ? "stroke-positive" : "stroke-negative",
              )}
              style={{ ["--draw-length" as string]: 2600 }}
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
                <circle cx={hover.x} cy={hover.y} r="4" className="fill-primary" />
                <circle cx={hover.x} cy={hover.y} r="10" className="fill-primary/20" />
                <g transform={`translate(${Math.min(830, Math.max(6, hover.x + 12))}, 18)`}>
                  <rect width="160" height="46" className="fill-panel stroke-border-strong" />
                  <text x="10" y="19" className="fill-subtle font-mono text-[11px]">
                    T-{points.length - hover.index}
                  </text>
                  <text x="10" y="36" className="fill-foreground font-mono text-[13px]">
                    {formatQuote(hover.value)}
                  </text>
                </g>
              </g>
            )}
          </svg>

          <div className="mt-5 grid grid-cols-3 gap-px border-t border-border bg-border pt-px">
            {metrics.map(([label, value]) => (
              <div key={label} className="bg-background pt-4">
                <span className="label-tech">{label}</span>
                <p className="mt-2 font-mono text-base">
                  <AnimatedNumber value={value} decimals={0} />
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* AI summary */}
        <div className="bg-panel p-5 sm:p-6 lg:col-span-3">
          <span className="label-tech">Market regime</span>
          <p key={inst.regime} className="reveal-in mt-3 font-mono text-2xl tracking-tight">
            {inst.regime}
          </p>

          <div className="mt-8 space-y-4">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between font-mono text-[11px]">
                  <span className="text-muted-foreground">{label}</span>
                  <AnimatedNumber value={value} decimals={0} />
                </div>
                <div className="mt-2 h-px bg-border-strong">
                  <div
                    className="h-px bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <span className="label-tech">AI summary</span>
            <p key={inst.symbol} className="reveal-in mt-3 text-[13px] leading-relaxed text-muted-foreground">
              {inst.summary}
            </p>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
