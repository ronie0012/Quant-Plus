import { useEffect, useState } from "react";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { useCountUp, useTypewriter } from "@/hooks/use-live";
import { analystSteps } from "@/data/market";
import { cn } from "@/lib/utils";

const drivers = [
  { label: "Sector rotation", weight: 34 },
  { label: "Institutional flows", weight: 27 },
  { label: "Momentum expansion", weight: 22 },
  { label: "Volatility compression", weight: 17 },
];

export function AIAnalyst() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);
  const typed = useTypewriter("“Why is NIFTY 500 moving today?”", { active: inView, speed: 34 });

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStage(analystSteps.length + 1);
      return;
    }
    const timers = Array.from({ length: analystSteps.length + 1 }, (_, i) =>
      window.setTimeout(() => setStage(i + 1), 420 + i * 520),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [inView, reduced]);

  const complete = stage > analystSteps.length;
  const confidence = useCountUp(78, { active: complete, duration: 1200 });

  return (
    <SectionShell id="ai-analyst" className="border-t border-border">
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>AI market analyst</Eyebrow>
          <h2 className="display-section mt-7">Ask the market.</h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          The analyst shows its working: which data it pulled, what it checked, and how confident it
          is. It describes conditions — it does not predict outcomes.
        </p>
      </Reveal>

      <div ref={ref} className="mt-16 grid gap-px border border-border bg-border lg:grid-cols-5">
        <div className="bg-surface p-5 sm:p-8 lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <span className="label-tech">Session · Market analysis</span>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5",
                  complete ? "bg-positive" : "animate-pulse bg-primary",
                )}
                aria-hidden="true"
              />
              <span className="label-tech">{complete ? "Complete" : "Processing"}</span>
            </span>
          </div>

          <div className="mt-8">
            <span className="label-tech">User</span>
            <p className="mt-3 min-h-[2.2em] text-lg leading-snug sm:text-2xl">
              {typed.text}
              <span
                aria-hidden="true"
                className={cn(
                  "ml-1 inline-block h-[1em] w-[2px] translate-y-[0.12em] bg-primary",
                  typed.done ? "opacity-0" : "animate-pulse",
                )}
              />
            </p>
          </div>

          <ul className="mt-9 space-y-3">
            {analystSteps.map((step, i) => {
              const done = stage > i + 1;
              const running = stage === i + 1;
              return (
                <li
                  key={step}
                  className={cn(
                    "flex items-center gap-3 font-mono text-xs transition-all duration-700",
                    stage > i ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-px w-6 transition-colors duration-500",
                      done ? "bg-positive" : running ? "bg-primary" : "bg-border-strong",
                    )}
                  />
                  <span className={done ? "text-muted-foreground" : "text-foreground"}>
                    {step}
                    {running ? "…" : ""}
                  </span>
                  {done && <span className="ml-auto text-[10px] text-subtle">OK</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className={cn(
            "bg-panel p-5 transition-all duration-1000 sm:p-8 lg:col-span-2",
            complete ? "opacity-100" : "opacity-30",
          )}
        >
          <span className="label-tech">Market regime</span>
          <p className="display-mono-xl mt-3">Neutral</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Risk-On / <span className="text-foreground">Neutral</span> / Risk-Off
          </p>

          <div className="mt-9">
            <span className="label-tech">Key drivers</span>
            <ul className="mt-4 space-y-3">
              {drivers.map((d, i) => (
                <li key={d.label}>
                  <div className="flex items-baseline justify-between font-mono text-[11px]">
                    <span>{d.label}</span>
                    <span className="text-subtle">{d.weight}%</span>
                  </div>
                  <div className="mt-2 h-px w-full bg-border">
                    <div
                      className="h-px bg-primary transition-all duration-1000"
                      style={{
                        width: complete ? `${d.weight * 2.6}%` : "0%",
                        transitionDelay: `${i * 120}ms`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-9 flex items-end justify-between border-t border-border pt-6">
            <div>
              <span className="label-tech">Confidence</span>
              <p className="mt-2 font-mono text-2xl num-tabular text-primary-soft">
                {Math.round(confidence)}%
              </p>
            </div>
            <p className="max-w-[55%] text-[11px] leading-relaxed text-subtle">
              Analysis of current conditions. Not investment advice or a forecast.
            </p>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
