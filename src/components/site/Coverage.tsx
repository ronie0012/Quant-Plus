import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { coverage } from "@/data/market";
import { cn } from "@/lib/utils";

export function Coverage() {
  return (
    <SectionShell className="border-t border-border bg-surface">
      <Reveal className="max-w-2xl">
        <Eyebrow>System capabilities</Eyebrow>
        <h2 className="display-section mt-7">
          What the system
          <span className="block text-muted-foreground">actually does.</span>
        </h2>
        <p className="mt-7 max-w-lg text-sm leading-relaxed text-muted-foreground">
          No performance claims, no invented statistics. Anything not yet live is marked clearly.
        </p>
      </Reveal>

      <ul className="mt-16 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {coverage.map((item, i) => {
          const soon = item.status === "Coming soon";
          return (
            <Reveal
              as="li"
              key={item.label}
              delay={i * 60}
              className="sheen group bg-background p-5 transition-colors duration-500 hover:bg-panel sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="label-tech">{item.label}</span>
                <span
                  className={cn(
                    "border px-2 py-1 font-mono text-[9px] tracking-[0.16em] uppercase",
                    soon
                      ? "border-warning/40 text-warning"
                      : "border-positive/40 text-positive",
                  )}
                >
                  {item.status}
                </span>
              </div>
              <p className={cn("mt-8 font-mono text-lg tracking-tight", soon && "text-subtle")}>
                {item.value}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.note}</p>
            </Reveal>
          );
        })}
      </ul>
    </SectionShell>
  );
}
