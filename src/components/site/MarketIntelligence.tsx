import { useState } from "react";
import { MarketWave } from "@/components/visuals/MarketWave";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { instruments, series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function MarketIntelligence() {
  const [active, setActive] = useState(3);
  const current = instruments[active] ?? instruments[0]!;

  return (
    <SectionShell id="markets" className="border-t border-border">
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>The market never stops moving</Eyebrow>
          <h2 className="display-section mt-7">
            Thousands of signals.
            <span className="block text-muted-foreground">One clear picture.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Every instrument is normalised into the same structure — price, participation, volatility
          and breadth — so comparison stops being guesswork.
        </p>
      </Reveal>

      <Reveal delay={120} className="mt-16">
        <div className="relative border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-sm tracking-tight">{current.symbol}</span>
              <span className="label-tech hidden sm:inline">{current.name}</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-sm">{current.last}</span>
              <span
                className={cn(
                  "font-mono text-sm",
                  current.change >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {current.change >= 0 ? "+" : ""}
                {current.change.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="h-[260px] sm:h-[340px] lg:h-[420px]">
            <MarketWave
              volatility={current.volatility}
              volume={40 + current.momentum / 2}
              tone={current.change >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
            {[
              ["Momentum", current.momentum],
              ["Volatility", current.volatility],
              ["Breadth", current.breadth],
              ["Regime", current.regime],
            ].map(([label, value], i) => (
              <div
                key={label as string}
                className={cn(
                  "px-4 py-5 sm:px-6",
                  i !== 0 && "border-l border-border",
                  i === 2 && "border-l-0 sm:border-l",
                  i >= 2 && "border-t border-border sm:border-t-0",
                )}
              >
                <span className="label-tech">{label}</span>
                <p className="mt-2 font-mono text-base">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-px grid grid-cols-2 border border-t-0 border-border md:grid-cols-4 lg:grid-cols-8">
          {instruments.map((inst, i) => {
            const spark = series(inst.seed, 26, inst.change >= 0 ? 0.5 : -0.4);
            return (
              <li key={inst.symbol} className="border-border [&:not(:first-child)]:border-l">
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-pressed={active === i}
                  className={cn(
                    "group flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors duration-500",
                    active === i ? "bg-panel" : "hover:bg-panel/60",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] tracking-[0.12em] uppercase">
                      {inst.symbol}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        inst.change >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {inst.change >= 0 ? "+" : ""}
                      {inst.change.toFixed(2)}
                    </span>
                  </span>
                  <svg viewBox="0 0 120 28" className="h-7 w-full" aria-hidden="true">
                    <path
                      d={toPath(spark, 120, 28)}
                      fill="none"
                      strokeWidth="1"
                      className={cn(
                        "transition-opacity duration-500",
                        active === i ? "opacity-100" : "opacity-45",
                        inst.change >= 0 ? "stroke-positive" : "stroke-negative",
                      )}
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </SectionShell>
  );
}
