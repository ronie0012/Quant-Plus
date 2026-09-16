import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { useScrollProgress } from "@/hooks/use-reveal";
import { pipelineNodes } from "@/data/market";
import { cn } from "@/lib/utils";

/** Scroll-driven pipeline: the signal travels from raw data to intelligence. */
export function SignalEngine() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
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
            return (
              <li
                key={node.id}
                className={cn(
                  "relative bg-background px-5 py-8 transition-colors duration-700 sm:px-7 sm:py-10",
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
                <div className="flex items-center justify-between">
                  <span className="label-tech">{String(i + 1).padStart(2, "0")}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 transition-all duration-500",
                      active
                        ? "scale-150 bg-primary"
                        : lit
                          ? "bg-primary-soft"
                          : "bg-border-strong",
                    )}
                  />
                </div>
                <p
                  className={cn(
                    "mt-8 font-mono text-sm tracking-[0.14em] uppercase transition-colors duration-700",
                    lit ? "text-foreground" : "text-subtle",
                  )}
                >
                  {node.label}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{node.note}</p>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-px h-24 border border-t-0 border-border bg-background">
          <svg
            viewBox="0 0 1200 96"
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden="true"
          >
            <path
              d="M0,88 C220,88 260,20 480,20 C700,20 740,76 960,76 C1090,76 1150,48 1200,48"
              fill="none"
              strokeWidth="1"
              className="stroke-border-strong"
            />
            <path
              d="M0,88 C220,88 260,20 480,20 C700,20 740,76 960,76 C1090,76 1150,48 1200,48"
              fill="none"
              strokeWidth="1.6"
              className="stroke-primary"
              style={{
                strokeDasharray: 1400,
                strokeDashoffset: 1400 - travel * 1400,
              }}
            />
          </svg>
          <p
            className={cn(
              "absolute right-5 bottom-5 font-mono text-[11px] tracking-[0.24em] uppercase transition-all duration-700 sm:right-8",
              travel > 0.94 ? "text-primary-soft opacity-100" : "text-subtle opacity-40",
            )}
          >
            Market intelligence
          </p>
        </div>
      </div>
    </SectionShell>
  );
}
