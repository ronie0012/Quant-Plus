import { useState } from "react";
import { MarketWave } from "@/components/visuals/MarketWave";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { instruments, series, toPath } from "@/data/market";
import { formatQuote, useLiveQuotes } from "@/hooks/use-live";
import { cn } from "@/lib/utils";

const tabs = ["Portfolio", "Markets", "Research", "Signals", "AI Analyst"];

const sectors = [
  { label: "Financials", value: 1.42 },
  { label: "Technology", value: 1.08 },
  { label: "Energy", value: 0.34 },
  { label: "Consumer", value: -0.22 },
  { label: "Healthcare", value: -0.51 },
  { label: "Materials", value: 0.16 },
];

const risk = [
  { label: "Exposure", value: 82, display: "82%", fill: 82 },
  { label: "Correlation", value: 0.64, display: "0.64", fill: 64 },
  { label: "Volatility", value: 32, display: "32", fill: 32 },
  { label: "Drawdown", value: -4.1, display: "-4.1%", fill: 41 },
  { label: "Concentration", value: 58, display: "58%", fill: 58 },
];

const watchlist = instruments.slice(0, 5);

/**
 * Progressive dashboard assembly. `stage` 0–7 reveals frame → nav → chart →
 * metrics → AI insight → signals → portfolio → complete.
 */
