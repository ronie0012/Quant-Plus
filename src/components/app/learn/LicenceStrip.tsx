import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/app/cards";
import { ProgressBar } from "@/components/app/pages/workspace";
import { useLicence } from "@/hooks/use-learning";

/** One-line Home reminder of the licence and its next step; hidden once every level is earned. */
export function LicenceStrip() {
  const licence = useLicence();
  if (licence.loading || !licence.next) return null;
  const stage = licence.stages[licence.level]!;
  const pending = licence.next.requirements.find((r) => !r.done);
  const done = licence.next.requirements.filter((r) => r.done).length;
  return (
    <Card>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/50 bg-primary/10 text-[13px] font-semibold text-primary-soft">
          {stage.badge}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Learning · {stage.name} practice licence</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pending ? `Next step: ${pending.label}` : "Ready to level up"}
          </p>
          <div className="mt-2 max-w-sm">
            <ProgressBar value={(done / Math.max(1, licence.next.requirements.length)) * 100} />
          </div>
        </div>
        <Link
          to="/app/$section"
          params={{ section: pending?.section ?? "learn" }}
          aria-label={pending ? `Continue learning: ${pending.label}` : "See learning progress"}
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm font-medium text-primary-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:self-center"
        >
          Continue learning
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
