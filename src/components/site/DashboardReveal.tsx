import { DashboardPreview } from "@/components/site/DashboardPreview";
import { Eyebrow, SectionShell } from "@/components/site/primitives";

/** A descriptive preview, deliberately separate from account and provider observations. */
export function DashboardReveal() {
  return (
    <SectionShell
      id="platform"
      labelledBy="platform-title"
      className="border-t border-border bg-surface"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>Workspace overview</Eyebrow>
          <h2
            id="platform-title"
            className="mt-5 text-3xl leading-tight tracking-tight sm:text-4xl"
          >
            Know where each task belongs.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          A descriptive preview, not an account snapshot. Explore the three areas below; your own
          values and provider state appear in the terminal.
        </p>
      </div>

      <div className="mt-10">
        <DashboardPreview />
      </div>
    </SectionShell>
  );
}