export function DashboardPreview({
  stage = 7,
  className,
}: {
  stage?: number;
  className?: string;
}) {
  const [tab, setTab] = useState(0);
  const [hoverSector, setHoverSector] = useState<number | null>(null);
  const quotes = useLiveQuotes(watchlist, { interval: 2600 });
  const indexQuote = quotes[3];
  const indexLast = indexQuote?.last ?? 22486.95;
  const indexChange = indexQuote?.change ?? 0.84;

  const show = (n: number) => stage >= n;
  /**
   * Fades a panel's *contents* rather than the panel itself, so the frame and
   * hairline grid stay intact while the interface assembles.
   */
  const step = (n: number) =>
    cn(
      "[&>*]:transition-all [&>*]:duration-[900ms] [&>*]:[transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
      show(n) ? "[&>*]:translate-y-0 [&>*]:opacity-100" : "[&>*]:translate-y-3 [&>*]:opacity-0",
    );

  return (
    <div
      className={cn(
        "relative w-full border border-border bg-surface transition-all duration-1000",
        show(1) ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {/* browser frame */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="h-2 w-2 rounded-full bg-border-strong" />
        </div>
        <div className="ml-2 flex-1 border border-border px-3 py-1">
          <span className="font-mono text-[10px] tracking-[0.14em] text-subtle">
            app.quantplus.io / {(tabs[tab] ?? "portfolio").toLowerCase().replace(/\s+/g, "-")}
          </span>
        </div>
      </div>

      {/* product nav */}
      <div
        className={cn(
          "flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]",
          step(2),
        )}
      >
        {tabs.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(i)}
            onMouseEnter={() => setTab(i)}
            aria-pressed={tab === i}
            className={cn(
              "relative shrink-0 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] whitespace-nowrap uppercase transition-colors duration-300",
              tab === i ? "bg-panel text-foreground" : "text-subtle hover:text-muted-foreground",
            )}
          >
            {t}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-0 bottom-0 h-px origin-left bg-primary transition-transform duration-300",
                tab === i ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-2 px-3 font-mono text-[10px] tracking-[0.16em] text-subtle sm:flex">
          <span className="h-1.5 w-1.5 animate-pulse bg-positive" aria-hidden="true" />
          Demo data
        </span>
      </div>

      <div className="grid gap-px bg-border lg:grid-cols-3">
        {/* chart */}
        <div className={cn("bg-background p-4 sm:p-5 lg:col-span-2", step(3))}>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="label-tech">Market overview · NIFTY 500</span>
              <p className="mt-2 font-mono text-xl">
                <AnimatedNumber value={indexLast} />
              </p>
            </div>
            <span
              className={cn(
                "font-mono text-sm",
                indexChange >= 0 ? "text-positive" : "text-negative",
              )}
            >
              <AnimatedNumber value={indexChange} signed suffix="%" />
            </span>
          </div>
          <div className="mt-4 h-[150px] sm:h-[200px]">
            <MarketWave volatility={32} volume={68} tone={indexChange >= 0 ? "positive" : "negative"} />
          </div>
          <div className={cn("mt-4 grid grid-cols-3 gap-px bg-border", step(4))}>
            {[
              ["Portfolio value", "₹12,84,420", ""],
              ["Daily P&L", "+₹18,240", "text-positive"],
              ["Market regime", "Neutral", "text-primary-soft"],
            ].map(([label, value, tone]) => (
              <div
                key={label}
                className="group bg-background px-3 py-3 transition-colors duration-300 hover:bg-panel"
              >
                <span className="label-tech text-[10px]">{label}</span>
                <p className={cn("mt-2 font-mono text-sm num-tabular", tone)}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* side column */}
        <div className="grid gap-px bg-border">
          <div className={cn("bg-background p-4 sm:p-5", step(5))}>
            <span className="label-tech">AI insight</span>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Breadth is improving while volatility stays compressed. Exposure is concentrated in
              financials — a rotation out of the sector would matter most to this portfolio.
            </p>
            <div className="mt-4">
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-subtle">
                <span>Confidence 78% · Not advice</span>
              </div>
              <span className="mt-2 block h-px w-full bg-border" aria-hidden="true">
                <span
                  className="block h-px bg-primary/70 transition-[width] duration-[1400ms] ease-out"
                  style={{ width: show(5) ? "78%" : "0%" }}
                />
              </span>
            </div>
          </div>

          <div className={cn("bg-background p-4 sm:p-5", step(6))}>
            <span className="label-tech">Signal strength</span>
            <ul className="mt-4 space-y-3">
              {watchlist.map((inst, i) => {
                const q = quotes[i];
                const mom = Math.round(q?.momentum ?? inst.momentum);
                const up = (q?.change ?? inst.change) >= 0;
                return (
                  <li key={inst.symbol} className="group flex items-center gap-3">
                    <span className="w-20 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase transition-colors group-hover:text-foreground">
                      {inst.symbol}
                    </span>
                    <span className="h-px flex-1 bg-border">
                      <span
                        className={cn(
                          "block h-px transition-[width,background-color] duration-[1200ms] ease-out",
                          up ? "bg-positive" : "bg-negative",
                        )}
                        style={{
                          width: show(6) ? `${mom}%` : "0%",
                          transitionDelay: `${i * 110}ms`,
                        }}
                      />
                    </span>
                    <span className="w-7 text-right font-mono text-[10px] num-tabular text-subtle">
                      {mom}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* bottom row */}
      <div className={cn("grid gap-px border-t border-border bg-border sm:grid-cols-3")}>
        <div className={cn("bg-background p-4 sm:p-5", step(7))}>
          <span className="label-tech">Sector performance</span>
          <ul className="mt-4 space-y-2" onMouseLeave={() => setHoverSector(null)}>
            {sectors.map((s, i) => (
              <li
                key={s.label}
                onMouseEnter={() => setHoverSector(i)}
                className={cn(
                  "flex items-center gap-2 font-mono text-[10px] transition-opacity duration-300",
                  hoverSector !== null && hoverSector !== i && "opacity-50",
                )}
              >
                <span className="w-20 text-muted-foreground">{s.label}</span>
                <span className="relative h-1.5 flex-1 bg-panel">
                  <span
                    className="absolute top-0 bottom-0 left-1/2 w-px bg-border-strong"
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "absolute top-0 bottom-0 transition-[width] duration-[1200ms] ease-out",
                      s.value >= 0 ? "left-1/2" : "right-1/2",
                      s.value >= 0
                        ? hoverSector === i
                          ? "bg-positive"
                          : "bg-positive/70"
                        : hoverSector === i
                          ? "bg-negative"
                          : "bg-negative/70",
                    )}
                    style={{ width: show(7) ? `${Math.abs(s.value) * 26}%` : "0%" }}
                  />
                </span>
                <span
                  className={cn("num-tabular", s.value >= 0 ? "text-positive" : "text-negative")}
                >
                  {s.value >= 0 ? "+" : ""}
                  {s.value.toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn("bg-background p-4 sm:p-5", step(7))}>
          <span className="label-tech">Watchlist</span>
          <ul className="mt-4 space-y-2.5">
            {watchlist.map((inst, i) => {
              const q = quotes[i];
              const change = q?.change ?? inst.change;
              const up = change >= 0;
              const spark = series(inst.seed, 20, up ? 0.5 : -0.4);
              return (
                <li
                  key={inst.symbol}
                  className="group flex items-center justify-between gap-3 transition-colors duration-300"
                >
                  <span className="font-mono text-[10px] tracking-[0.1em] uppercase">
                    {inst.symbol}
                  </span>
                  <span className="hidden font-mono text-[10px] num-tabular text-subtle md:block">
                    {formatQuote(q?.last ?? Number(inst.last.replace(/,/g, "")))}
                  </span>
                  <svg viewBox="0 0 60 14" className="h-3.5 w-16" aria-hidden="true">
                    <path
                      d={`${toPath(spark, 60, 14)} L60,14 L0,14 Z`}
                      className={up ? "fill-positive/12" : "fill-negative/12"}
                    />
                    <path
                      d={toPath(spark, 60, 14)}
                      fill="none"
                      strokeWidth="1"
                      className={cn(
                        "transition-opacity duration-300 group-hover:opacity-100",
                        up ? "stroke-positive" : "stroke-negative",
                        "opacity-80",
                      )}
                      style={{
                        strokeDasharray: 120,
                        strokeDashoffset: show(7) ? 0 : 120,
                        transition: "stroke-dashoffset 1.2s ease-out",
                        transitionDelay: `${i * 90}ms`,
                      }}
                    />
                  </svg>
                  <span
                    className={cn(
                      "w-12 text-right font-mono text-[10px]",
                      up ? "text-positive" : "text-negative",
                    )}
                  >
                    <AnimatedNumber value={change} signed suffix="%" />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={cn("bg-background p-4 sm:p-5", step(7))}>
          <span className="label-tech">Risk metrics</span>
          <ul className="mt-4 space-y-2.5 font-mono text-[10px]">
            {risk.map((m, i) => (
              <li key={m.label} className="group border-b border-border pb-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground transition-colors group-hover:text-foreground">
                    {m.label}
                  </span>
                  <span className="num-tabular">{m.display}</span>
                </div>
                <span className="mt-1.5 block h-px w-full bg-border" aria-hidden="true">
                  <span
                    className={cn(
                      "block h-px transition-[width] duration-[1200ms] ease-out",
                      m.value < 0 ? "bg-negative/70" : "bg-primary/70",
                    )}
                    style={{
                      width: show(7) ? `${m.fill}%` : "0%",
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
