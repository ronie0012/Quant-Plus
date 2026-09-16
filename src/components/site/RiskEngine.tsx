import { useState } from "react";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { riskMetrics } from "@/data/market";
import { cn } from "@/lib/utils";

const RADIUS = 132;

export function RiskEngine() {
  const [active, setActive] = useState<string | null>(null);
  const current = riskMetrics.find((m) => m.id === active);

  return (
    <SectionShell className="relative border-t border-border" id="risk">
      <div
        className="pointer-events-none absolute inset-0 bg-[oklch(0.1_0.012_265)]"
        aria-hidden="true"
      />
      <div className="relative">
        <Reveal className="max-w-2xl">
          <Eyebrow>Risk engine</Eyebrow>
          <h2 className="display-section mt-7">Know the risk before the signal.</h2>
          <p className="mt-7 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Risk is modelled as a network, not a score. Hover a metric to see which parts of the
            portfolio it touches.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-16 grid gap-px border border-border bg-border lg:grid-cols-2">
          {/* radial network */}
          <div className="relative flex items-center justify-center bg-background p-6 sm:p-10">
            <svg viewBox="-180 -180 360 360" className="h-[300px] w-full max-w-[420px] sm:h-[380px]">
              <circle r={RADIUS} fill="none" strokeWidth="1" className="stroke-border" />
              <circle r={RADIUS * 0.66} fill="none" strokeWidth="1" className="stroke-border" />
              <circle r={RADIUS * 0.33} fill="none" strokeWidth="1" className="stroke-border" />

              {riskMetrics.map((m, i) => {
                const angle = (i / riskMetrics.length) * Math.PI * 2 - Math.PI / 2;
                const r = (m.value / 100) * RADIUS;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                const ex = Math.cos(angle) * RADIUS;
                const ey = Math.sin(angle) * RADIUS;
                const isActive = active === m.id;
                return (
                  <g key={m.id}>
                    <line
                      x1="0"
                      y1="0"
                      x2={ex}
                      y2={ey}
                      strokeWidth="1"
                      className={cn(
                        "transition-all duration-500",
                        isActive ? "stroke-primary" : "stroke-border-strong",
                      )}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={isActive ? 5 : 3.2}
                      className={cn(
                        "transition-all duration-500",
                        isActive ? "fill-primary" : active ? "fill-subtle" : "fill-primary-soft",
                      )}
                    />
                  </g>
                );
              })}

              <polygon
                points={riskMetrics
                  .map((m, i) => {
                    const angle = (i / riskMetrics.length) * Math.PI * 2 - Math.PI / 2;
                    const r = (m.value / 100) * RADIUS;
                    return `${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`;
                  })
                  .join(" ")}
                className="fill-primary/10 stroke-primary/50"
                strokeWidth="1"
              />
              <circle r="2" className="fill-foreground" />
            </svg>
          </div>

          {/* metric list */}
          <div className="bg-panel">
            <ul>
              {riskMetrics.map((m) => (
                <li key={m.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onMouseEnter={() => setActive(m.id)}
                    onFocus={() => setActive(m.id)}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      "w-full px-5 py-5 text-left transition-colors duration-400 sm:px-8",
                      active === m.id ? "bg-panel-elevated" : "hover:bg-panel-elevated/60",
                    )}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[11px] tracking-[0.2em] uppercase">
                        {m.label}
                      </span>
                      <span className="font-mono text-sm text-primary-soft">{m.value}</span>
                    </div>
                    <div className="mt-3 h-px bg-border-strong">
                      <div
                        className={cn(
                          "h-px transition-all duration-700",
                          active === m.id ? "bg-primary" : "bg-subtle",
                        )}
                        style={{ width: `${m.value}%` }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-h-[112px] border-t border-border px-5 py-6 sm:px-8">
              <span className="label-tech">{current ? "Related exposure" : "Interpretation"}</span>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                {current
                  ? current.note
                  : "Hover any metric to highlight the holdings and sectors it draws from."}
              </p>
              {current && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.related.map((r) => (
                    <span
                      key={r}
                      className="border border-primary/40 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase text-primary-soft"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
