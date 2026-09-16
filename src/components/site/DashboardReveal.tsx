import { DashboardPreview } from "@/components/site/DashboardPreview";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { usePrefersReducedMotion, useScrollProgress } from "@/hooks/use-reveal";

/** The dashboard assembles itself as the section scrolls through. */
export function DashboardReveal() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const t = Math.max(0, Math.min(1, (progress - 0.14) / 0.5));
  const stage = reduced ? 7 : Math.round(t * 7);

  return (
    <SectionShell id="platform" className="border-t border-border bg-surface">
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>The platform</Eyebrow>
          <h2 className="display-section mt-7">
            One workspace.
            <span className="block text-muted-foreground">Assembled around you.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Market overview, portfolio, signals, risk and AI research in a single surface. The data
          shown here is demonstrative sample data.
        </p>
      </Reveal>

      <div ref={ref} className="mt-16">
        <DashboardPreview stage={stage} />
      </div>
    </SectionShell>
  );
}
