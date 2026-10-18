import { DashboardPreview } from "@/components/site/DashboardPreview";
import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { usePrefersReducedMotion, useScrollProgress } from "@/hooks/use-reveal";

/** The dashboard stays readable while the section's progress supplies subtle staging context. */
export function DashboardReveal() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const t = Math.max(0, Math.min(1, (progress - 0.06) / 0.26));
  const stage = reduced ? 7 : Math.ceil(t * 7);

  return (
    <SectionShell
      id="platform"
      labelledBy="platform-title"
      className="border-t border-border bg-surface"
    >
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>The platform</Eyebrow>
          <h2 id="platform-title" className="display-section mt-7">
            One workspace.
            <span className="block text-muted-foreground">Assembled around you.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Market overview, portfolio, signals, risk and AI research in a single surface. This
          overview describes the product; account and market values appear in the local terminal.
        </p>
      </Reveal>

      <div ref={ref} className="mt-16">
        <DashboardPreview stage={stage} />
      </div>

      <div className="mt-6 grid gap-px border border-border bg-border sm:grid-cols-3">
        {[
          ["01", "Source state", "See when a provider is connected before trusting a quote."],
          ["02", "Evidence trail", "Keep research progress, sources and uncertainty in view."],
          ["03", "Risk context", "Review a decision plan before an order can move forward."],
        ].map(([index, title, body]) => (
          <article key={index} className="bg-panel px-5 py-5 sm:px-6">
            <p className="font-mono text-[10px] tracking-[0.18em] text-primary-soft">{index}</p>
            <h3 className="mt-4 text-sm tracking-tight">{title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
