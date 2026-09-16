import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { useCountUp } from "@/hooks/use-live";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { exposure, series, toPath } from "@/data/market";
import { cn } from "@/lib/utils";

const W = 900;
const H = 240;
const PAD = 10;

const bandClass = ["bg-primary", "bg-primary-soft", "bg-positive/70", "bg-border-strong"];

export function PortfolioIntelligence() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const [band, setBand] = useState<number | null>(null);

  const curve = useMemo(() => series(101, 90, 0.55), []);
  const line = toPath(curve, W, H, PAD);
  const value = useCountUp(1284420, { active: inView, duration: 1600 });
  const pnl = useCountUp(18240, { active: inView, duration: 1600 });

  const peak = curve.indexOf(Math.max(...curve));
  const trough = curve.indexOf(Math.min(...curve));
  const point = (i: number) => ({
    x: (i / (curve.length - 1)) * W,
    y: PAD + (1 - (curve[i] ?? 0)) * (H - PAD * 2),
  });

  const cursor = hover === null ? null : point(hover);
  const cursorValue = hover === null ? null : 1180000 + (curve[hover] ?? 0) * 130000;

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

      <Reveal
        delay={100}
        className="mt-16 grid gap-px border border-border bg-border lg:grid-cols-12"
      >
        <div ref={ref} className="bg-background p-5 sm:p-8 lg:col-span-7">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <span className="label-tech">Portfolio value</span>
              <p className="display-mono-xl mt-3">
                ₹
                <AnimatedNumber value={Math.round(value)} decimals={0} locale="en-IN" />
              </p>
            </div>
            <div>
              <span className="label-tech">Today's P&amp;L</span>
              <p className="mt-3 font-mono text-2xl text-positive">
                +₹
                <AnimatedNumber value={Math.round(pnl)} decimals={0} locale="en-IN" />
              </p>
            </div>
            <div>
              <span className="label-tech">Risk</span>
              <p className="mt-3 flex items-center gap-2 font-mono text-2xl text-warning">
                <span className="h-1.5 w-1.5 animate-pulse bg-warning" aria-hidden="true" />
                Moderate
              </p>
            </div>
          </div>

          <div
            className="relative mt-10"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const t = (e.clientX - rect.left) / rect.width;
              setHover(
                Math.max(0, Math.min(curve.length - 1, Math.round(t * (curve.length - 1)))),
              );
            }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-[200px] w-full sm:h-[240px]"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75].map((g) => (
                <line
                  key={g}
                  x1="0"
                  y1={PAD + g * (H - PAD * 2)}
                  x2={W}
                  y2={PAD + g * (H - PAD * 2)}
                  className="stroke-border"
                  strokeWidth="1"
                  strokeDasharray="3 6"
                />
              ))}

              <path
                d={`${line} L${W},${H} L0,${H} Z`}
                fill="url(#equity-fill)"
                style={{ opacity: inView ? 1 : 0, transition: "opacity 1.2s ease-out 0.4s" }}
              />
              <path
                d={line}
                fill="none"
                strokeWidth="1.6"
                className="stroke-primary"
                style={{
                  strokeDasharray: 3000,
                  strokeDashoffset: inView || reduced ? 0 : 3000,
                  transition: reduced ? undefined : "stroke-dashoffset 2s ease-out",
                }}
              />

              {[trough, peak].map((i, k) => {
                const p = point(i);
                return (
                  <g key={k} opacity={inView ? 1 : 0} style={{ transition: "opacity .8s ease 1.4s" }}>
                    <circle cx={p.x} cy={p.y} r="3" className="fill-background stroke-primary" strokeWidth="1.2" />
                  </g>
                );
              })}

              {cursor && (
                <g>
                  <line
                    x1={cursor.x}
                    y1="0"
                    x2={cursor.x}
                    y2={H}
                    className="stroke-border-strong"
                    strokeWidth="1"
                  />
                  <circle cx={cursor.x} cy={cursor.y} r="3.4" className="fill-primary" />
                </g>
              )}
            </svg>

            <div className="mt-3 flex items-center justify-between font-mono text-[10px] num-tabular text-subtle">
              <span>90 sessions</span>
              <span className={cn(cursorValue !== null && "text-muted-foreground")}>
                {cursorValue === null
                  ? "Hover the curve for a session value"
                  : `₹${Math.round(cursorValue).toLocaleString("en-IN")}`}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-panel p-5 sm:p-8 lg:col-span-5">
          <span className="label-tech">Exposure</span>
          <div className="mt-5 flex h-2 w-full overflow-hidden" onMouseLeave={() => setBand(null)}>
            {exposure.map((e, i) => (
              <span
                key={e.label}
                onMouseEnter={() => setBand(i)}
                className={cn(
                  "h-2 transition-all duration-700 ease-out",
                  bandClass[i],
                  band !== null && band !== i && "opacity-40",
                )}
                style={{ width: inView ? `${e.weight}%` : "0%" }}
              />
            ))}
          </div>
          <ul className="mt-6 space-y-3">
            {exposure.map((e, i) => (
              <li
                key={e.label}
                onMouseEnter={() => setBand(i)}
                onMouseLeave={() => setBand(null)}
                className={cn(
                  "flex items-baseline justify-between border-b border-border pb-3 font-mono text-[12px] transition-colors duration-300",
                  band === i && "text-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("h-1.5 w-1.5", bandClass[i])} aria-hidden="true" />
                  <span className={cn("transition-colors", band === i ? "text-foreground" : "text-muted-foreground")}>
                    {e.label}
                  </span>
                </span>
                <span className="num-tabular">
                  <AnimatedNumber value={inView ? e.weight : 0} decimals={0} suffix="%" />
                </span>
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
