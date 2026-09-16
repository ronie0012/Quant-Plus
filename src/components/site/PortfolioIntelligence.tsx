import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { exposure, series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

export function PortfolioIntelligence() {
  const curve = series(101, 80, 0.55);

  return (
    <SectionShell className="border-t border-border bg-surface">
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>Portfolio intelligence</Eyebrow>
          <h2 className="display-section mt-7">
            Not more numbers.
            <span className="block text-muted-foreground">An explanation.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Sample portfolio shown for demonstration. Connect holdings to see your own exposure and
          risk.
        </p>
      </Reveal>

      <Reveal delay={100} className="mt-16 grid gap-px border border-border bg-border lg:grid-cols-12">
        <div className="bg-background p-5 sm:p-8 lg:col-span-7">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <span className="label-tech">Portfolio value</span>
              <p className="display-mono-xl mt-3">₹12,84,420</p>
            </div>
            <div>
              <span className="label-tech">Today's P&amp;L</span>
              <p className="mt-3 font-mono text-2xl text-positive">+₹18,240</p>
            </div>
            <div>
              <span className="label-tech">Risk</span>
              <p className="mt-3 font-mono text-2xl text-warning">Moderate</p>
            </div>
          </div>

          <svg viewBox="0 0 900 220" className="mt-10 h-[180px] w-full sm:h-[220px]" aria-hidden="true">
            <path
              d={`${toPath(curve, 900, 220, 8)} L900,220 L0,220 Z`}
              className="fill-primary/8"
              stroke="none"
            />
            <path
              d={toPath(curve, 900, 220, 8)}
              fill="none"
              strokeWidth="1.4"
              className="stroke-primary"
            />
          </svg>
        </div>

        <div className="bg-panel p-5 sm:p-8 lg:col-span-5">
          <span className="label-tech">Exposure</span>
          <div className="mt-5 flex h-2 w-full overflow-hidden">
            {exposure.map((e, i) => (
              <span
                key={e.label}
                className={cn(
                  "h-2",
                  i === 0 && "bg-primary",
                  i === 1 && "bg-primary-soft",
                  i === 2 && "bg-positive/70",
                  i === 3 && "bg-border-strong",
                )}
                style={{ width: `${e.weight}%` }}
              />
            ))}
          </div>
          <ul className="mt-6 space-y-3">
            {exposure.map((e) => (
              <li
                key={e.label}
                className="flex items-baseline justify-between border-b border-border pb-3 font-mono text-[12px]"
              >
                <span className="text-muted-foreground">{e.label}</span>
                <span>{e.weight}%</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 border-t border-border pt-6">
            <span className="label-tech">What this means</span>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Most of the day's gain came from large-cap financials, so the portfolio is currently
              behaving like a bet on that single sector. The 18% cash position keeps drawdown
              contained, but adding more mid-cap exposure would raise correlation rather than
              diversify it.
            </p>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
