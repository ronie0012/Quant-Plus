import { useEffect, useState } from "react";
import { MarketField } from "@/components/visuals/MarketField";
import { GhostAction, PrimaryAction } from "@/components/site/primitives";
import { useScrollProgress } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

const headline = ["See the market", "differently."];

export function Hero() {
  const [step, setStep] = useState(0);
  const { ref, progress } = useScrollProgress<HTMLDivElement>();

  useEffect(() => {
    const timers = [120, 320, 520, 900, 1150, 1350].map((delay, i) =>
      window.setTimeout(() => setStep(i + 1), delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const expansion = Math.max(0, Math.min(1, (progress - 0.5) * 2.2));

  return (
    <section ref={ref} className="relative min-h-[100svh] w-full overflow-hidden">
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-[1600ms]",
            step >= 1 ? "opacity-100" : "opacity-0",
          )}
        >
          <MarketField expansion={expansion} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-background" />
        <div className="grid-lines absolute inset-0 opacity-[0.35]" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1400px] flex-col justify-end px-5 pb-16 sm:px-8 lg:px-12 lg:pb-24">
        <div className="max-w-3xl">
          <p
            className={cn(
              "label-tech flex items-center gap-3 transition-all duration-1000",
              step >= 3 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            <span className="h-px w-8 bg-primary" aria-hidden="true" />
            AI-powered market intelligence
          </p>

          <h1 className="display-hero mt-7">
            {headline.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-1">
                <span
                  className={cn(
                    "block transition-all duration-[1100ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
                    step >= 4 ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
                  )}
                  style={{ transitionDelay: `${i * 140}ms` }}
                >
                  {i === 1 ? (
                    <>
                      <span className="text-muted-foreground">differently</span>
                      <span className="text-primary">.</span>
                    </>
                  ) : (
                    line
                  )}
                </span>
              </span>
            ))}
          </h1>

          <p
            className={cn(
              "mt-8 max-w-xl text-base leading-relaxed text-muted-foreground transition-all duration-1000 sm:text-lg",
              step >= 5 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            Quant Plus combines real-time market data, quantitative signals and AI analysis into one
            intelligent research platform.
          </p>

          <div
            className={cn(
              "mt-11 flex flex-wrap items-center gap-3 transition-all duration-1000",
              step >= 6 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            <PrimaryAction to="/auth">Get Started</PrimaryAction>
            <GhostAction to="/platform">Explore Quant Plus</GhostAction>
          </div>
        </div>

        <div
          className={cn(
            "mt-16 flex flex-wrap items-end justify-between gap-6 border-t border-border pt-6 transition-opacity duration-1000",
            step >= 6 ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            {[
              ["Data", "Market ingestion"],
              ["Signals", "Quantitative"],
              ["Intelligence", "AI reasoning"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <span className="label-tech">{k}</span>
                <span className="font-mono text-xs text-subtle">{v}</span>
              </div>
            ))}
          </div>
          <span className="label-tech">Scroll to enter the system</span>
        </div>
      </div>
    </section>
  );
}
