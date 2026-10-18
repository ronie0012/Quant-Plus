import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MarketField } from "@/components/visuals/MarketField";
import { GhostAction, PrimaryAction } from "@/components/site/primitives";
import { Magnetic } from "@/components/site/Magnetic";
import { usePrefersReducedMotion, useScrollProgress } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

const FIRST_LINE = ["Make", "market", "decisions"];

export function Hero() {
  const [step, setStep] = useState(0);
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const spotlight = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = [120, 320, 520, 1150, 1350, 1550].map((delay, i) =>
      window.setTimeout(() => setStep(i + 1), delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const expansion = Math.max(0, Math.min(1, (progress - 0.5) * 2.2));
  // Content drifts up and fades as the hero scrolls away.
  const exit = reduced ? 0 : Math.max(0, Math.min(1, (progress - 0.5) * 2.4));

  const next = () => {
    const target = ref.current?.nextElementSibling;
    target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="relative min-h-[100svh] w-full overflow-hidden"
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse" || !spotlight.current) return;
        const r = event.currentTarget.getBoundingClientRect();
        spotlight.current.style.setProperty("--sx", `${event.clientX - r.left}px`);
        spotlight.current.style.setProperty("--sy", `${event.clientY - r.top}px`);
        spotlight.current.style.opacity = "1";
      }}
      onPointerLeave={() => {
        if (spotlight.current) spotlight.current.style.opacity = "0";
      }}
    >
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-[1600ms]",
            step >= 1 ? "opacity-100" : "opacity-0",
          )}
        >
          <MarketField expansion={expansion} />
        </div>
        <div
          ref={spotlight}
          className="absolute inset-0 opacity-0 transition-opacity duration-700"
          style={{
            background:
              "radial-gradient(420px circle at var(--sx, 50%) var(--sy, 50%), color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 65%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-background" />
        <div className="grid-lines absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_85%)]" />
      </div>

      <div
        className="relative mx-auto flex min-h-[100svh] w-full max-w-[1400px] flex-col justify-end px-5 pb-16 sm:px-8 lg:px-12 lg:pb-24"
        style={
          exit
            ? {
                transform: `translate3d(0, ${(-exit * 70).toFixed(1)}px, 0)`,
                opacity: 1 - exit * 0.9,
              }
            : undefined
        }
      >
        <div className="max-w-3xl">
          <p
            className={cn(
              "label-tech flex items-center gap-3 transition-all duration-1000",
              step >= 3 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="pulse-ring absolute inset-0 rounded-full bg-primary" />
              <span className="h-2 w-2 rounded-full bg-primary" />
            </span>
            Source-aware market intelligence
          </p>

          <h1
            id="hero-title"
            className="display-hero mt-7"
            aria-label="Make market decisions defensible."
          >
            <span aria-hidden="true" className="block overflow-hidden pb-2">
              {FIRST_LINE.map((word, i) => (
                <span
                  key={word}
                  className="word-rise mr-[0.22em]"
                  style={{ ["--d" as string]: `${560 + i * 90}ms` }}
                >
                  {word}
                </span>
              ))}
            </span>
            <span aria-hidden="true" className="block overflow-hidden pb-2">
              <span className="word-rise" style={{ ["--d" as string]: "860ms" }}>
                <span className="text-signal">defensible</span>
                <span className="text-primary">.</span>
              </span>
            </span>
          </h1>

          <p
            className={cn(
              "mt-8 max-w-xl text-base leading-relaxed text-muted-foreground transition-all duration-1000 sm:text-lg",
              step >= 4 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            Quant Plus brings provider-aware market data, quantitative signals and AI research into
            one decision workspace — with evidence, risk and uncertainty kept visible.
          </p>

          <div
            className={cn(
              "mt-11 flex flex-wrap items-center gap-3 transition-all duration-1000",
              step >= 5 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
          >
            <Magnetic>
              <PrimaryAction to="/auth" className="shadow-[0_18px_50px_-18px_var(--color-primary)]">
                Enter the workspace
              </PrimaryAction>
            </Magnetic>
            <GhostAction to="/platform">See the platform</GhostAction>
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
              ["Data", "Provider-aware"],
              ["Signals", "Quant context"],
              ["Intelligence", "Traceable research"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <span className="label-tech">{k}</span>
                <span className="font-mono text-xs text-subtle">{v}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            className="group flex items-center gap-3 label-tech transition-colors hover:text-foreground"
          >
            Scroll to see the system
            <span
              aria-hidden="true"
              className="relative flex h-9 w-5 justify-center overflow-hidden rounded-full border border-border-strong transition-colors group-hover:border-primary"
            >
              <span className="scroll-cue mt-1 h-2 w-px bg-primary" />
            </span>
            <ArrowDown aria-hidden="true" className="h-3.5 w-3.5 sm:hidden" />
          </button>
        </div>
      </div>
    </section>
  );
}
