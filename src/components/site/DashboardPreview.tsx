import { MarketWave } from "@/components/visuals/MarketWave";
import { instruments, series, toPath } from "@/data/market";
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
            app.quantplus.io / portfolio
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
        {tabs.map((tab, i) => (
          <span
            key={tab}
            className={cn(
              "shrink-0 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] whitespace-nowrap uppercase",
              i === 0 ? "bg-panel text-foreground" : "text-subtle",
            )}
          >
            {tab}
          </span>
        ))}
        <span className="ml-auto hidden px-3 font-mono text-[10px] tracking-[0.16em] text-subtle sm:block">
          Demo data
        </span>
      </div>

      <div className="grid gap-px bg-border lg:grid-cols-3">
        {/* chart */}
        <div className={cn("bg-background p-4 sm:p-5 lg:col-span-2", step(3))}>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="label-tech">Market overview · NIFTY 500</span>
              <p className="mt-2 font-mono text-xl">22,486.95</p>
            </div>
            <span className="font-mono text-sm text-positive">+0.84%</span>
          </div>
          <div className="mt-4 h-[150px] sm:h-[200px]">
            <MarketWave volatility={32} volume={68} tone="positive" />
          </div>
          <div className={cn("mt-4 grid grid-cols-3 gap-px bg-border", step(4))}>
            {[
              ["Portfolio value", "₹12,84,420", ""],
              ["Daily P&L", "+₹18,240", "text-positive"],
              ["Market regime", "Neutral", "text-primary-soft"],
            ].map(([label, value, tone]) => (
              <div key={label} className="bg-background px-3 py-3">
                <span className="label-tech text-[10px]">{label}</span>
                <p className={cn("mt-2 font-mono text-sm", tone)}>{value}</p>
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
            <p className="mt-3 font-mono text-[10px] tracking-[0.16em] text-subtle">
              Confidence 78% · Not advice
            </p>
          </div>

          <div className={cn("bg-background p-4 sm:p-5", step(6))}>
            <span className="label-tech">Signal strength</span>
            <ul className="mt-4 space-y-3">
              {watchlist.map((inst, i) => (
                <li key={inst.symbol} className="flex items-center gap-3">
                  <span className="w-20 font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
                    {inst.symbol}
                  </span>
                  <span className="h-px flex-1 bg-border">
                    <span
                      className={cn(
                        "block h-px transition-[width] duration-[1200ms] ease-out",
                        inst.change >= 0 ? "bg-positive" : "bg-negative",
                      )}
                      style={{
                        width: show(6) ? `${inst.momentum}%` : "0%",
                        transitionDelay: `${i * 110}ms`,
                      }}
                    />
                  </span>
                  <span className="w-7 text-right font-mono text-[10px] text-subtle">
                    {inst.momentum}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* bottom row */}
      <div className={cn("grid gap-px border-t border-border bg-border sm:grid-cols-3", step(7))}>
        <div className="bg-background p-4 sm:p-5">
          <span className="label-tech">Sector performance</span>
          <ul className="mt-4 space-y-2">
            {sectors.map((s) => (
              <li key={s.label} className="flex items-center gap-2 font-mono text-[10px]">
                <span className="w-20 text-muted-foreground">{s.label}</span>
                <span className="relative h-1.5 flex-1 bg-panel">
                  <span
                    className={cn(
                      "absolute top-0 bottom-0 transition-[width] duration-[1200ms] ease-out",
                      s.value >= 0 ? "left-1/2 bg-positive/70" : "right-1/2 bg-negative/70",
                    )}
                    style={{ width: show(7) ? `${Math.abs(s.value) * 26}%` : "0%" }}
                  />
                </span>
                <span className={s.value >= 0 ? "text-positive" : "text-negative"}>
                  {s.value >= 0 ? "+" : ""}
                  {s.value.toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-background p-4 sm:p-5">
          <span className="label-tech">Watchlist</span>
          <ul className="mt-4 space-y-2.5">
            {watchlist.map((inst) => (
              <li key={inst.symbol} className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase">
                  {inst.symbol}
                </span>
                <svg viewBox="0 0 60 14" className="h-3.5 w-16" aria-hidden="true">
                  <path
                    d={toPath(series(inst.seed, 20, inst.change >= 0 ? 0.5 : -0.4), 60, 14)}
                    fill="none"
                    strokeWidth="1"
                    className={inst.change >= 0 ? "stroke-positive" : "stroke-negative"}
                  />
                </svg>
                <span
                  className={cn(
                    "w-12 text-right font-mono text-[10px]",
                    inst.change >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {inst.change >= 0 ? "+" : ""}
                  {inst.change.toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-background p-4 sm:p-5">
          <span className="label-tech">Risk metrics</span>
          <ul className="mt-4 space-y-2.5 font-mono text-[10px]">
            {[
              ["Exposure", "82%"],
              ["Correlation", "0.64"],
              ["Volatility", "32"],
              ["Drawdown", "-4.1%"],
              ["Concentration", "58%"],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
