import { useState } from "react";
import { MarketWave } from "@/components/visuals/MarketWave";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { formatQuote, useLiveQuotes } from "@/hooks/use-live";
import { instruments, series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function MarketIntelligence() {
  const [active, setActive] = useState(3);
  const quotes = useLiveQuotes(instruments, { interval: 2200 });
  const current = instruments[active] ?? instruments[0]!;
  const live = quotes[active];
  const last = live?.last ?? Number(current.last.replace(/,/g, ""));
  const change = live?.change ?? current.change;
  const momentum = live?.momentum ?? current.momentum;

  const move = (delta: number) =>
    setActive((i) => (i + delta + instruments.length) % instruments.length);

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

      <Reveal delay={120} variant="scale" className="mt-16">
        <div className="relative border border-border bg-surface">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-baseline gap-4">
              <span className="truncate font-mono text-sm tracking-tight">{current.symbol}</span>
              <span className="label-tech hidden truncate sm:inline">{current.name}</span>
            </div>
            <div className="flex shrink-0 items-baseline gap-4 font-mono text-sm">
              <AnimatedNumber value={last} />
              <AnimatedNumber
                value={change}
                signed
                suffix="%"
                className={change >= 0 ? "text-positive" : "text-negative"}
              />
              <span className="hidden items-center gap-2 sm:flex">
                <span className="h-1.5 w-1.5 animate-pulse bg-positive" aria-hidden="true" />
                <span className="label-tech">Live demo</span>
              </span>
            </div>
          </div>

          <div className="h-[260px] sm:h-[340px] lg:h-[420px]">
            <MarketWave
              volatility={current.volatility}
              volume={40 + momentum / 2}
              tone={change >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
            {[
              ["Momentum", momentum],
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
                <p className="mt-2 font-mono text-base">
                  {typeof value === "number" ? (
                    <AnimatedNumber value={value} decimals={0} />
                  ) : (
                    value
                  )}
                </p>
                {typeof value === "number" && (
                  <span className="mt-3 block h-px w-full bg-border">
                    <span
                      className="block h-px bg-primary transition-[width] duration-700 ease-out"
                      style={{ width: `${value}%` }}
                    />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <ul
          className="mt-px grid grid-cols-2 border border-t-0 border-border md:grid-cols-4 lg:grid-cols-8"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              move(1);
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {instruments.map((inst, i) => {
            const q = quotes[i];
            const instChange = q?.change ?? inst.change;
            const spark = series(inst.seed, 26, instChange >= 0 ? 0.5 : -0.4);
            const isActive = active === i;
            return (
              <li key={inst.symbol} className="border-border [&:not(:first-child)]:border-l">
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-pressed={isActive}
                  className={cn(
                    "group relative flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors duration-500",
                    isActive ? "bg-panel" : "hover:bg-panel/60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-0 left-0 h-px w-full origin-left bg-primary transition-transform duration-500",
                      isActive ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] tracking-[0.12em] uppercase">
                      {inst.symbol}
                    </span>
                    <AnimatedNumber
                      value={instChange}
                      signed
                      className={cn(
                        "font-mono text-[11px]",
                        instChange >= 0 ? "text-positive" : "text-negative",
                      )}
                    />
                  </span>
                  <svg viewBox="0 0 120 28" className="h-7 w-full" aria-hidden="true">
                    <path
                      d={toPath(spark, 120, 28)}
                      fill="none"
                      strokeWidth="1"
                      className={cn(
                        "transition-all duration-500",
                        isActive ? "opacity-100" : "opacity-45 group-hover:opacity-80",
                        instChange >= 0 ? "stroke-positive" : "stroke-negative",
                      )}
                    />
                  </svg>
                  <span className="font-mono text-[10px] num-tabular text-subtle">
                    {formatQuote(q?.last ?? Number(inst.last.replace(/,/g, "")))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </SectionShell>
  );
}
