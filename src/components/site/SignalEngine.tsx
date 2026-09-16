import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { usePrefersReducedMotion, useScrollProgress } from "@/hooks/use-reveal";
import { pipelineNodes, series } from "@/data/market";
import { cn } from "@/lib/utils";

const FLOW =
  "M0,88 C220,88 260,20 480,20 C700,20 740,76 960,76 C1090,76 1150,48 1200,48";

/** Deterministic per-stage throughput bars so SSR and client agree. */
const stageBars = pipelineNodes.map((node, i) => series(11 + i * 7, 14, 0.2).map((v) => 0.25 + v * 0.75));
const stageLoad = pipelineNodes.map((_, i) => 62 + ((i * 37) % 34));

/** Scroll-driven pipeline: the signal travels from raw data to intelligence. */
export function SignalEngine() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const travel = Math.max(0, Math.min(1, (progress - 0.18) / 0.6));
  const litCount = travel * pipelineNodes.length;

  return (
    <SectionShell className="border-t border-border bg-surface">
      <Reveal className="max-w-2xl">
        <Eyebrow>Signal engine</Eyebrow>
        <h2 className="display-section mt-7">
          From raw data to
          <span className="block text-muted-foreground">usable signals.</span>
        </h2>
        <p className="mt-7 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Each stage adds context rather than opinion. Nothing reaches the analysis layer until it
          has survived the layer before it.
        </p>
      </Reveal>

      <div ref={ref} className="mt-20">
        <ol className="relative grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {pipelineNodes.map((node, i) => {
            const lit = litCount > i;
            const active = litCount > i && litCount < i + 1.4;
            const bars = stageBars[i] ?? [];
            const load = stageLoad[i] ?? 70;
            return (
              <li
                key={node.id}
                className={cn(
                  "group relative overflow-hidden bg-background px-5 py-7 transition-colors duration-700 sm:px-7 sm:py-8",
                  lit && "bg-panel",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-0 left-0 h-px w-full origin-left transition-transform duration-700",
                    lit ? "scale-x-100 bg-primary" : "scale-x-0 bg-border",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/8 to-transparent transition-opacity duration-700",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="relative flex items-center justify-between">
                  <span className="label-tech">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-[10px] tracking-[0.18em] uppercase transition-colors duration-500",
                        active ? "text-primary-soft" : lit ? "text-subtle" : "text-subtle/60",
                      )}
                    >
                      {active ? "Processing" : lit ? "Ready" : "Queued"}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 transition-all duration-500",
                        active
                          ? "scale-150 animate-pulse bg-primary"
                          : lit
                            ? "bg-primary-soft"
                            : "bg-border-strong",
                      )}
                    />
                  </span>
                </div>

                <p
                  className={cn(
                    "relative mt-7 font-mono text-sm tracking-[0.14em] uppercase transition-colors duration-700",
                    lit ? "text-foreground" : "text-subtle",
                  )}
                >
                  {node.label}
                </p>
                <p className="relative mt-2 text-xs text-muted-foreground">{node.note}</p>

                <div className="relative mt-6 flex h-8 items-end gap-[3px]" aria-hidden="true">
                  {bars.map((b, bi) => (
                    <span
                      key={bi}
                      className={cn(
                        "flex-1 origin-bottom transition-all duration-700 ease-out",
                        lit ? "bg-primary/45 group-hover:bg-primary/70" : "bg-border-strong/50",
                      )}
                      style={{
                        height: `${(lit ? b : 0.12) * 100}%`,
                        transitionDelay: `${bi * 22}ms`,
                      }}
                    />
                  ))}
                </div>

                <div className="relative mt-4 flex items-center justify-between font-mono text-[10px] num-tabular text-subtle">
                  <span>Throughput</span>
                  <span className={lit ? "text-muted-foreground" : undefined}>
                    {lit ? `${load}%` : "—"}
                  </span>
                </div>
                <span className="relative mt-2 block h-px w-full bg-border" aria-hidden="true">
                  <span
                    className="block h-px bg-primary/70 transition-[width] duration-1000 ease-out"
                    style={{ width: `${lit ? load : 0}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-px h-28 overflow-hidden border border-t-0 border-border bg-background">
          <svg
            viewBox="0 0 1200 96"
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="flow-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <line
                key={i}
                x1={(i * 1200) / 8}
                y1="0"
                x2={(i * 1200) / 8}
                y2="96"
                className="stroke-border"
                strokeWidth="1"
                strokeOpacity={0.5}
              />
            ))}

            <path d={`${FLOW} L1200,96 L0,96 Z`} fill="url(#flow-fill)" opacity={travel} />
            <path d={FLOW} fill="none" strokeWidth="1" className="stroke-border-strong" />
            <path
              d={FLOW}
              fill="none"
              strokeWidth="1.6"
              className="stroke-primary"
              style={{
                strokeDasharray: 1400,
                strokeDashoffset: 1400 - travel * 1400,
              }}
            />

            {!reduced &&
              [0, 1, 2].map((i) => (
                <circle key={i} r="2.6" className="fill-primary-soft" opacity={0.9}>
                  <animateMotion
                    dur="5.2s"
                    begin={`${i * 1.7}s`}
                    repeatCount="indefinite"
                    path={FLOW}
                  />
                </circle>
              ))}
          </svg>

          <p
            className={cn(
              "absolute right-5 bottom-5 font-mono text-[11px] tracking-[0.24em] uppercase transition-all duration-700 sm:right-8",
              travel > 0.94 ? "text-primary-soft opacity-100" : "text-subtle opacity-40",
            )}
          >
            Market intelligence
          </p>
          <p className="absolute bottom-5 left-5 font-mono text-[10px] tracking-[0.2em] text-subtle uppercase sm:left-8">
            Raw input
          </p>
        </div>
      </div>
    </SectionShell>
  );
}
